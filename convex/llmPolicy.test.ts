import { allowed, llmConfig, periods, reserveCost, tokenBound } from './llmPolicy';
import { boundedContext, personaPrompt, publicPrompt } from './llmPrompt';
import { structuredInstruction } from './cognitionProposal';

const env = { HOUSE_LLM_BASE_URL: 'https://example.test/v1', HOUSE_LLM_MODEL:'fake', HOUSE_LLM_INPUT_CNY_PER_MILLION: '2', HOUSE_LLM_OUTPUT_CNY_PER_MILLION: '8',
  HOUSE_LLM_PRICE_CONFIRMED:'1', HOUSE_LLM_BILLING_MODE:'token', HOUSE_LLM_USAGE_TRUST:'reported' };
test('上海跨日与跨月使用新额度，边界总额包含预留', () => {
  expect(periods(Date.parse('2026-10-31T16:00:00Z'))).toEqual({ day: '2026-11-01', month: '2026-11' });
  expect(allowed({ spent: 29_000_000, reserved: 900_000, calls: 1 }, 100_000, 30_000_000, 100)).toBe(true);
  expect(allowed({ spent: 29_000_000, reserved: 900_000, calls: 1 }, 100_001, 30_000_000, 100)).toBe(false);
  expect(allowed({ spent: 0, reserved: 0, calls: 120 }, 1, 1_000_000, 120)).toBe(false);
});

test('结构化协议在长历史之后提醒；裁剪保留最新用户输入和来源块', () => {
  const latest='这是最后的问题';
  const messages=boundedContext('系统'+structuredInstruction,[...Array.from({length:25},()=>({role:'assistant' as const,content:'中'.repeat(2000)})),{role:'user',content:latest}], '实际来源块');
  expect(messages.at(-1)?.role).toBe('system');expect(messages.at(-2)?.content).toBe(latest);
  expect(messages[1].content).toContain('实际来源块');expect(tokenBound(messages)).toBeLessThanOrEqual(27000);
});
test('配置缺价拒绝调用，30元月上限及输出并发硬上限不可绕过', () => {
  for (const changes of [{ HOUSE_LLM_MONTHLY_CNY: '31' }, { HOUSE_LLM_MAX_OUTPUT_TOKENS: '2049' },
    { HOUSE_LLM_CONCURRENCY: '3' }, { HOUSE_LLM_DAILY_CNY: 'NaN' }, { HOUSE_LLM_TIMEOUT_MS: '90001' },
    { HOUSE_LLM_INPUT_CNY_PER_MILLION: '-1' }, { HOUSE_LLM_BASE_URL: 'http://example.com' },
    { HOUSE_LLM_BASE_URL: 'https://secret@example.com' }]) expect(() => llmConfig({ ...env, ...changes })).toThrow('config');
  expect(() => llmConfig({})).toThrow('config');
  expect(llmConfig(env).monthlyLimit).toBe(30_000_000);
  expect(llmConfig({ ...env, HOUSE_LLM_MAX_OUTPUT_TOKENS: '2048' }).maxTokens).toBe(2048);
  expect(llmConfig({ ...env, HOUSE_LLM_TEST_ONLY: '1', HOUSE_LLM_BASE_URL: 'http://127.0.0.1:8765' }).fixture).toBe(true);
  expect(() => llmConfig({ ...env, HOUSE_LLM_TEST_ONLY: '1', HOUSE_LLM_BASE_URL: 'http://localhost:8765' })).toThrow();
});
test('中文与表情用字节保守预留，且包含最高输出与安全系数', () => {
  const messages = [{ role: 'user' as const, content: '你好🌿' }];
  expect(tokenBound(messages)).toBe(266);
  expect(reserveCost(messages, llmConfig(env))).toBe((266 * 2 + 256 * 8) * 2);
});
test('三位居民使用不同中文人格，不把世界活动当模型动作', () => {
  const prompts = [0, 1, 2].map(i => personaPrompt(i, '在书架阅读', true));
  expect(new Set(prompts).size).toBe(3);
  expect(prompts[0]).toContain('逻辑分析'); expect(prompts[1]).toContain('创造力'); expect(prompts[2]).toContain('提问');
  for (const p of prompts) { expect(p).toContain('简体中文'); expect(p).toContain('私人会话'); }
  const pub = publicPrompt(0, '在客厅', '桃桃', [{ role: 'user', content: '我们一起画风的形状吧。' }], 'continue');
  expect(pub.some(m => m.content.includes('画风的形状'))).toBe(true);
  expect(pub[0].content).toContain('不知道任何屋主私聊');
});
test('上下文限制长度与条数，仍保留最近一条消息', () => {
  const context = boundedContext('系统', Array.from({ length: 100 }, (_, i) => ({ role: 'user' as const, content: `${i}:` + '中'.repeat(8000) })));
  expect(context.length).toBeLessThanOrEqual(21);
  expect(context.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(7002);
  expect(context.at(-1)!.content).toHaveLength(2800);
});
