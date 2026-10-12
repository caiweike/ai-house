import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// Separate from the frequently replaced world snapshot. All old rows remain
// recoverable; the persisted boundary is enforced on the server before limits.
export async function resetAt(ctx: QueryCtx, worldId: Id<'worlds'>): Promise<number> {
  return (await ctx.db.query('houseCognitionEpochs').withIndex('world', q => q.eq('worldId', worldId)).first())?.resetAt ?? 0;
}

export function afterReset(at: number | undefined, boundary: number) {
  return boundary === 0 || (typeof at === 'number' && at > boundary);
}

export async function currentRecord(ctx: QueryCtx, worldId: Id<'worlds'>, at: number | undefined) {
  return afterReset(at, await resetAt(ctx, worldId));
}
