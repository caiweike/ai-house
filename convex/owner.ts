import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { normalizeUsername } from './ownerPolicy';
import { internalMutation, query, QueryCtx } from './_generated/server';

export async function currentOwner(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.issuer !== process.env.CONVEX_SITE_URL) return null;
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) return null;
  const normalized = ctx.db.normalizeId('authSessions', sessionId);
  if (!normalized) return null;
  const session = await ctx.db.get(normalized);
  if (!session || session.userId !== userId || session.expirationTime <= Date.now()) return null;
  const owner = await ctx.db.query('houseOwners').first();
  return owner?.userId === userId ? owner : null;
}

export async function requireOwner(ctx: QueryCtx) {
  const owner = await currentOwner(ctx);
  if (!owner) throw new ConvexError('请先以屋主身份登录。');
  return owner;
}

export const status = query({ args: {}, handler: async (ctx) => ({ isOwner: !!await currentOwner(ctx) }) });

// Internal/admin only; hash computed locally, plaintext never passed to this mutation.
// Rotation preserves user ID and every private/public historical record.
export const provision = internalMutation({
  args: { username: v.string(), passwordHash: v.string(), rotate: v.boolean() },
  handler: async (ctx, args) => {
    const owner = await ctx.db.query('houseOwners').first();
    if (owner && !args.rotate) throw new ConvexError('屋主已配置；修改密码需显式使用 --rotate。');
    const username = normalizeUsername(args.username);
    if (args.passwordHash.length < 64) throw new ConvexError('账户配置无效。');
    if (owner) {
      const account = await ctx.db.query('authAccounts').withIndex('userIdAndProvider', q =>
        q.eq('userId', owner.userId).eq('provider', 'password')).unique();
      if (!account) throw new ConvexError('屋主账户异常，请检查后台。');
      await ctx.db.patch(account._id, { providerAccountId: username, secret: args.passwordHash });
      await ctx.db.patch(owner.userId, { name: username, email: undefined });
      // Expire all sessions immediately; retain their rows and historical data.
      const sessions = await ctx.db.query('authSessions').withIndex('userId', q => q.eq('userId', owner.userId)).collect();
      for (const session of sessions) await ctx.db.patch(session._id, { expirationTime: 0 });
    } else {
      const userId = await ctx.db.insert('users', { name: username });
      await ctx.db.insert('authAccounts', { userId, provider: 'password', providerAccountId: username, secret: args.passwordHash });
      await ctx.db.insert('houseOwners', { userId, lastSent: 0, day: '', dailyCount: 0 });
    }
    return { configured: true, userId: (await ctx.db.query('houseOwners').first())!.userId };
  },
});
