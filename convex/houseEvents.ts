import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { roomAt } from '../data/house';
import { eventParticipants, stepEventKey, type EventEvidence } from './houseEventModel';
import { projectHouseEvent } from './cognitionStore';

export async function appendHouseEvent(ctx: MutationCtx, worldId: Id<'worlds'>,
  actor: string, kind: string, text: string, key: string, evidence: EventEvidence) {
  const existing = await ctx.db.query('houseEvents').withIndex('dedupe', (q) => q.eq('worldId', worldId).eq('key', key)).first();
  if (existing) return existing._id;
  const last = await ctx.db.query('houseEvents').withIndex('worldSequence', (q) => q.eq('worldId', worldId)).order('desc').first();
  const id = await ctx.db.insert('houseEvents', { worldId, actor, kind, text, key,
    seq: (last?.seq ?? 0) + 1, at: evidence.at, recordedAt: Date.now(),
    participants: eventParticipants(actor, evidence.participants), source: evidence.source,
    simulated: evidence.simulated ?? (kind === 'message' || kind === 'conversation' || kind === 'conversationEnd') });
  if (['arrival', 'activityEnd', 'conversationEnd', 'message'].includes(kind)) await projectHouseEvent(ctx, id);
  return id;
}

export async function recordHouseChanges(ctx: MutationCtx, worldId: Id<'worlds'>,
  before: { players: any[]; conversations: any[] }, after: { players: any[]; conversations: any[] },
  step: { generation: number; at: number }) {
  const evidence = (participants: string[], conversationId?: string): EventEvidence => ({
    participants, at: step.at, source: { type: 'worldStep', id: `generation:${step.generation}`,
      generation: step.generation, ...(conversationId ? { conversationId } : {}) },
  });
  for (const player of after.players) {
    const old = before.players.find((p) => p.id === player.id);
    if (!old) {
      await appendHouseEvent(ctx, worldId, player.id, 'arrival', '搬进了自己的卧室', `arrival:${player.id}`, evidence([player.id]));
      continue;
    }
    if (roomAt(old.position) !== roomAt(player.position)) {
      await appendHouseEvent(ctx, worldId, player.id, 'room', `进入${roomAt(player.position)}`,
        stepEventKey(step.generation, player.id, 'room'), evidence([player.id]));
    }
    if (player.houseTask?.started !== old.houseTask?.started && player.houseTask) {
      await appendHouseEvent(ctx, worldId, player.id, 'move', player.activity?.description ?? '开始散步',
        `walk:${player.id}:${player.houseTask.started}`, evidence([player.id]));
    }
    if (player.houseTask?.stage === 'using' && old.houseTask?.stage !== 'using') {
      await appendHouseEvent(ctx, worldId, player.id, 'activity', player.houseTask.activity,
        `use:${player.id}:${player.houseTask.started}`, evidence([player.id]));
    }
    if (old.houseTask?.stage === 'using' && player.houseTask?.started !== old.houseTask.started) {
      await appendHouseEvent(ctx, worldId, player.id, 'activityEnd', `结束了上一项活动：${old.houseTask.activity}`,
        `end:${player.id}:${old.houseTask.started}`, evidence([player.id]));
    }
  }
  for (const conversation of after.conversations) {
    if (!before.conversations.some((c) => c.id === conversation.id)) {
      for (const member of conversation.participants) {
        await appendHouseEvent(ctx, worldId, member.playerId, 'conversation',
          '在客厅发起或收到室友邀请', `conversation:${conversation.id}:${member.playerId}`,
          { ...evidence(conversation.participants.map((p: any) => p.playerId), conversation.id), simulated: false });
      }
    }
  }
  for (const conversation of before.conversations) {
    if (after.conversations.some((c) => c.id === conversation.id)) continue;
    for (const member of conversation.participants) {
      await appendHouseEvent(ctx, worldId, member.playerId, 'conversationEnd', '结束了与室友的交流，回到日常活动',
        `conversationEnd:${conversation.id}:${member.playerId}`,
        { ...evidence(conversation.participants.map((p: any) => p.playerId), conversation.id), simulated: false });
    }
  }
}
