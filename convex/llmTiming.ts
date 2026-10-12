// One source for HTTP deadline, reservation lease and private reply watchdog.
export const MAX_HTTP_TIMEOUT_MS = 90000;
export const PUBLIC_HTTP_TIMEOUT_MS = 60000;
export function modelTiming(timeoutMs: number) {
  return { leaseMs: Math.max(45000, timeoutMs + 30000), privateWatchdogMs: Math.max(90000, 2 * timeoutMs + 45000) };
}
export const PRIVATE_WATCHDOG_MAX_MS = modelTiming(MAX_HTTP_TIMEOUT_MS).privateWatchdogMs;
