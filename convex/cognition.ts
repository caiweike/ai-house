import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query, internalMutation } from './_generated/server';
import { currentOwner } from './owner';
import { resident } from './privateChat';
import { projectHouseEvent, projectPrivateMessage, retrieveMemories } from './cognitionStore';

export const memories = query({ args: { worldId: v.id('worlds'), playerId: v.string(), private: v.boolean(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await resident(ctx, args.worldId, args.playerId);
    const owner = await currentOwner(ctx);
    if (args.private && !owner) throw new Error('私人记忆仅向已登录屋主开放。');
    const boundary = await resetAt(ctx, args.worldId);
    return await ctx.db.query('houseMemories').withIndex('scope', q => q.eq('worldId', args.worldId).eq('playerId', args.playerId)
      .eq('scope', args.private ? String(owner!.userId) : 'public').gt('at', boundary)).order('desc').paginate({ ...args.paginationOpts, numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)) });
  } });

export const beliefs = query({ args: { worldId: v.id('worlds'), playerId: v.string(), private: v.boolean() }, handler: async (ctx, args) => {
  await resident(ctx, args.worldId, args.playerId);
  const owner = await currentOwner(ctx);
  if (args.private && !owner) throw new Error('私人观点仅向已登录屋主开放。');
  const boundary = await resetAt(ctx, args.worldId);
  const rows = await ctx.db.query('houseBeliefs').withIndex('scope', q => q.eq('worldId', args.worldId).eq('playerId', args.playerId)
    .eq('scope', args.private ? String(owner!.userId) : 'public')).filter(q => q.gt(q.field('at'), boundary)).take(100);
  return await Promise.all(rows.map(async b => ({ ...b, history: await ctx.db.query('houseBeliefRevisions').withIndex('belief', q => q.eq('beliefId', b._id)).order('desc').take(20) })));
} });

export const beliefHistory = query({ args: { beliefId: v.id('houseBeliefs'), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const b = await ctx.db.get(args.beliefId);
  const owner = await currentOwner(ctx);
  if (!b || !await currentRecord(ctx, b.worldId, b.at) || (b.scope !== 'public' && b.scope !== String(owner?.userId))) throw new Error('无法查看这条记录。');
  await resident(ctx, b.worldId, b.playerId);
  return await ctx.db.query('houseBeliefRevisions').withIndex('belief', q => q.eq('beliefId', b._id)).order('desc')
    .paginate({ ...args.paginationOpts, numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)) });
} });

export const relationships = query({ args: { worldId: v.id('worlds'), playerId: v.string() }, handler: async (ctx, args) => {
  await resident(ctx, args.worldId, args.playerId);
  const boundary = await resetAt(ctx, args.worldId);
  const world = (await ctx.db.get(args.worldId))!;
  return await Promise.all(world.players.filter(p => !p.human && p.id !== args.playerId).map(async p => {
    const r = await ctx.db.query('houseRelationships').withIndex('pair', q => q.eq('worldId', args.worldId).eq('playerId', args.playerId).eq('to', p.id)).unique();
    return { to: p.id, value: r?.value ?? { trust: 50, closeness: 0 }, id: r?._id,
      history: r ? await ctx.db.query('houseRelationshipRevisions').withIndex('relation', q => q.eq('relationshipId', r._id).gt('at', boundary)).order('desc').take(20) : [] };
  }));
} });
export const relationshipHistory = query({ args: { relationshipId: v.id('houseRelationships'), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const r = await ctx.db.get(args.relationshipId);
  if (!r) throw new Error('无法查看这条记录。');
  await resident(ctx, r.worldId, r.playerId);
  const boundary = await resetAt(ctx, r.worldId);
  return await ctx.db.query('houseRelationshipRevisions').withIndex('relation', q => q.eq('relationshipId', r._id).gt('at', boundary)).order('desc')
    .paginate({ ...args.paginationOpts, numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)) });
} });

export const recall = query({ args: { worldId: v.id('worlds'), playerId: v.string(), text: v.string(), private: v.boolean() }, handler: async (ctx, args) => {
  await resident(ctx, args.worldId, args.playerId);
  if (args.text.length > 300) throw new Error('检索文字请保持在三百字以内。');
  const owner = await currentOwner(ctx);
  if (args.private && !owner) throw new Error('私人记忆仅向已登录屋主开放。');
  return retrieveMemories(ctx, args.worldId, args.playerId, args.text, args.private ? owner!.userId : undefined);
} });

export const evidence = query({ args: { memoryId: v.id('houseMemories') }, handler: async (ctx, args) => {
  const m = await ctx.db.get(args.memoryId);
  const owner = await currentOwner(ctx);
  if (!m || !await currentRecord(ctx, m.worldId, m.at) || (m.scope !== 'public' && m.scope !== String(owner?.userId))) throw new Error('无法查看这条记录。');
  await resident(ctx, m.worldId, m.playerId);
  if (m.messageId) {
    const source = await ctx.db.get(m.messageId);
    if (!source || source.ownerId !== owner?.userId || source.worldId !== m.worldId || source.playerId !== m.playerId) throw new Error('无法查看这条记录。');
    return { memory: m, privateMessage: source, event: null, messages: [] };
  }
  const event = m.eventId ? await ctx.db.get(m.eventId) : null;
  if (!event || event.worldId !== m.worldId) throw new Error('无法查看这条记录。');
  const messages = event.source?.conversationId ? await ctx.db.query('messages').withIndex('conversationId', q =>
    q.eq('worldId', m.worldId).eq('conversationId', event.source!.conversationId as any)).take(20) : [];
  return { memory: m, event, privateMessage: null, messages };
} });
export const eventEvidence = query({ args: { eventId: v.id('houseEvents') }, handler: async (ctx, args) => {
  const e = await ctx.db.get(args.eventId);
  if (!e || !await currentRecord(ctx, e.worldId, e.at)) throw new Error('无法查看这条记录。');
  await resident(ctx, e.worldId, e.actor);
  return { event: e, messages: e.source?.conversationId ? await ctx.db.query('messages').withIndex('conversationId', q =>
    q.eq('worldId', e.worldId).eq('conversationId', e.source!.conversationId as any)).take(20) : [] };
} });

// Admin-only, paginated, idempotent historical projection. No LLM, no source rewrites.
export const backfill = internalMutation({ args: { worldId: v.id('worlds'), table: v.union(v.literal('events'), v.literal('private')), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    if (args.table === 'events' && args.cursor === null) {
      const world = await ctx.db.get(args.worldId);
      const players = world?.players.filter(p => !p.human) ?? [];
      for (const from of players) for (const to of players) {
        if (from.id === to.id) continue;
        const existing = await ctx.db.query('houseRelationships').withIndex('pair', q => q.eq('worldId', args.worldId).eq('playerId', from.id).eq('to', to.id)).unique();
        if (!existing) await ctx.db.insert('houseRelationships', { worldId: args.worldId, playerId: from.id, to: to.id, value: { trust: 50, closeness: 0 }, at: 0 });
      }
    }
    const page = args.table === 'events' ? await ctx.db.query('houseEvents').withIndex('worldSequence', q => q.eq('worldId', args.worldId)).paginate({ cursor: args.cursor, numItems: 100 }) :
      await ctx.db.query('privateMessages').filter(q => q.eq(q.field('worldId'), args.worldId)).paginate({ cursor: args.cursor, numItems: 100 });
    for (const row of page.page) {
      if (args.table === 'events') await projectHouseEvent(ctx, row._id as any);
      else await projectPrivateMessage(ctx, row._id as any);
    }
    return { count: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
  } });

export const replayEvents = internalMutation({ args: { ids: v.array(v.id('houseEvents')) }, handler: async (ctx, args) => {
  if (args.ids.length > 20) throw new Error('一次最多回放二十条来源。');
  for (const id of args.ids) await projectHouseEvent(ctx, id);
} });
