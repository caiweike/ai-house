// Internal operator evidence and local-only fixture probe. No public prompt/ledger export.
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internalAction, internalQuery } from './_generated/server';
import { generate } from './llmGateway';
import { llmConfig, periods } from './llmPolicy';
import { localRuntime, liveMode } from './llmDev';

export const inspect = internalQuery({ args: { key: v.optional(v.string()), fixture: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const p = periods(Date.now()), prefix = args.fixture ? 'fixture:' : '';
  const daily = await ctx.db.query('llmBudgets').withIndex('period', q => q.eq('period', `${prefix}day:${p.day}`)).unique();
  const monthly = await ctx.db.query('llmBudgets').withIndex('period', q => q.eq('period', `${prefix}month:${p.month}`)).unique();
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key', args.fixture ? 'fixture' : 'global')).unique();
  const attempt = args.key ? await ctx.db.query('llmAttempts').withIndex('key', q => q.eq('key', args.key!)).unique() : null;
  const testKey = process.env.HOUSE_LLM_REAL_TEST;
  const realTest = testKey ? await ctx.db.query('llmRealTests').withIndex('key', q => q.eq('key', testKey)).unique() : null;
  return { daily, monthly, control, attempt, realTest };
} });
export const realProbe = internalAction({ args: { key: v.string() }, handler: async (ctx, args): Promise<unknown> => {
  if (!process.env.HOUSE_LLM_REAL_TEST || llmConfig(process.env).fixture) throw new Error('有限真实验收未启用。');
  return await generate(ctx, args.key, 'public', [{ role: 'user', content: '请用一句简体中文介绍你自己。' }]);
} });
export const configuration = internalQuery({ args: {}, handler: () => {
  try {
    const c=llmConfig(process.env), u=new URL(c.url);
    const visible=new Set(['bot','v1','chat','completions','messages','api','openai','anthropic']);
    return { valid:true, mode:liveMode(process.env)?'live':'mock', localRuntime:localRuntime(process.env), unlimitedDev:c.unlimitedDev,
      autonomous:process.env.HOUSE_LLM_AUTONOMOUS_ENABLED==='1',
      clientDailyLimitCNY:c.unlimitedDev?null:c.dailyLimit/1000000, clientMonthlyLimitCNY:c.unlimitedDev?null:c.monthlyLimit/1000000,
      clientDailyCalls:c.unlimitedDev?null:c.dailyCalls,clientMonthlyCalls:c.unlimitedDev?null:c.monthlyCalls,
      paidEnabled:process.env.HOUSE_LLM_PAID_ENABLED==='1', protocol:c.protocol,
      protocolExplicit:!!process.env.HOUSE_LLM_PROTOCOL, requestPathExplicit:!!process.env.HOUSE_LLM_ENDPOINT_PATH,
      providerHost:u.hostname, pathShape:u.pathname.split('/').map(s=>s&&!visible.has(s)?'[tenant]':s).join('/'),
      timeoutMs:c.timeoutMs,leaseMs:c.leaseMs,privateWatchdogMs:c.privateWatchdogMs,
      maxOutputTokens:c.maxTokens, usagePolicy:c.usagePolicy, billingMode:c.billingMode, priceConfirmed:c.priceConfirmed,
    uncertainReserveCNY:c.uncertainReserve/1000000,
      finiteRealTest:!c.unlimitedDev && !!process.env.HOUSE_LLM_REAL_TEST };
  } catch { return { valid:false, localRuntime:localRuntime(process.env) }; }
} });
// Administrator-only, bounded pagination; no prompt, private body, Key or tenant URL.
export const usagePage = internalQuery({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const page = await ctx.db.query('llmAttempts').order('desc').paginate({ ...args.paginationOpts, numItems: Math.min(200,args.paginationOpts.numItems) });
  return { ...page, page: page.page.map(a => ({ id:a._id, at:a.at, scope:a.scope, status:a.status, fixture:a.fixture??false,
    unlimitedDev:a.unlimitedDev??false, cost:a.cost??0, reserve:a.reserve, error:a.error??null,
    durationMs:a.evidence?.durationMs??(a.settledAt ? a.settledAt-a.at : null),
    inputTokens:a.inputTokens??null,outputTokens:a.outputTokens??null,usageKnown:a.usageKnown??false,
    reportedInputTokens:a.evidence?.reportedInputTokens??null,reportedOutputTokens:a.evidence?.reportedOutputTokens??null,
    responseModelId:a.evidence?.responseModelId??null })) };
} });
export const fixtureProbe = internalAction({ args: { key: v.string(), scenario: v.string() }, handler: async (ctx, args): Promise<unknown> => {
  if (!llmConfig(process.env).fixture) throw new Error('本机假接口测试未启用。');
  return await generate(ctx, args.key, 'private', [{ role: 'system', content: '这是本机假接口测试，非真实 AI。' },
    { role: 'user', content: `fixture-scenario:${args.scenario}` }]);
} });
