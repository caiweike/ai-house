import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

// Explicitly enabled, local, paused, free fixture preparation. No model action
// is scheduled. These records are archived by the final clean reset.
export const prepare = internalMutation({ args: { worldId: v.id('worlds') }, handler: async (ctx, { worldId }) => {
  if (process.env.HOUSE_RESET_TEST_TOOLS !== '1' || process.env.CONVEX_CLOUD_URL !== 'http://127.0.0.1:3212') throw new Error('disabled');
  const control = await ctx.db.query('llmControl').withIndex('key', q => q.eq('key','global')).unique();
  const status = await ctx.db.query('worldStatus').withIndex('worldId', q => q.eq('worldId',worldId)).unique();
  if (!control?.paused || control.active || status?.status !== 'stoppedByDeveloper') throw new Error('maintenance required');
  const owner = (await ctx.db.query('houseOwners').first())!;
  const world = (await ctx.db.get(worldId))!;
  const playerId = world.players[0].id, otherPlayerId = world.players[1].id;
  const agent = world.agents.find(a => a.playerId === playerId)!;
  const now = Date.now(), requestId = crypto.randomUUID();
  const message = await ctx.db.insert('privateMessages', { ownerId: owner.userId, worldId, playerId, requestId,
    role: 'owner', text: '认知重置免费验收：新阶段的私人输入，测试完成后归档。', at: now, mode: 'user' });
  const receipt = await ctx.db.insert('privateRequests', { ownerId: owner.userId, worldId, playerId, requestId,
    text: '认知重置免费验收', at: now, status: 'queued', mode: 'live' });
  const lateReceipt = await ctx.db.insert('privateRequests', { ownerId: owner.userId, worldId, playerId, requestId: crypto.randomUUID(),
    text: '认知重置免费旧请求故障注入', at: 1, status: 'running', mode: 'live' });
  const conversationId = `c:${world.nextId}` as `c:${number}`;
  const operationId = `o:${world.nextId+1}`, messageUuid = crypto.randomUUID();
  const conversation = { id: conversationId, creator: playerId, created: now, numMessages: 0,
    participants: [playerId,otherPlayerId].map(playerId => ({ playerId, invited: now, status: { kind: 'participating' as const, started: now } })),
    isTyping: { playerId, since: now, messageUuid } };
  await ctx.db.patch(worldId, { nextId: world.nextId+2, conversations: [conversation],
    agents: world.agents.map(a => a.id === agent.id ? { ...a, inProgressOperation: { name: 'agentGenerateMessage', operationId, started: now } } : a) });
  return { receipt, message, lateReceipt, publicArgs: { worldId, playerId, otherPlayerId, agentId: agent.id, conversationId, operationId, messageUuid, type: 'start' as const } };
} });
