import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { v } from 'convex/values';
import { internalMutation, query, MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { allowed, llmConfig, periods, MICRO, costForBound } from './llmPolicy';
import { modelEvidence, type ModelEvidence } from './llmEvidence';
import { modelTiming, PUBLIC_HTTP_TIMEOUT_MS } from './llmTiming';
import { requireOwner } from './owner';
import { grantAvailable, grantLimits } from './llmGrant';
import { liveMode, unlimitedDev, localRuntime } from './llmDev';

// Internal admin only; no amendment/reset path. Existing grants cannot be enlarged.
export const authorizeDebug = internalMutation({ args: { key: v.string() }, handler: async (ctx, { key }) => {
  if (!/^stage51-debug-[a-zA-Z0-9-]{8,80}$/.test(key)) throw new Error('invalid');
  if (await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', key)).unique()) throw new Error('duplicate');
  return await ctx.db.insert('llmRealTests', { key, calls: 0, committed: 0, expires: Date.now() + 6 * 60 * 60 * 1000,
    maxCalls: 50, maxCommitted: 10 * MICRO, requestReserve: 200000 });
} });
export const debugPublicWindow = internalMutation({ args: { key: v.string(), open: v.boolean() }, handler: async (ctx, { key, open }) => {
  const run = await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', key)).unique();
  if (!run || run.maxCalls !== 50 || !grantAvailable(run, Date.now())) throw new Error('budget');
  await ctx.db.patch(run._id, open ? { publicUntil: Date.now() + 480000, publicStart: run.calls } : { publicUntil: 0 });
} });
export const retireDebug = internalMutation({ args: { key: v.string() }, handler: async (ctx, { key }) => {
  const run = await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', key)).unique();
  if (!run || run.maxCalls !== 50) throw new Error('invalid');
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  if (control?.active) throw new Error('concurrency');
  // End this authorization without refunding or resetting any request or cost.
  await ctx.db.patch(run._id, { expires: Math.min(run.expires, Date.now()), publicUntil: 0 });
} });

async function bucket(ctx: MutationCtx, period: string) {
  const existing = await ctx.db.query('llmBudgets').withIndex('period', q => q.eq('period', period)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert('llmBudgets', { period, spent: 0, reserved: 0, calls: 0, inputTokens: 0, outputTokens: 0, uncertain: 0 });
  return (await ctx.db.get(id))!;
}
export const reserve = internalMutation({
  args: { key: v.string(), scope: v.union(v.literal('private'), v.literal('public')), inputBound: v.number() },
  handler: async (ctx, args) => {
    if (args.key.startsWith('private:') && args.key.split(':').length >= 3) {
      const receipt = ctx.db.normalizeId('privateRequests', args.key.split(':')[1]);
      const r = receipt ? await ctx.db.get(receipt) : null;
      if (!r || !await currentRecord(ctx, r.worldId, r.at) || r.status !== 'running') return { error: 'expired' };
    } else if (args.key.startsWith('public:') && args.key.split(':').length >= 4) {
      const worldId = ctx.db.normalizeId('worlds', args.key.split(':')[1]);
      if (worldId && await resetAt(ctx, worldId)) {
        const world = await ctx.db.get(worldId);
        const conversation = world?.conversations.find(c => c.isTyping?.messageUuid === args.key.split(':')[2]);
        if (!conversation || !await currentRecord(ctx, worldId, conversation.created)) return { error: 'expired' };
      }
    }
    if (!liveMode(process.env)) return { error: 'disabled' };
    let c;
    try {
      c = llmConfig(process.env);
      const timeoutMs = args.scope === 'public' ? Math.min(c.timeoutMs, PUBLIC_HTTP_TIMEOUT_MS) : c.timeoutMs;
      c = { ...c, timeoutMs, ...modelTiming(timeoutMs) };
    } catch { return { error: 'config' }; }
    if ((!c.fixture && process.env.HOUSE_LLM_PAID_ENABLED !== '1') || !process.env.HOUSE_LLM_API_KEY) return { error: 'disabled' };
    if (!Number.isSafeInteger(args.inputBound) || args.inputBound < 1 || args.inputBound > 30000) return { error: 'invalid' };
    if (await ctx.db.query('llmAttempts').withIndex('key', q => q.eq('key', args.key)).unique()) return { error: 'duplicate' };
    const controlKey = c.fixture ? 'fixture' : 'global';
    let control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', controlKey)).unique();
    const now = Date.now();
    if (control?.paused) return { error: 'paused' };
    if (args.scope === 'public' && process.env.HOUSE_LLM_AUTONOMOUS_ENABLED !== '1') return { error: 'disabled' };
    // Operator sets this identifier only after a finite paid-test authorization.
    // Lifetime cap survives restarts and date changes; every retry consumes a slot.
    const realTest = !c.fixture && !c.unlimitedDev ? process.env.HOUSE_LLM_REAL_TEST : undefined;
    let testRun;
    if (realTest) {
      testRun = await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', realTest)).unique();
      if (!testRun) {
        const id = await ctx.db.insert('llmRealTests', { key: realTest, calls: 0, committed: 0, expires: now + 2 * 60 * 60 * 1000 });
        testRun = (await ctx.db.get(id))!;
      }
      if (!grantAvailable(testRun, now)) return { error: 'budget' };
      // Autonomous debugging also has a server-enforced 8-minute / 8-call window.
      // A crashed operator process cannot leave paid background exchanges running.
      if (testRun.maxCalls === 50 && args.scope === 'public' && args.key.startsWith('public:') &&
          ((testRun.publicUntil ?? 0) <= now || testRun.calls - (testRun.publicStart ?? 0) >= 8)) return { error: 'disabled' };
      // Unknown relay charges: full client reserve, never fabricated token usage.
      c = { ...c, concurrency: 1, uncertainReserve: grantLimits(testRun).requestReserve, billingMode: 'unknown' as const, priceConfirmed: false, usagePolicy: 'untrusted' as const };
    }
    if (!control) {
      const id = await ctx.db.insert('llmControl', { key: controlKey, active: 0, windowAt: now, windowCalls: 0 });
      control = (await ctx.db.get(id))!;
    }
    if (control.circuit === 'network' && (control.cooldownUntil ?? Infinity) <= now) {
      await ctx.db.patch(control._id, { circuit: undefined, cooldownUntil: undefined, failureStreak: 0 });
      control = { ...control, circuit: undefined };
    }
    if (control.circuit) return { error: 'circuit' };
    if (control.active >= c.concurrency) return { error: 'concurrency' };
    const windowCalls = now - control.windowAt >= 60000 ? 0 : control.windowCalls;
    if (windowCalls >= 6) return { error: 'concurrency' };
    const { day, month } = periods(now);
    const cost = costForBound(args.inputBound, c);
    const prefix = c.fixture ? 'fixture:' : '';
    const daily = await bucket(ctx, `${prefix}day:${day}`), monthly = await bucket(ctx, `${prefix}month:${month}`);
    if (!c.unlimitedDev && (!allowed(daily, cost, c.dailyLimit, c.dailyCalls) || !allowed(monthly, cost, c.monthlyLimit, c.monthlyCalls))) return { error: 'budget' };
    if (testRun) await ctx.db.patch(testRun._id, { calls: testRun.calls + 1, committed: testRun.committed + cost });
    for (const b of [daily, monthly]) await ctx.db.patch(b._id, { reserved: b.reserved + cost, calls: b.calls + 1 });
    await ctx.db.patch(control._id, { active: control.active + 1, windowCalls: windowCalls + 1,
      windowAt: windowCalls === 0 ? now : control.windowAt });
    const id = await ctx.db.insert('llmAttempts', { ...args, day, month, model: c.model, at: now,
      expires: now + c.leaseMs, status: 'reserved', reserve: cost, inputPrice: c.inputPrice, outputPrice: c.outputPrice, maxTokens: c.maxTokens, fixture: c.fixture,
      protocol: c.protocol, timeoutMs: c.timeoutMs, usagePolicy: c.usagePolicy, billingMode: c.billingMode, priceConfirmed: c.priceConfirmed,
      unlimitedDev: c.unlimitedDev,
      ...(realTest ? { realTest } : {}) });
    await ctx.scheduler.runAfter(c.leaseMs + 1000, internal.llmLedger.expire, { id });
    return { id, config: c };
  },
});

async function settleAttempt(ctx: MutationCtx, id: Id<'llmAttempts'>,
  result: { success: boolean; inputTokens?: number; outputTokens?: number; error?: string; evidence?: ModelEvidence }, expired = false) {
  const a = await ctx.db.get(id);
  if (!a || a.status !== 'reserved') return false;
  expired = expired || a.expires <= Date.now();
  const known = !expired && a.usagePolicy !== 'untrusted' && Number.isSafeInteger(result.inputTokens) && result.inputTokens! >= 0 &&
    Number.isSafeInteger(result.outputTokens) && result.outputTokens! >= 0;
  // Uncertain requests (including timeouts/5xx) consume the full reservation; never refund blindly.
  const chargeByTokens = known && (a.priceConfirmed ?? true) && (a.billingMode ?? 'token') === 'token';
  const cost = chargeByTokens ? Math.ceil(result.inputTokens! * a.inputPrice + result.outputTokens! * a.outputPrice) : a.reserve;
  const mismatch = known && (result.inputTokens! > a.inputBound || result.outputTokens! > a.maxTokens || cost > a.reserve);
  const usageAlarm = result.evidence?.usageState === 'over_limit';
  const prefix = a.fixture ? 'fixture:' : '';
  for (const period of [`${prefix}day:${a.day}`, `${prefix}month:${a.month}`]) {
    const b = await bucket(ctx, period);
    await ctx.db.patch(b._id, { reserved: Math.max(0, b.reserved - a.reserve), spent: b.spent + cost,
      inputTokens: b.inputTokens + (known ? result.inputTokens! : 0), outputTokens: b.outputTokens + (known ? result.outputTokens! : 0),
      uncertain: b.uncertain + (chargeByTokens ? 0 : 1),
      reportedInputTokens: (b.reportedInputTokens ?? 0) + (result.evidence?.reportedInputTokens ?? 0),
      reportedOutputTokens: (b.reportedOutputTokens ?? 0) + (result.evidence?.reportedOutputTokens ?? 0),
      durationMs: (b.durationMs ?? 0) + (result.evidence?.durationMs ?? Math.max(0, Date.now() - a.at)),
      failures: (b.failures ?? 0) + (expired || !result.success || mismatch ? 1 : 0) });
  }
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', a.fixture ? 'fixture' : 'global')).unique();
  if (control) {
    const hard = mismatch || usageAlarm ? 'usage' : ['balance', 'auth'].includes(result.error ?? '') ? result.error : undefined;
    const failureStreak = expired || !result.success ? (control.failureStreak ?? 0) + 1 : 0;
    const network = !hard && failureStreak >= 3;
    await ctx.db.patch(control._id, { active: Math.max(0, control.active - 1), failureStreak,
      ...(hard ? { circuit: hard, cooldownUntil: undefined } : network && !control.circuit ? { circuit: 'network', cooldownUntil: Date.now() + 300000 } : {}) });
  }
  await ctx.db.patch(id, { status: expired ? 'expired' : result.success && !mismatch ? 'success' : 'failed', cost,
    settledAt: Date.now(), usageKnown: known, ...(known ? { inputTokens: result.inputTokens, outputTokens: result.outputTokens } : {}),
    ...((result.error || mismatch || expired) ? { error: expired ? 'expired' : mismatch ? 'invalid' : result.error } : {}),
    ...(result.evidence ? { evidence: result.evidence } : {}) });
  return !expired && !mismatch;
}
export const settle = internalMutation({
  args: { id: v.id('llmAttempts'), success: v.boolean(), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), error: v.optional(v.string()), evidence: v.optional(modelEvidence) },
  handler: async (ctx, { id, ...result }) => await settleAttempt(ctx, id, result),
});
export const expire = internalMutation({ args: { id: v.id('llmAttempts') },
  handler: async (ctx, { id }) => {
    const a = await ctx.db.get(id);
    if (a?.status === 'reserved' && a.expires <= Date.now()) await settleAttempt(ctx, id, { success: false }, true);
  },
});
export const recover = internalMutation({ args: {}, handler: async ctx => {
  const expired = await ctx.db.query('llmAttempts').withIndex('status', q => q.eq('status', 'reserved').lte('expires', Date.now())).take(20);
  for (const a of expired) await settleAttempt(ctx, a._id, { success: false }, true);
} });
export const resetCircuit = internalMutation({ args: { fixture: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  // Operator only, does not reset budgets or refund uncertain requests.
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', args.fixture ? 'fixture' : 'global')).unique();
  if (control) await ctx.db.patch(control._id, { circuit: undefined, cooldownUntil: undefined, failureStreak: 0 });
} });
// Local administrator only. Pausing is a transaction shared by private/public reservations.
export const setPaused = internalMutation({ args: { paused: v.boolean() }, handler: async (ctx, { paused }) => {
  if (!localRuntime(process.env)) throw new Error('仅限原本机后端。');
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  if (control) await ctx.db.patch(control._id, { paused });
  else await ctx.db.insert('llmControl', { key: 'global', active: 0, windowAt: Date.now(), windowCalls: 0, paused });
} });
export const status = query({ args: {}, handler: async ctx => {
  const mode = liveMode(process.env) ? 'live' : 'mock';
  let ready = false;
  try { const c = llmConfig(process.env); ready = !!process.env.HOUSE_LLM_API_KEY && (c.fixture || process.env.HOUSE_LLM_PAID_ENABLED === '1'); } catch { /* no secret exposed */ }
  let dev = false;
  try { dev = unlimitedDev(process.env); } catch { ready = false; }
  const testKey = !dev ? process.env.HOUSE_LLM_REAL_TEST : undefined;
  if (testKey) {
    const run = await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', testKey)).unique();
    if (run && !grantAvailable(run, Date.now())) ready = false;
  }
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  return { mode, ready: mode === 'live' && ready && !control?.paused && !control?.circuit, fixture: process.env.HOUSE_LLM_TEST_ONLY === '1',
    unlimitedDev: dev, paused: control?.paused ?? false, autonomous: process.env.HOUSE_LLM_AUTONOMOUS_ENABLED === '1' };
} });
export const usage = query({ args: {}, handler: async ctx => {
  await requireOwner(ctx);
  const p = periods(Date.now());
  const daily = await ctx.db.query('llmBudgets').withIndex('period', q => q.eq('period', `day:${p.day}`)).unique();
  const monthly = await ctx.db.query('llmBudgets').withIndex('period', q => q.eq('period', `month:${p.month}`)).unique();
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', 'global')).unique();
  const attempts = await ctx.db.query('llmAttempts').order('desc').take(20);
  let dev = false;
  try { dev = unlimitedDev(process.env); } catch { /* invalid config cannot enable development */ }
  const testKey = !dev ? process.env.HOUSE_LLM_REAL_TEST : undefined;
  const testRun = testKey ? await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', testKey)).unique() : null;
  return { day: p.day, month: p.month, daily, monthly, active: control?.active ?? 0, circuit: control?.circuit ?? null,
    unlimitedDev: dev, paused: control?.paused ?? false, autonomous: process.env.HOUSE_LLM_AUTONOMOUS_ENABLED === '1',
    realTest: testKey ? { remainingCalls: testRun ? Math.max(0,grantLimits(testRun).maxCalls-testRun.calls) : 8,
      expires: testRun?.expires ?? null, committed: testRun?.committed ?? 0 } : null,
    currencyUnit: MICRO, attempts: attempts.map(a => ({ at: a.at, scope: a.scope, model: a.model, status: a.status,
      reserve: a.reserve, cost: a.cost, inputTokens: a.inputTokens, outputTokens: a.outputTokens, usageKnown: a.usageKnown, error: a.error, fixture: a.fixture ?? false,
      evidence: a.evidence, billingMode: a.billingMode, priceConfirmed: a.priceConfirmed })) };
} });
