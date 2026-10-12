import type { ChatMessage, llmConfig } from './llmPolicy';
import type { ModelEvidence } from './llmEvidence';
type Config = ReturnType<typeof llmConfig>;
export class ModelError extends Error {
  constructor(public code: string, public retryable = false, public evidence?: ModelEvidence) { super(code); }
}
export type ModelReply = { text: string; inputTokens?: number; outputTokens?: number; usageKnown: boolean; evidence: ModelEvidence };
export function wireRequest(c: Config, key: string, messages: ChatMessage[]): { headers: Record<string,string>; body: Record<string,unknown> } {
  if (c.protocol === 'anthropic-messages') {
    return { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model: c.model, system: messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),
        messages: messages.filter(m=>m.role!=='system'), max_tokens: c.maxTokens, stream: false } };
  }
  const body: Record<string, unknown> = { model: c.model, messages, max_tokens: c.maxTokens, stream: false };
  if (new URL(c.url).hostname === 'api.deepseek.com' || c.fixture) body.thinking = { type: 'disabled' };
  return { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body };
}
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
function count(x: unknown, coerce: boolean): number | undefined {
  const n = coerce && typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}
function finish(x: unknown): ModelEvidence['finishReason'] {
  const allowed = ['stop','length','end_turn','max_tokens','tool_calls','tool_use','content_filter'];
  return typeof x === 'string' && allowed.includes(x) ? x as ModelEvidence['finishReason'] : x == null ? 'missing' : 'unknown';
}
export function parseReply(raw: string, c: Config, evidence: ModelEvidence): ModelReply {
  const e: ModelEvidence = { ...evidence, stage: 'parse' };
  const fail = (reason: ModelEvidence['reason']): never => { e.reason = reason; throw new ModelError('invalid', false, e); };
  let root: any;
  try { root = JSON.parse(raw); } catch { return fail('bad_json'); }
  const data = c.relay && object(root?.data) && !root?.error && !root?.choices && root?.type !== 'message' ? root.data : root;
  if (!object(data)) return fail('protocol_mismatch');
  let content: any, usage: any, toolCalls: any, reason: any;
  if (c.protocol === 'openai-chat') {
    if (data.type === 'message' && Array.isArray(data.content)) return fail('protocol_mismatch');
    e.choicesCount = Array.isArray(data.choices) ? data.choices.length : 0;
    if (!Array.isArray(data.choices) || !data.choices.length) return fail('missing_choices');
    const choice = data.choices.find((x: any)=>x?.index===0) ?? data.choices[0];
    if (!object(choice?.message)) return fail('missing_message');
    content = choice.message.content; toolCalls = choice.message.tool_calls;
    e.reasoningPresent = typeof choice.message.reasoning_content === 'string' && !!choice.message.reasoning_content.trim();
    reason = choice.finish_reason; usage = data.usage;
  } else {
    if (Array.isArray(data.choices)) return fail('protocol_mismatch');
    if (data.type !== 'message' || !Array.isArray(data.content)) return fail('protocol_mismatch');
    content = data.content; toolCalls = data.content.filter((x: any)=>x?.type==='tool_use');
    e.reasoningPresent = data.content.some((x: any)=>x?.type==='thinking'); reason = data.stop_reason; usage = data.usage;
  }
  e.stage = 'validate'; e.finishReason = finish(reason);
  e.truncated = e.finishReason === 'length' || e.finishReason === 'max_tokens';
  e.responseModelMatches = typeof data.model === 'string' ? data.model === c.model : false;
  // Strict identifier grammar excludes whitespace, URLs and arbitrary supplier prose.
  if (typeof data.model === 'string' && /^(?:mimo|claude|muse|deepseek|gpt|o[134])(?:[-/.][a-zA-Z0-9._/-]+)?$/i.test(data.model) && data.model.length <= 120) e.responseModelId = data.model;
  e.responseModelFamily = typeof data.model !== 'string' ? 'missing' : /^mimo(?:-|$)/i.test(data.model) ? 'mimo' :
    /^claude(?:-|$)/i.test(data.model) ? 'claude' : /^muse(?:-|$)/i.test(data.model) ? 'muse' : 'other';
  e.contentType = typeof content === 'string' ? 'string' : Array.isArray(content) ? 'array' : content === null ? 'null' : content === undefined ? 'missing' : 'other';
  e.toolCallCount = Array.isArray(toolCalls) ? toolCalls.length : toolCalls == null ? 0 : 1;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (c.protocol === 'anthropic-messages' && ['thinking','redacted_thinking'].includes(part?.type)) continue;
      if (['text','output_text'].includes(part?.type) && typeof part.text === 'string') text += part.text;
      else if (part?.type !== 'tool_use') return fail('bad_content');
    }
  } else if (content != null) return fail('bad_content');
  e.contentChars = text.length;
  // Reported usage is parsed before text validation, including failed but billable replies.
  const coerce = c.relay;
  let input = count(c.protocol === 'openai-chat' ? usage?.prompt_tokens : usage?.input_tokens, coerce);
  const output = count(c.protocol === 'openai-chat' ? usage?.completion_tokens : usage?.output_tokens, coerce);
  if (c.protocol === 'anthropic-messages' && input !== undefined) {
    for (const field of ['cache_read_input_tokens','cache_creation_input_tokens']) {
      if (usage?.[field] != null) { const extra = count(usage[field], coerce); input = extra === undefined || input === undefined ? undefined : input + extra; }
    }
  }
  if (input !== undefined && !Number.isSafeInteger(input)) input = undefined;
  e.usageState = usage == null ? 'missing' : input === undefined || output === undefined ? 'invalid' : 'reported';
  if (input !== undefined) e.reportedInputTokens = input;
  if (output !== undefined) e.reportedOutputTokens = output;
  const total = usage?.total_tokens, reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  if (input !== undefined && output !== undefined && ((total != null && count(total,coerce) !== input + output) ||
      (reasoning != null && (count(reasoning,coerce) === undefined || count(reasoning,coerce)! > output)))) e.usageState = 'inconsistent';
  if (output !== undefined && output > c.maxTokens) e.usageState = 'over_limit';
  const known = e.usageState === 'reported' && c.usagePolicy === 'reported';
  if (e.usageState === 'reported' && !known) e.usageState = 'untrusted';
  if (e.toolCallCount > 0 || ['tool_calls','tool_use'].includes(e.finishReason ?? '')) return fail('tool_call');
  if (e.finishReason === 'content_filter') return fail('filtered');
  if (!text.trim()) return fail(e.reasoningPresent ? 'reasoning_only' : 'empty_content');
  if (text.length > 4000) return fail('content_too_long');
  if (!/[\u3400-\u9fff]/.test(text)) return fail('non_chinese');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return fail('control_characters');
  if (e.usageState === 'over_limit' && c.usagePolicy === 'reported') return fail('output_limit');
  e.reason = 'ok';
  return { text: text.trim(), usageKnown: known, evidence: e, ...(known ? { inputTokens: input, outputTokens: output } : {}) };
}
