import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { agentId, conversationId, playerId } from './ids';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import { mockDialogue } from '../houseMock';
import { generate } from '../llmGateway';
import { liveMode } from '../llmDev';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Stage 4 retains conversations only; never calls the upstream memory/embedding model.
    await ctx.runMutation(internal.aiTown.agent.clearRememberOperation, {
      worldId: args.worldId, agentId: args.agentId, operationId: args.operationId,
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const context = await ctx.runQuery(internal.publicModel.context, args);
      if (!context) return;
      const live = liveMode(process.env);
      if (live && process.env.HOUSE_LLM_AUTONOMOUS_ENABLED !== '1') {
        await ctx.runMutation(internal.aiTown.agent.agentModelFailed, { worldId: args.worldId, agentId: args.agentId,
          conversationId: args.conversationId, operationId: args.operationId });
        return;
      }
      const result = live ? await generate(ctx, `public:${args.worldId}:${args.messageUuid}`, 'public', context.messages) :
        { text: mockDialogue(context.index, Math.floor(context.turn / 2), args.type === 'leave') };
      if ('error' in result) {
        await ctx.runMutation(internal.aiTown.agent.agentModelFailed, { worldId: args.worldId, agentId: args.agentId,
          conversationId: args.conversationId, operationId: args.operationId });
        return;
      }
      const end = result.text.includes('[结束交流]');
      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text: result.text.replace(/\[结束交流\]/g, '').trim(),
      mode: 'mode' in result ? result.mode : 'mock',
      ...('model' in result ? { model: result.model } : {}),
      ...('cognition' in result && result.cognition ? { cognition: result.cognition, cognitionInput: context.cognitionInput } : {}),
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave' || end,
      operationId: args.operationId,
      });
    } catch {
      await ctx.runMutation(internal.aiTown.agent.agentModelFailed, { worldId: args.worldId, agentId: args.agentId,
        conversationId: args.conversationId, operationId: args.operationId });
    }
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}
