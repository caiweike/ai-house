// Explicitly enabled loopback development tools. Disable before any deployment.
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

function requireLocalTools() {
  if (process.env.HOUSE_STAGE2_TOOLS !== '1' || process.env.HOUSE_MODE === 'live' ||
      process.env.HOUSE_ENVIRONMENT !== 'local-development' ||
      !['http://127.0.0.1:4212', 'http://127.0.0.1:3212'].includes(process.env.CONVEX_CLOUD_URL ?? '') ||
      process.env.HOUSE_ENVIRONMENT !== 'local-development' ||
      !['http://127.0.0.1:4212', 'http://127.0.0.1:3212'].includes(process.env.CONVEX_CLOUD_URL ?? '')) {
    throw new Error('本地验收工具未开启。');
  }
}

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    requireLocalTools();
    const statuses = await ctx.db.query('worldStatus').collect();
    const status = statuses.find((s) => s.isDefault);
    if (!status) throw new Error('没有默认世界');
    const world = await ctx.db.get(status.worldId);
    const engine = await ctx.db.get(status.engineId);
    const latestEvent = await ctx.db.query('houseEvents').withIndex('worldSequence', (q) => q.eq('worldId', status.worldId)).order('desc').first();
    const latestInput = await ctx.db.query('inputs').withIndex('byInputNumber', (q) => q.eq('engineId', status.engineId)).order('desc').first();
    const latestMessage = await ctx.db.query('messages').withIndex('worldMessages', (q) => q.eq('worldId', status.worldId)).order('desc').first();
    return { status, world, engine, latestEvent, latestInputNumber: latestInput?.number ?? -1,
      latestMessage, defaultWorldCount: statuses.filter((s) => s.isDefault).length };
  },
});

export const events = query({
  args: { worldId: v.id('worlds'), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    requireLocalTools();
    return await ctx.db.query('houseEvents').withIndex('worldSequence', (q) => q.eq('worldId', args.worldId))
      .paginate({ cursor: args.cursor, numItems: 200 });
  },
});

// Enrich old records in place, retaining IDs, times, keys, text and sequence numbers.
// The absent historical cause is honestly marked legacy rather than reconstructed.
export const migrateEvents = mutation({
  args: { worldId: v.id('worlds'), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    requireLocalTools();
    const page = await ctx.db.query('houseEvents').withIndex('worldSequence', (q) => q.eq('worldId', args.worldId))
      .paginate({ cursor: args.cursor, numItems: 200 });
    let changed = 0;
    for (const row of page.page) {
      if (row.source && row.participants && row.recordedAt !== undefined) continue;
      await ctx.db.patch(row._id, {
        participants: row.participants ?? [row.actor],
        source: row.source ?? { type: 'legacy', id: row.key },
        recordedAt: row.recordedAt ?? row._creationTime,
      });
      changed++;
    }
    return { changed, isDone: page.isDone, cursor: page.continueCursor };
  },
});

export const recordsPage = query({
  args: { table: v.union(v.literal('messages'), v.literal('demo'), v.literal('events')), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    requireLocalTools();
    const status = await ctx.db.query('worldStatus').filter((q) => q.eq(q.field('isDefault'), true)).unique();
    if (!status) throw new Error('没有默认世界');
    const pagination = { cursor: args.cursor, numItems: 200 };
    if (args.table === 'messages') return await ctx.db.query('messages')
      .withIndex('worldMessages', (q) => q.eq('worldId', status.worldId)).paginate(pagination);
    if (args.table === 'demo') return await ctx.db.query('demoMessages')
      .filter((q) => q.eq(q.field('worldId'), status.worldId)).paginate(pagination);
    return await ctx.db.query('houseEvents')
      .withIndex('worldSequence', (q) => q.eq('worldId', status.worldId)).paginate(pagination);
  },
});
