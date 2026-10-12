import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { stance, beliefValue } from './cognitionSchema';

export const beliefProposal = v.object({ topic: v.string(), stance, confidence: v.number(), position: v.optional(v.string()), reason: v.string(), sources: v.array(v.string()) });
export const proposalIssue = v.union(...['type','fields','topic','stance','confidence','position','reason','sources'].map(s => v.literal(s)));
export const cognitionOutput = v.object({ used: v.array(v.string()), belief: v.optional(beliefProposal), proposalIssue: v.optional(proposalIssue),
  status: v.union(v.literal('structured'), v.literal('plain'), v.literal('invalid_proposal')) });
export type CognitionOutput = Infer<typeof cognitionOutput>;
export type BeliefProposal = Infer<typeof beliefProposal>;
export type BeliefValue = Infer<typeof beliefValue>;

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(k => allowed.includes(k)); }
function references(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 6 && value.every(x => typeof x === 'string' && /^m[1-6]$/.test(x)) && new Set(value).size === value.length; }
export function validBeliefProposal(b: unknown): b is BeliefProposal {
  return !beliefIssue(b);
}
export function beliefIssue(b: unknown): Infer<typeof proposalIssue> | undefined {
  if (!object(b)) return 'type';
  if (!keys(b, ['topic', 'stance', 'confidence', 'position', 'reason', 'sources'])) return 'fields';
  if (typeof b.topic !== 'string' || !b.topic.trim() || b.topic.length > 60) return 'topic';
  if (!['agree','disagree','uncertain'].includes(String(b.stance))) return 'stance';
  if (!Number.isInteger(b.confidence) || Number(b.confidence)<0 || Number(b.confidence)>100) return 'confidence';
  if (b.position !== undefined && (typeof b.position !== 'string' || b.position.trim().length<4 || b.position.length>200 || !/[\u3400-\u9fff]/.test(b.position))) return 'position';
  if (typeof b.reason !== 'string' || b.reason.trim().length<4 || b.reason.length>250) return 'reason';
  if (!references(b.sources) || !b.sources.length) return 'sources';
  return undefined;
}
export function parseCognitionReply(text: string): { text: string; cognition: CognitionOutput } | null {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!raw.startsWith('{')) return { text, cognition: { used: [], status: 'plain' } };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!object(value) || !keys(value, ['reply', 'used', 'belief']) || typeof value.reply !== 'string' ||
    !value.reply.trim() || value.reply.length > 1800 || !/[\u3400-\u9fff]/.test(value.reply)) return null;
  const used = references(value.used) ? value.used : [];
  if (value.belief === null || value.belief === undefined) return { text: value.reply.trim(), cognition: { used, status: 'structured' } };
  const b = value.belief;
  if (!validBeliefProposal(b)) {
    return { text: value.reply.trim(), cognition: { used, status: 'invalid_proposal', proposalIssue: beliefIssue(b) } };
  }
  return { text: value.reply.trim(), cognition: { used, status: 'structured', belief: {
    topic: b.topic.trim(), stance: b.stance as BeliefProposal['stance'], confidence: Number(b.confidence),
    ...(b.position ? { position: b.position.trim() } : {}), reason: b.reason.trim(), sources: b.sources } } };
}

export function boundedBelief(before: BeliefValue | null, proposal: BeliefProposal): BeliefValue | null {
  const confidence = before ? Math.max(0, Math.min(100, Math.max(before.confidence - 10, Math.min(before.confidence + 10, proposal.confidence)))) :
    Math.min(proposal.stance === 'uncertain' ? 30 : 50, proposal.confidence);
  const position = proposal.position?.trim() ?? before?.position;
  const after = { stance: proposal.stance, confidence, ...(position ? { position } : {}) };
  return before && before.stance === after.stance && before.confidence === after.confidence && before.position === after.position ? null : after;
}

export const structuredInstruction = '\n请只输出JSON：{"reply":"自然中文回复","used":[],"belief":null}。reply不使用固定观点句式，约40至90字，不向用户暴露m1等内部别名或JSON字段。used仅列确实引用的记忆别名m1至m6（仅自述使用，不证明内在推理）。只有本次信息确实支持形成或修订主观立场时，belief可为{"topic":"短主题","stance":"agree或disagree或uncertain","confidence":0至100整数,"reason":"简短理由","sources":["m1"]}；来源必须来自提供的记忆别名，优先引用本次具体论据。若已有对应主题，沿用原主题名。reply与belief保持一致：有依据且决定修改立场或确信度时提供建议；若belief为null，就不要声称已修改持久观点或确信度。无充分理由则null，允许保持，不追求改变。不把陈述、猜测或故事变成已证实世界事实，不输出思维链。';
