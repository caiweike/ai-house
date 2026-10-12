import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { normalizeUsername, validPassword } from './ownerPolicy';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      // Public registration/reset is deliberately unavailable. Provision via admin CLI only.
      if (params.flow !== 'signIn' || typeof params.username !== 'string' ||
          typeof params.password !== 'string' || !validPassword(params.password)) {
        throw new ConvexError('仅支持已配置屋主的密码登录。');
      }
      // Password uses profile.email as its account key; no email validation or delivery.
      return { email: normalizeUsername(params.username) };
    },
  })],
  session: { totalDurationMs: 7 * 24 * 60 * 60 * 1000, inactiveDurationMs: 24 * 60 * 60 * 1000 },
  jwt: { durationMs: 15 * 60 * 1000 },
  signIn: { maxFailedAttempsPerHour: 5 },
});
