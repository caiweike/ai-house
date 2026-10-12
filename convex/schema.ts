import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';
import { eventSource } from './houseEventModel';
import { modelEvidence } from './llmEvidence';
import { cognitionTables } from './cognitionSchema';
import { cognitionOutput, proposalIssue } from './cognitionProposal';

export default defineSchema({
  ...cognitionTables,
  houseCognitionEpochs: defineTable({ worldId: v.id('worlds'), resetAt: v.number(), epoch: v.number(), runId: v.string() }).index('world', ['worldId']),
  houseResetCheckpoints: defineTable({ worldId: v.id('worlds'), at: v.number(), before: v.any() }).index('world', ['worldId']),
  houseCognitionResets: defineTable({ worldId: v.id('worlds'), runId: v.string(), resetAt: v.number(), epoch: v.number(),
    previousAt: v.number(), backupHash: v.string(), before: v.any(), rolledBack: v.optional(v.boolean()) }).index('run', ['runId']),
  ...authTables,
  houseOwners: defineTable({ userId: v.id('users'), lastSent: v.number(), day: v.string(), dailyCount: v.number() }),
  privateMessages: defineTable({ ownerId: v.id('users'), worldId: v.id('worlds'), playerId: v.string(),
    requestId: v.string(), role: v.union(v.literal('owner'), v.literal('resident'), v.literal('system')), text: v.string(),
    at: v.number(), mode: v.union(v.literal('user'), v.literal('mock'), v.literal('live'), v.literal('test'), v.literal('rule')),
    model: v.optional(v.string()), cognitionStructured: v.optional(v.boolean()) })
    .index('thread', ['ownerId', 'worldId', 'playerId', 'at']),
  privateRequests: defineTable({ ownerId: v.id('users'), worldId: v.id('worlds'), playerId: v.string(),
    requestId: v.string(), text: v.string(), at: v.number(),
    status: v.optional(v.union(v.literal('queued'), v.literal('running'), v.literal('completed'), v.literal('failed'))),
    mode: v.optional(v.union(v.literal('mock'), v.literal('live'))), error: v.optional(v.string()), watchdogMs: v.optional(v.number()),
    cognitionInput: v.optional(v.array(v.id('houseMemories'))), cognitionUsed: v.optional(v.array(v.id('houseMemories'))),
    cognitionStatus: v.optional(v.string()), cognitionIssue: v.optional(proposalIssue), cognitionFormat: v.optional(v.union(v.literal('structured'), v.literal('plain'), v.literal('invalid_proposal'))),
    shortContextIds: v.optional(v.array(v.id('privateMessages'))) })
    .index('request', ['ownerId', 'requestId']).index('thread', ['ownerId', 'worldId', 'playerId', 'at'])
    .index('status', ['status', 'at']),
  llmBudgets: defineTable({ period: v.string(), spent: v.number(), reserved: v.number(), calls: v.number(),
    inputTokens: v.number(), outputTokens: v.number(), uncertain: v.number(),
    reportedInputTokens: v.optional(v.number()), reportedOutputTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()), failures: v.optional(v.number()) }).index('period', ['period']),
  llmControl: defineTable({ key: v.string(), active: v.number(), windowAt: v.number(), windowCalls: v.number(),
    circuit: v.optional(v.string()), paused: v.optional(v.boolean()), failureStreak: v.optional(v.number()),
    cooldownUntil: v.optional(v.number()) }).index('key', ['key']),
  llmRealTests: defineTable({ key: v.string(), calls: v.number(), committed: v.number(), expires: v.number(),
    maxCalls: v.optional(v.number()), maxCommitted: v.optional(v.number()), requestReserve: v.optional(v.number()),
    publicUntil: v.optional(v.number()), publicStart: v.optional(v.number()) }).index('key', ['key']),
  llmAttempts: defineTable({ key: v.string(), scope: v.union(v.literal('private'), v.literal('public')),
    day: v.string(), month: v.string(), model: v.string(), at: v.number(), expires: v.number(),
    status: v.union(v.literal('reserved'), v.literal('success'), v.literal('failed'), v.literal('expired')),
    reserve: v.number(), cost: v.optional(v.number()), usageKnown: v.optional(v.boolean()),
    inputBound: v.number(), maxTokens: v.number(), inputPrice: v.number(), outputPrice: v.number(),
    inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), error: v.optional(v.string()), fixture: v.optional(v.boolean()),
    evidence: v.optional(modelEvidence), protocol: v.optional(v.string()), timeoutMs: v.optional(v.number()),
    usagePolicy: v.optional(v.string()), billingMode: v.optional(v.string()), priceConfirmed: v.optional(v.boolean()), realTest: v.optional(v.string()),
    unlimitedDev: v.optional(v.boolean()), settledAt: v.optional(v.number()) })
    .index('key', ['key']).index('status', ['status', 'expires']),
  houseEvents: defineTable({ worldId: v.id('worlds'), actor: v.string(), kind: v.string(),
    text: v.string(), key: v.string(), seq: v.number(), at: v.number(), simulated: v.boolean(),
    participants: v.optional(v.array(v.string())), source: v.optional(eventSource),
    recordedAt: v.optional(v.number()) })
    .index('worldAt', ['worldId', 'at']).index('actorAt', ['worldId', 'actor', 'at'])
    .index('worldSequence', ['worldId', 'seq']).index('actor', ['worldId', 'actor', 'seq'])
    .index('dedupe', ['worldId', 'key']),
  demoMessages: defineTable({ worldId: v.id('worlds'), playerId: v.string(),
    author: v.string(), text: v.string(), at: v.number(), requestId: v.string() })
    .index('actor', ['worldId', 'playerId', 'at']).index('request', ['worldId', 'requestId']),
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
    mode: v.optional(v.union(v.literal('mock'), v.literal('live'), v.literal('test'))),
    model: v.optional(v.string()),
    cognitionStructured: v.optional(v.boolean()), cognitionInput: v.optional(v.array(v.id('houseMemories'))),
    cognition: v.optional(cognitionOutput), cognitionUsed: v.optional(v.array(v.id('houseMemories'))), cognitionStatus: v.optional(v.string()),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('worldMessages', ['worldId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
