// Admin-only paginated evidence, not a public/private data export endpoint.
import { internalQuery } from './_generated/server';
import { v } from 'convex/values';

export const page = internalQuery({
  args: { table: v.union(v.literal('privateMessages'), v.literal('privateRequests'), v.literal('houseEvents'),
    v.literal('messages'), v.literal('demoMessages'), v.literal('memories')),
    marker: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db.query(args.table).paginate({ cursor: args.cursor, numItems: 200 });
    return { count: result.page.length, matches: result.page.filter(row => JSON.stringify(row).includes(args.marker)).length,
      cursor: result.continueCursor, isDone: result.isDone };
  },
});
