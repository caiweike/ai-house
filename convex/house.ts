import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const journal = query({
  args: { worldId: v.id('worlds'), playerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const boundary = await resetAt(ctx, args.worldId);
    const events = args.playerId
      ? await ctx.db.query('houseEvents').withIndex('actorAt', (q) => q.eq('worldId', args.worldId).eq('actor', args.playerId!).gt('at', boundary)).order('desc').take(40)
      : await ctx.db.query('houseEvents').withIndex('worldAt', (q) => q.eq('worldId', args.worldId).gt('at', boundary)).order('desc').take(12);
    const messages = await ctx.db.query('messages').withIndex('worldMessages', (q) => q.eq('worldId', args.worldId).gt('_creationTime', boundary)).order('desc').take(150);
    const conversations = await ctx.db.query('archivedConversations').withIndex('worldEnded', (q) => q.eq('worldId', args.worldId).gt('ended', boundary)).order('desc').take(80);
    const world = await ctx.db.get(args.worldId);
    const related = new Set<string>();
    for (const c of conversations) {
      if (!args.playerId || c.participants.includes(args.playerId as any)) related.add(c.id);
    }
    for (const c of world?.conversations ?? []) {
      if (!args.playerId || c.participants.some((p) => p.playerId === args.playerId)) related.add(c.id);
    }
    const demo = args.playerId ? await ctx.db.query('demoMessages').withIndex('actor', (q) =>
      q.eq('worldId', args.worldId).eq('playerId', args.playerId!).gt('at', boundary)).order('desc').take(30) : [];
    return { events, messages: messages.filter((m) => related.has(m.conversationId)).reverse(), demo: demo.reverse() };
  },
});

// Historical public demo records remain readable, but this write path is closed.
export const demoChat = mutation({
  args: { worldId: v.id('worlds'), playerId: v.string(), text: v.string(), requestId: v.string() },
  handler: async () => { throw new Error('公开留言已关闭，请使用屋主私聊。'); },
});
