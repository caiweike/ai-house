import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { tokenBound, type ChatMessage } from './llmPolicy';
import { requestModel, ModelError } from './llmTransport';
import { sleep } from './util/sleep';
import { PUBLIC_HTTP_TIMEOUT_MS, modelTiming } from './llmTiming';
import { parseCognitionReply, type CognitionOutput } from './cognitionProposal';

export type GatewayResult = { text: string; model: string; mode: 'live' | 'test'; cognition?: CognitionOutput } | { error: string };
export async function generate(ctx: ActionCtx, key: string, scope: 'private' | 'public', messages: ChatMessage[]): Promise<GatewayResult> {
  const structuredEnabled = process.env.HOUSE_COGNITION_STRUCTURED === '1';
  const maxAttempts = scope === 'public' ? 1 : 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reservation = await ctx.runMutation(internal.llmLedger.reserve, { key: `${key}:${attempt}`, scope, inputBound: tokenBound(messages) });
    if (!reservation.id) return { error: reservation.error ?? 'invalid' };
    const c = reservation.config!;
    const timeoutMs = scope === 'public' ? Math.min(c.timeoutMs, PUBLIC_HTTP_TIMEOUT_MS) : c.timeoutMs;
    const config = { ...c, timeoutMs, ...modelTiming(timeoutMs) };
    let reply;
    try { reply = await requestModel(config, process.env.HOUSE_LLM_API_KEY!, messages); }
    catch (e) {
      const error = e instanceof ModelError ? e : new ModelError('provider');
      await ctx.runMutation(internal.llmLedger.settle, { id: reservation.id, success: false, error: error.code,
        ...(error.evidence ? { evidence: error.evidence } : {}),
        ...(config.usagePolicy === 'reported' && ['reported','over_limit'].includes(error.evidence?.usageState ?? '') ? {
          inputTokens: error.evidence?.reportedInputTokens, outputTokens: error.evidence?.reportedOutputTokens,
        } : {}) });
      if (error.retryable && attempt < maxAttempts) { await sleep(1000); continue; }
      return { error: error.code };
    }
    const accepted = await ctx.runMutation(internal.llmLedger.settle, { id: reservation.id, success: true,
      evidence: reply.evidence,
      ...(reply.usageKnown ? { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens } : {}) });
    if (!accepted) return { error: 'invalid' };
    const structured = structuredEnabled ? parseCognitionReply(reply.text) : { text: reply.text };
    if (!structured) return { error: 'invalid' }; // Settled/counted; no extra request to repair JSON.
    return { ...structured, model: config.model, mode: config.fixture ? 'test' : 'live' };
  }
  return { error: 'provider' };
}
