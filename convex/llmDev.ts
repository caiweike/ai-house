// Fail closed: runtime-owned Convex URLs must point to this local backend.
// Copying the development flag to a hosted/self-hosted production deployment cannot enable it.
export function localRuntime(env: Record<string, string | undefined>) {
  return env.CONVEX_CLOUD_URL === 'http://127.0.0.1:3212' &&
    env.CONVEX_SITE_URL === 'http://127.0.0.1:3213' &&
    !env.CONVEX_DEPLOYMENT?.startsWith('prod:');
}
export function unlimitedDev(env: Record<string, string | undefined>) {
  if (env.HOUSE_LLM_UNLIMITED_DEV !== '1') return false;
  if (!localRuntime(env) || env.HOUSE_ENVIRONMENT !== 'local-development' || env.HOUSE_LLM_TEST_ONLY === '1') throw new Error('config');
  return true;
}
export function liveMode(env: Record<string, string | undefined>) {
  // Invalid development settings still go through the rejecting gateway, never a mock reply.
  return env.HOUSE_LLM_UNLIMITED_DEV === '1' || env.HOUSE_MODE === 'live';
}
