import type { ChatMessage } from './llmPolicy';
import { llmConfig } from './llmPolicy';
import { ModelError, parseReply, wireRequest, type ModelReply } from './llmAdapter';
import type { ModelEvidence } from './llmEvidence';
export { ModelError, type ModelReply } from './llmAdapter';
export async function requestModel(config: ReturnType<typeof llmConfig>, key: string, messages: ChatMessage[],
  fetcher: typeof fetch = fetch): Promise<ModelReply> {
  const controller = new AbortController(), started = Date.now();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const e: ModelEvidence = { reason: 'ok', protocol: config.protocol, stage: 'headers', durationMs: 0,
    timeoutMs: config.timeoutMs, maxOutputTokens: config.maxTokens };
  try {
    const wire = wireRequest(config,key,messages);
    const response = await fetcher(config.url,{ method:'POST', redirect:'error', signal:controller.signal,
      headers:wire.headers,body:JSON.stringify(wire.body) });
    e.httpStatus = response.status;
    const media = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    e.mediaType = media?.includes('json') ? 'json' : media === 'text/event-stream' ? 'sse' : media?.includes('html') ? 'html' : media ? 'other' : 'unknown';
    if (!response.ok) {
      e.reason='http_error';
      throw new ModelError(response.status===402?'balance':[401,403].includes(response.status)?'auth':'provider',
        response.status===429||response.status>=500,e);
    }
    if (e.mediaType === 'html' || e.mediaType === 'sse') { e.reason='non_json'; throw new ModelError('invalid',false,e); }
    e.stage='body'; const reader=response.body?.getReader();
    if (!reader) { e.reason='missing_body'; throw new ModelError('invalid',false,e); }
    let raw='',bytes=0; const decoder=new TextDecoder();
    while (true) {
      const chunk=await reader.read(); if (chunk.done) break;
      bytes+=chunk.value.length;
      if (bytes>65536) { await reader.cancel(); e.reason='body_too_large'; throw new ModelError('invalid',false,e); }
      raw+=decoder.decode(chunk.value,{stream:true});
    }
    raw+=decoder.decode(); e.durationMs=Date.now()-started;
    return parseReply(raw,config,e);
  } catch (error) {
    if (error instanceof ModelError) { if (error.evidence) error.evidence.durationMs=Date.now()-started; throw error; }
    e.reason=controller.signal.aborted?'timeout':'network';e.durationMs=Date.now()-started;
    throw new ModelError(controller.signal.aborted?'timeout':'provider',false,e);
  } finally { clearTimeout(timer); }
}
