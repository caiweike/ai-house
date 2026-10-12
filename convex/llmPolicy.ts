// Pure configuration/accounting helpers. Money is integer micro-yuan (1 CNY = 1e6).
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export const MICRO = 1_000_000;
import { MAX_HTTP_TIMEOUT_MS, modelTiming } from './llmTiming';
import { unlimitedDev } from './llmDev';
export function periods(now: number) {
  const day = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  return { day, month: day.slice(0, 7) };
}
function number(env: Record<string, string | undefined>, key: string, fallback: number, max: number) {
  const n = Number(env[key] ?? fallback);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new Error('config');
  return n;
}
export function llmConfig(env: Record<string, string | undefined>) {
  const dev = unlimitedDev(env);
  const base = env.HOUSE_LLM_BASE_URL;
  if (!base || !env.HOUSE_LLM_MODEL) throw new Error('config');
  const url = new URL(base);
  // No redirects, URL credentials or arbitrary insecure endpoints. Local fixture is explicit.
  const fixture = env.HOUSE_LLM_TEST_ONLY === '1' && url.hostname === '127.0.0.1' && url.protocol === 'http:';
  if (env.HOUSE_LLM_TEST_ONLY === '1' && !fixture) throw new Error('config');
  if ((!fixture && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) throw new Error('config');
  const protocol = env.HOUSE_LLM_PROTOCOL ?? 'openai-chat';
  if (protocol !== 'openai-chat' && protocol !== 'anthropic-messages') throw new Error('config');
  const relativePath = env.HOUSE_LLM_ENDPOINT_PATH ?? (protocol === 'openai-chat' ? '/chat/completions' : '/v1/messages');
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*(?:chat\/completions|messages)$/.test(relativePath)) throw new Error('config');
  const suffix = protocol === 'openai-chat' ? '/chat/completions' : '/messages';
  if (!relativePath.endsWith(suffix)) throw new Error('config');
  if ((protocol === 'openai-chat' && url.pathname.replace(/\/$/, '').endsWith('/messages')) ||
      (protocol === 'anthropic-messages' && url.pathname.replace(/\/$/, '').endsWith('/chat/completions'))) throw new Error('config');
  // Keep the confirmed tenant path; never guess /v1 or switch provider.
  const endpoint = url.pathname.replace(/\/$/, '').endsWith(suffix) ? base.replace(/\/$/, '') : base.replace(/\/$/, '') + relativePath;
  if (/\.(?:html?|php)$/i.test(url.pathname) || /\/(?:pricing|docs|login)\/?$/i.test(url.pathname)) throw new Error('config');
  const relay = url.hostname === 'ai.lfree.org';
  const usagePolicy = env.HOUSE_LLM_USAGE_TRUST ?? (fixture ? 'reported' : 'untrusted');
  if (usagePolicy !== 'reported' && usagePolicy !== 'untrusted') throw new Error('config');
  const billingMode = env.HOUSE_LLM_BILLING_MODE ?? 'unknown';
  if (!['token', 'request', 'unknown'].includes(billingMode)) throw new Error('config');
  const priceConfirmed = fixture || env.HOUSE_LLM_PRICE_CONFIRMED === '1';
  const inputPrice = number(env, 'HOUSE_LLM_INPUT_CNY_PER_MILLION', 0, 1000);
  const outputPrice = number(env, 'HOUSE_LLM_OUTPUT_CNY_PER_MILLION', 0, 1000);
  const timeoutMs = Math.floor(number(env, 'HOUSE_LLM_TIMEOUT_MS', 60000, MAX_HTTP_TIMEOUT_MS));
  const dailyLimit = Math.floor(number(env, 'HOUSE_LLM_DAILY_CNY', 1, 30) * MICRO);
  return { url: endpoint, model: env.HOUSE_LLM_MODEL, protocol: protocol as 'openai-chat' | 'anthropic-messages', relay, usagePolicy,
    billingMode: fixture ? 'token' : billingMode, priceConfirmed,
    uncertainReserve: Math.ceil(number(env, 'HOUSE_LLM_UNCERTAIN_REQUEST_CNY', dailyLimit / MICRO, 30) * MICRO),
    requestPrice: Math.ceil(number(env, 'HOUSE_LLM_REQUEST_CNY', dailyLimit / MICRO, 30) * MICRO),
    unlimitedDev: dev,
    inputPrice, outputPrice, maxTokens: Math.floor(number(env,
      dev && env.HOUSE_LLM_DEV_MAX_OUTPUT_TOKENS ? 'HOUSE_LLM_DEV_MAX_OUTPUT_TOKENS' : 'HOUSE_LLM_MAX_OUTPUT_TOKENS',
      dev ? 2048 : 256, dev ? 8192 : 2048)),
    timeoutMs, ...modelTiming(timeoutMs),
    concurrency: Math.floor(number(env, 'HOUSE_LLM_CONCURRENCY', 2, 2)),
    dailyLimit,
    monthlyLimit: Math.floor(number(env, 'HOUSE_LLM_MONTHLY_CNY', 30, 30) * MICRO),
    dailyCalls: Math.floor(number(env, 'HOUSE_LLM_DAILY_CALLS', 120, 500)),
    monthlyCalls: Math.floor(number(env, 'HOUSE_LLM_MONTHLY_CALLS', 3000, 10000)), fixture };
}
export function tokenBound(messages: ChatMessage[]) {
  // Byte fallback for tokenizer differences + envelope overhead; deliberately overestimates Chinese.
  return messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length + 128, 128);
}
export function reserveCost(messages: ChatMessage[], config: ReturnType<typeof llmConfig>) {
  return costForBound(tokenBound(messages), config);
}
export function costForBound(inputBound: number, config: ReturnType<typeof llmConfig>) {
  if (!config.priceConfirmed || config.billingMode === 'unknown') return config.uncertainReserve;
  if (config.billingMode === 'request') return config.requestPrice;
  const tokens = Math.ceil((inputBound * config.inputPrice + config.maxTokens * config.outputPrice) * 2);
  return config.usagePolicy === 'untrusted' ? Math.max(tokens, config.uncertainReserve) : tokens;
}
export type Bucket = { spent: number; reserved: number; calls: number };
export function allowed(bucket: Bucket, cost: number, limit: number, calls: number) {
  return bucket.spent + bucket.reserved + cost <= limit && bucket.calls < calls;
}
export const failureText: Record<string, string> = {
  paused: '屋主已暂停新的模型请求。本次没有调用模型，小屋继续规则生活。',
  disabled: '真实模型尚未启用。本次没有调用模型，小屋继续规则生活。',
  config: '模型配置不完整或价格设置无效。本次没有调用模型。',
  budget: '今日或本月模型预算／次数已用完。本次没有生成 AI 回复。',
  concurrency: '模型正在忙，请稍后重新发送。没有生成 AI 回复。',
  circuit: '模型调用已暂停，请屋主检查价格、用量或供应商余额。',
  balance: '供应商余额不足，真实模型已暂停，小屋继续日常活动。',
  timeout: '模型请求超时，费用情况可能不确定，已保守记账。请稍后再试。',
  expired: '请求中断或超时，已结束等待并保守记账。请重新发送。',
  auth: '模型凭据不可用，真实模型已暂停。',
  provider: '模型服务暂时不可用，有限重试后已停止本次请求。',
  invalid: '模型返回内容或用量异常，未将它保存为有效 AI 回复。',
  duplicate: '该模型请求已处理或正在处理中。',
};
