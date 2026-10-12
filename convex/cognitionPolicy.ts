export type KnowledgeKind = 'world_event' | 'statement' | 'speculation' | 'fiction';
export const knowledgeLabels: Record<KnowledgeKind, string> = {
  world_event: '已记录的世界事件', statement: '主观陈述，内容未证实', speculation: '猜测，内容未证实', fiction: '虚构或假设内容',
};
// We never infer the truth of model/owner prose. Only a committed world-step is a world fact.
export function classifyStatement(text: string): KnowledgeKind {
  if (/虚构|编造|故事里|假设|想象|童话|小说中/.test(text)) return 'fiction';
  if (/也许|可能|猜测|大概|据说|听说|似乎|推测/.test(text)) return 'speculation';
  return 'statement';
}
// Encode Chinese bigrams as ASCII tokens so the full-text index does not depend on
// vendor-specific Chinese word segmentation. Unigrams support single-character topics.
export function searchTerms(text: string): string[] {
  const normalized = text.toLowerCase().normalize('NFKC').slice(0, 8000);
  const tokens = new Set(normalized.match(/[a-z0-9_]{2,40}/g) ?? []);
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) ?? []) {
    for (let i = 0; i < run.length; i++) {
      tokens.add('u' + run.charCodeAt(i).toString(16));
      if (i + 1 < run.length) tokens.add('b' + run.charCodeAt(i).toString(16) + run.charCodeAt(i + 1).toString(16));
    }
  }
  return [...tokens];
}
export function relevantScore(query: string, memory: { excerpt: string; summary: string; importance: number; at: number }, now: number) {
  const terms = searchTerms(query), haystack = new Set(searchTerms(memory.excerpt + memory.summary));
  const matches = terms.reduce((n, t) => n + (haystack.has(t) ? (t.startsWith('b') ? 3 : 1) : 0), 0);
  return matches * 10 + memory.importance + 2 / (1 + Math.max(0, now - memory.at) / 86400000);
}
// A conservative, auditable grammar. Quoted, speculative, fictional and attributed
// statements do not become beliefs. Owner statements never set resident beliefs.
export function explicitOpinion(text: string) {
  if (classifyStatement(text) !== 'statement' || /[“”"'`]|他说|她说|引用|转述/.test(text)) return null;
  const match = text.match(/(?:^|[\n。！？])关于[「《]([^」》\n]{1,60})[」》][，,：:]\s*我(支持|反对|不确定)(?:[，,]\s*因为([^\n。！？]{4,300}))?[。！？]?(?=$|\n)/);
  if (!match || !match[1].trim() || !match[3]) return null;
  return { topic: match[1].trim(), stance: ({ 支持: 'agree', 反对: 'disagree', 不确定: 'uncertain' } as const)[match[2] as '支持' | '反对' | '不确定'], reason: match[3].trim() };
}
export function nextBelief(before: { stance: 'agree' | 'disagree' | 'uncertain'; confidence: number } | null,
  proposed: 'agree' | 'disagree' | 'uncertain') {
  if (!before) return { stance: proposed, confidence: proposed === 'uncertain' ? 30 : 50 };
  if (before.stance === proposed) return null;
  // The score is a product state, not a calibrated probability.
  return { stance: proposed, confidence: Math.max(20, before.confidence - 10) };
}
export function relationChange(before: { trust: number; closeness: number }, messages: { author: string; text: string }[],
  from: string, to: string, recentChanges: number) {
  // One sentence, one-sided monologues and rapid repetition do not move the graph.
  if (recentChanges >= 3 || messages.filter(m => m.author === from).length < 2 || messages.filter(m => m.author === to).length < 2) return null;
  if (!relationshipContribution(messages, from, to)) return null;
  const after = { trust: Math.min(100, before.trust + 1), closeness: Math.min(100, before.closeness + 1) };
  return after.trust === before.trust && after.closeness === before.closeness ? null : after;
}

export function relationshipContribution(messages: { author: string; text: string }[], from: string, to: string) {
  for (const m of messages) {
    if (m.author !== from || !/谢谢|感谢|有道理|赞同你的/.test(m.text)) continue;
    for (const match of m.text.matchAll(/(?=(核对|纠正|解释|提醒|倾听|帮助|例子|方法)([\u3400-\u9fff]{2,8}))/g)) {
      const phrase = match[1] + match[2].slice(0, 2);
      if (messages.some(other => other.author === to && other.text.includes(phrase))) return phrase;
    }
  }
  return null;
}
