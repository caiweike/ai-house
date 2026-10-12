// Immutable operator grants; legacy records retain their original eight-call cap.
export type Grant = { calls: number; committed: number; expires: number; maxCalls?: number; maxCommitted?: number; requestReserve?: number };
export function grantLimits(g: Grant) {
  return { maxCalls: g.maxCalls ?? 8, maxCommitted: g.maxCommitted ?? 1_000_000, requestReserve: g.requestReserve ?? 120_000 };
}
export function grantAvailable(g: Grant, now: number) {
  const l = grantLimits(g);
  return g.expires > now && g.calls < l.maxCalls && g.committed + l.requestReserve <= l.maxCommitted;
}
