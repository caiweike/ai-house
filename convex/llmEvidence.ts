import { v, Infer } from 'convex/values';
// Closed diagnostics plus a bounded model identifier: no bodies, errors, headers or chat text.
export const modelEvidence = v.object({
  reason: v.union(...['ok','http_error','non_json','body_too_large','missing_body','bad_json','missing_choices','missing_message',
    'protocol_mismatch','bad_content','empty_content','reasoning_only','non_chinese','content_too_long','control_characters',
    'tool_call','filtered','output_limit','timeout','network'].map(s => v.literal(s))),
  protocol: v.union(v.literal('openai-chat'), v.literal('anthropic-messages')),
  stage: v.union(v.literal('headers'),v.literal('body'),v.literal('parse'),v.literal('validate')),
  durationMs: v.number(), timeoutMs: v.number(), maxOutputTokens: v.number(),
  httpStatus: v.optional(v.number()),
  mediaType: v.optional(v.union(v.literal('json'),v.literal('sse'),v.literal('html'),v.literal('other'),v.literal('unknown'))),
  choicesCount: v.optional(v.number()),
  contentType: v.optional(v.union(v.literal('string'),v.literal('array'),v.literal('null'),v.literal('missing'),v.literal('other'))),
  contentChars: v.optional(v.number()), toolCallCount: v.optional(v.number()), reasoningPresent: v.optional(v.boolean()),
  finishReason: v.optional(v.union(...['stop','length','end_turn','max_tokens','tool_calls','tool_use','content_filter','unknown','missing'].map(s=>v.literal(s)))),
  usageState: v.optional(v.union(...['reported','missing','invalid','inconsistent','untrusted','over_limit'].map(s=>v.literal(s)))),
  reportedInputTokens: v.optional(v.number()), reportedOutputTokens: v.optional(v.number()),
  truncated: v.optional(v.boolean()), responseModelMatches: v.optional(v.boolean()),
  responseModelId: v.optional(v.string()),
  responseModelFamily: v.optional(v.union(v.literal('mimo'),v.literal('claude'),v.literal('muse'),v.literal('other'),v.literal('missing'))),
});
export type ModelEvidence = Infer<typeof modelEvidence>;
