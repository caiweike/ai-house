import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { startEngine, stopEngine } from './aiTown/main';
import { resetAt } from './cognitionEpoch';
import { residents } from '../data/house';

export const maintenance = internalMutation({ args: { worldId: v.id('worlds'), stop: v.boolean() }, handler: async (ctx, args) => {
  const status = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId', args.worldId)).unique();
  if (!status?.isDefault) throw new Error('仅允许原默认小屋。');
  const engine = (await ctx.db.get(status.engineId))!;
  if (args.stop) {
    const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
    if (!control?.paused || control.active !== 0) throw new Error('先暂停模型并等待在途请求结算。');
    await ctx.db.patch(status._id, { status: 'stoppedByDeveloper' });
    if (engine.running) await stopEngine(ctx, args.worldId);
    const world = (await ctx.db.get(args.worldId))!;
    const pending = await ctx.db.query('privateRequests').filter(q => q.and(q.eq(q.field('worldId'), args.worldId), q.or(q.eq(q.field('status'), 'queued'), q.eq(q.field('status'), 'running')))).collect();
    if (pending.length || world.conversations.length || world.agents.some(a => a.inProgressOperation || a.toRemember)) {
      await ctx.db.insert('houseResetCheckpoints', { worldId: args.worldId, at: Date.now(),
        before: { pending: pending.map(r => ({ ...r })), conversations: world.conversations, agents: world.agents } });
      for (const r of pending) await ctx.db.patch(r._id, { status: 'failed', error: 'reset_maintenance' });
      await ctx.db.patch(world._id, { conversations: [], agents: world.agents.map(a => ({ ...a, toRemember: undefined, inProgressOperation: undefined })) });
    }
  } else {
    await ctx.db.patch(status._id, { status: 'running' });
    if (!engine.running) await startEngine(ctx, args.worldId);
  }
} });

// One atomic boundary switch. Never deletes sources or changes model ledgers.
export const commit = internalMutation({ args: { worldId: v.id('worlds'), runId: v.string(), backupHash: v.string() }, handler: async (ctx, args) => {
  const done = await ctx.db.query('houseCognitionResets').withIndex('run', q => q.eq('runId', args.runId)).unique();
  if (done) return { resetAt: done.resetAt, epoch: done.epoch, duplicate: true };
  if (!/^[a-f0-9]{64}$/.test(args.backupHash)) throw new Error('需要已验证备份的SHA256。');
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  const status = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId', args.worldId)).unique();
  const engine = status ? await ctx.db.get(status.engineId) : null;
  if (!control?.paused || control.active !== 0 || !status?.isDefault || status.status !== 'stoppedByDeveloper' || engine?.running) throw new Error('须暂停模型和原引擎且没有在途请求。');
  const world = (await ctx.db.get(args.worldId))!;
  const descriptions = await ctx.db.query('playerDescriptions').withIndex('worldId', q => q.eq('worldId', args.worldId)).take(10);
  const players = world.players.filter(p => !p.human);
  if (players.length !== 3 || !residents.every(r => descriptions.some(d => d.name === r.name && players.some(p => p.id === d.playerId)))) throw new Error('居民身份不符。');
  const epochRow = await ctx.db.query('houseCognitionEpochs').withIndex('world', q => q.eq('worldId', args.worldId)).unique();
  const boundary = Date.now(), epoch = (epochRow?.epoch ?? 0) + 1;
  const relations = await ctx.db.query('houseRelationships').withIndex('pair', q => q.eq('worldId', args.worldId)).collect();
  const pending = await ctx.db.query('privateRequests').filter(q => q.and(q.eq(q.field('worldId'), args.worldId), q.or(q.eq(q.field('status'), 'queued'), q.eq(q.field('status'), 'running')))).collect();
  const before = { relations: relations.map(r => ({ ...r, value: { ...r.value } })), conversations: world.conversations, agents: world.agents, pending };
  await ctx.db.insert('houseCognitionResets', { ...args, resetAt: boundary, epoch, previousAt: epochRow?.resetAt ?? 0, before });
  const patch = { worldId: args.worldId, resetAt: boundary, epoch, runId: args.runId };
  if (epochRow) await ctx.db.patch(epochRow._id, patch); else await ctx.db.insert('houseCognitionEpochs', patch);
  for (const from of players) for (const to of players) {
    if (from.id === to.id) continue;
    const r = relations.find(r => r.playerId === from.id && r.to === to.id);
    const value = { trust: 50, closeness: 0 };
    if (r) await ctx.db.patch(r._id, { value, at: boundary });
    else await ctx.db.insert('houseRelationships', { worldId: args.worldId, playerId: from.id, to: to.id, value, at: boundary });
  }
  for (const r of pending) await ctx.db.patch(r._id, { status: 'failed', error: 'cognition_reset' });
  // Removing operation IDs makes every late public result/queued engine input stale.
  // Preserve stable character IDs, positions, furniture tasks, map and nextId.
  await ctx.db.patch(world._id, { conversations: [], agents: world.agents.map(a => ({ id: a.id, playerId: a.playerId })) });
  return { resetAt: boundary, epoch, duplicate: false };
} });

// Selective rollback before any new life has been recorded. After growth, restore
// from a private backup offline; never silently merge epochs or overwrite budgets.
export const rollback = internalMutation({ args: { runId: v.string() }, handler: async (ctx, args) => {
  const run = await ctx.db.query('houseCognitionResets').withIndex('run', q => q.eq('runId', args.runId)).unique();
  if (!run || run.rolledBack) throw new Error('重置记录不存在或已回滚。');
  const boundary = await resetAt(ctx, run.worldId);
  const status = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId', run.worldId)).unique();
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  if (boundary !== run.resetAt || status?.status !== 'stoppedByDeveloper' || !control?.paused || control.active !== 0) throw new Error('只可回滚最近纪元，且须处于维护暂停。');
  for (const table of ['houseMemories', 'houseBeliefs', 'privateMessages', 'messages', 'houseEvents'] as const) {
    const newRow = await ctx.db.query(table).filter(q => q.and(q.eq(q.field('worldId'), run.worldId), q.gt(q.field('_creationTime'), boundary))).first();
    if (newRow) throw new Error('已有新生活记录，拒绝自动混合；请用离线备份恢复流程。');
  }
  const row = (await ctx.db.query('houseCognitionEpochs').withIndex('world', q => q.eq('worldId', run.worldId)).unique())!;
  await ctx.db.patch(row._id, { resetAt: run.previousAt, epoch: run.epoch - 1, runId: `rollback:${run.runId}` });
  for (const r of run.before.relations) await ctx.db.patch(r._id, { value: r.value, at: r.at });
  // Do not resurrect old pending LLM jobs or interrupted conversations.
  await ctx.db.patch(run._id, { rolledBack: true });
  return { restored: true };
} });
