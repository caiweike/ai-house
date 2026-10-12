import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { residents } from '../data/house';
import { publicPrompt } from './llmPrompt';
import { agentId, playerId, conversationId } from './aiTown/ids';
import { cognitionPacket } from './cognitionStore';

// This path retrieves public memories only; no owner ID can enter it.
export const context = internalQuery({ args: { worldId: v.id('worlds'), playerId, otherPlayerId: playerId,
  agentId, conversationId, operationId: v.string(), messageUuid: v.string(),
  type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')) }, handler: async (ctx, args) => {
  const world = await ctx.db.get(args.worldId);
  const agent = world?.agents.find(a => a.id === args.agentId && a.playerId === args.playerId);
  const conversation = world?.conversations.find(c => c.id === args.conversationId);
  if (!conversation || !await currentRecord(ctx, args.worldId, conversation.created) || agent?.inProgressOperation?.operationId !== args.operationId ||
    conversation.isTyping?.messageUuid !== args.messageUuid ||
    ![args.playerId, args.otherPlayerId].every(id => conversation.participants.some(p => p.playerId === id && p.status.kind === 'participating'))) return null;
  const descriptions = await ctx.db.query('playerDescriptions').withIndex('worldId', q => q.eq('worldId', args.worldId)).collect();
  const index = residents.findIndex(r => r.name === descriptions.find(d => d.playerId === args.playerId)?.name);
  const otherName = descriptions.find(d => d.playerId === args.otherPlayerId)?.name ?? '室友';
  if (index < 0) return null;
  const boundary = await resetAt(ctx, args.worldId);
  const history = await ctx.db.query('messages').withIndex('conversationId', q =>
    q.eq('worldId', args.worldId).eq('conversationId', args.conversationId)).filter(q => q.gt(q.field('_creationTime'), boundary)).order('desc').take(12);
  const player = world!.players.find(p => p.id === args.playerId)!;
  const packet = await cognitionPacket(ctx, args.worldId, args.playerId, history.map(m => m.text).join(' ').slice(-300));
  return { index, turn: conversation.numMessages, cognitionInput: packet.input,
    messages: publicPrompt(index, player.activity?.description ?? '在客厅与室友交流', otherName,
      history.reverse().filter(m => m.mode === 'live' || (process.env.HOUSE_LLM_TEST_ONLY === '1' && m.mode === 'test')).map(m => ({ role: m.author === args.playerId ? 'assistant' as const : 'user' as const, content: m.text })), args.type, packet.text) };
} });
