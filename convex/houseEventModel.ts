import { v, Infer } from 'convex/values';

export const eventSource = v.object({
  type: v.union(v.literal('worldStep'), v.literal('agentMessage'), v.literal('visitorMock'), v.literal('legacy')),
  id: v.string(),
  generation: v.optional(v.number()),
  conversationId: v.optional(v.string()),
  operationId: v.optional(v.string()),
  requestId: v.optional(v.string()),
});
export type EventSource = Infer<typeof eventSource>;
export type EventEvidence = { participants: string[]; source: EventSource; at: number; simulated?: boolean };

export function eventParticipants(actor: string, participants: string[]) {
  return [...new Set([actor, ...participants])].sort();
}

// A committed engine generation identifies a transition even when the clock changes on retry.
export function stepEventKey(generation: number, actor: string, kind: string) {
  return `step:${generation}:${actor}:${kind}`;
}
