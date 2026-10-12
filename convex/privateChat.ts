import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, mutation, QueryCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { residents } from '../data/house';
import { requireOwner } from './owner';
import { privateReply } from './privateReply';
import { nextPrivateQuota } from './privatePolicy';
import { internal } from './_generated/api';
import { llmConfig } from './llmPolicy';
import { PRIVATE_WATCHDOG_MAX_MS } from './llmTiming';
import { projectPrivateMessage } from './cognitionStore';
import { liveMode } from './llmDev';

export async function resident(ctx: QueryCtx, worldId: Id<'worlds'>, playerId: string) {
  const status = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId', worldId)).unique();
  const world = await ctx.db.get(worldId);
  const player = world?.players.find(p => p.id === playerId && !p.human);
  if (!status?.isDefault || !player) throw new ConvexError('请选择当前小屋中的居民。');
  const description = await ctx.db.query('playerDescriptions').withIndex('worldId', q =>
    q.eq('worldId', worldId).eq('playerId', player.id)).unique();
  const index = residents.findIndex(r => r.name === description?.name);
  if (index < 0) throw new ConvexError('居民资料未准备好。');
  return index;
}

// No client-supplied owner, author or session ID. Pair is derived server-side.
export const history = query({
  args: { worldId: v.id('worlds'), playerId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await resident(ctx, args.worldId, args.playerId);
    const boundary = await resetAt(ctx, args.worldId);
    return await ctx.db.query('privateMessages').withIndex('thread', q =>
      q.eq('ownerId', owner.userId).eq('worldId', args.worldId).eq('playerId', args.playerId).gt('at', boundary))
      .order('desc').paginate({ ...args.paginationOpts, numItems: Math.min(50, Math.max(1, args.paginationOpts.numItems)) });
  },
});

export const send = mutation({
  args: { worldId: v.id('worlds'), playerId: v.string(), text: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const maintenance = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId', args.worldId)).unique();
    if (maintenance?.status === 'stoppedByDeveloper') throw new ConvexError('小屋正在维护，私信尚未发送。请在恢复运行后重试。');
    const index = await resident(ctx, args.worldId, args.playerId);
    const boundary = await resetAt(ctx, args.worldId);
    const text = args.text.trim();
    if (!text || text.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new ConvexError('请输入一至八千字的有效消息。');
    if (!/^[\w-]{16,80}$/.test(args.requestId)) throw new ConvexError('请求编号无效，请重新发送。');
    const existing = await ctx.db.query('privateRequests').withIndex('request', q =>
      q.eq('ownerId', owner.userId).eq('requestId', args.requestId)).unique();
    if (existing) {
      if (!afterReset(existing.at, boundary)) throw new ConvexError('旧纪元请求编号已归档，请重新发送。');
      if (existing.worldId !== args.worldId || existing.playerId !== args.playerId || existing.text !== text) throw new ConvexError('同一请求编号不能用于不同消息。');
      return { duplicate: true };
    }
    const now = Date.now();
    const pending = await ctx.db.query('privateRequests').withIndex('thread', q =>
      q.eq('ownerId', owner.userId).eq('worldId', args.worldId).eq('playerId', args.playerId).gt('at', boundary)).order('desc').first();
    if (pending?.status === 'queued' || pending?.status === 'running') throw new ConvexError('居民正在回复上一条私信，请稍等。');
    await ctx.db.patch(owner._id, nextPrivateQuota(owner, now));
    const scope = { ownerId: owner.userId, worldId: args.worldId, playerId: args.playerId, requestId: args.requestId };
    const messageId = await ctx.db.insert('privateMessages', { ...scope, role: 'owner', text, at: now, mode: 'user' });
    await projectPrivateMessage(ctx, messageId);
    const live = liveMode(process.env);
    let watchdogMs = PRIVATE_WATCHDOG_MAX_MS;
    try { watchdogMs = llmConfig(process.env).privateWatchdogMs; } catch { /* config error is resolved by worker */ }
    const receipt = await ctx.db.insert('privateRequests', { ...scope, text, at: now,
      mode: live ? 'live' : 'mock', status: live ? 'queued' : 'completed', watchdogMs });
    if (live) {
      await ctx.scheduler.runAfter(0, internal.privateModel.reply, { receipt });
      await ctx.scheduler.runAfter(watchdogMs, internal.privateModel.expire, { receipt });
    } else {
      const reply = privateReply(index);
      await ctx.db.insert('privateMessages', { ...scope, role: 'resident', ...reply, at: now + 1 });
    }
    // Private trace and memory stay in this owner/resident scope; no public writes.
    return { duplicate: false };
  },
});

export const pending = query({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await resident(ctx, args.worldId, args.playerId);
    const boundary = await resetAt(ctx, args.worldId);
    const r = await ctx.db.query('privateRequests').withIndex('thread', q =>
      q.eq('ownerId', owner.userId).eq('worldId', args.worldId).eq('playerId', args.playerId).gt('at', boundary)).order('desc').first();
    return { waiting: r?.status === 'queued' || r?.status === 'running' };
  },
});
