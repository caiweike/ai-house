import { llmConfig } from './llmPolicy';
import { requestModel } from './llmTransport';
const c = llmConfig({ HOUSE_LLM_BASE_URL:'https://api.deepseek.com',HOUSE_LLM_MODEL:'deepseek-flash', HOUSE_LLM_USAGE_TRUST:'reported',
  HOUSE_LLM_PRICE_CONFIRMED:'1',HOUSE_LLM_BILLING_MODE:'token',HOUSE_LLM_INPUT_CNY_PER_MILLION: '2', HOUSE_LLM_OUTPUT_CNY_PER_MILLION: '8' });
const messages = [{ role: 'user' as const, content: '你好' }];
function fake(data: unknown, status = 200) { return (async () => new Response(JSON.stringify(data), { status })) as typeof fetch; }
test('非流式中文响应与包含隐藏输出的供应商usage保留；DeepSeek关闭思考', async () => {
  let sent: any;
  const fetcher = (async (_url, options) => { sent = options; return new Response(JSON.stringify({
    choices: [{ message: { content: '让我们先核对一个小例子。' } }], usage: { prompt_tokens: 20, completion_tokens: 30 } })); }) as typeof fetch;
  expect(await requestModel(c, 'fake-not-a-key', messages, fetcher)).toMatchObject({ text: '让我们先核对一个小例子。', usageKnown: true, inputTokens: 20, outputTokens: 30 });
  expect(JSON.parse(sent.body)).toMatchObject({ max_tokens: 256, stream: false, thinking: { type: 'disabled' } });
  expect(sent.redirect).toBe('error');
});
test('usage缺失或非法标明未知，不伪造Token数量', async () => {
  for (const usage of [undefined, { prompt_tokens: -1, completion_tokens: 20 }, { prompt_tokens: '1', completion_tokens: 2 }]) {
    const r = await requestModel(c, 'fake', messages, fake({ choices: [{ message: { content: '你好，小屋。' } }], usage }));
    expect(r.usageKnown).toBe(false); expect(r.inputTokens).toBeUndefined();
  }
});
test('余额、凭据与限速分类，只有429/5xx允许有限重试', async () => {
  for (const [status, code, retryable] of [[402, 'balance', false], [401, 'auth', false], [429, 'provider', true], [500, 'provider', true], [400, 'provider', false]] as const)
    await expect(requestModel(c, 'fake', messages, fake({ error: 'secret private provider body' }, status))).rejects.toMatchObject({ code, retryable, message: code });
});
test('空白、非中文、工具调用与超大响应均拒绝', async () => {
  for (const content of ['', 'English only', '中'.repeat(4001), '你好\u0000'])
    await expect(requestModel(c, 'fake', messages, fake({ choices: [{ message: { content } }] }))).rejects.toMatchObject({ code: 'invalid' });
  await expect(requestModel(c, 'fake', messages, fake({ choices: [{ message: { content: '你好', tool_calls: [{}] } }] }))).rejects.toMatchObject({ code: 'invalid' });
  await expect(requestModel(c, 'fake', messages, fake({ pad: 'a'.repeat(65537) }))).rejects.toMatchObject({ code: 'invalid' });
});
test('超时能Abort并返回固定脱敏错误', async () => {
  const fetcher = ((_u, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('private prompt'))))) as typeof fetch;
  await expect(requestModel({ ...c, timeoutMs: 20 }, 'fake', messages, fetcher)).rejects.toMatchObject({ code: 'timeout', retryable: false });
});
