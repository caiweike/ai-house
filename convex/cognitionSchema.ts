import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const knowledgeKind = v.union(v.literal('world_event'), v.literal('statement'), v.literal('speculation'), v.literal('fiction'));
export const stance = v.union(v.literal('agree'), v.literal('disagree'), v.literal('uncertain'));
export const beliefValue = v.object({ stance, confidence: v.number(), position: v.optional(v.string()) });
export const relationValue = v.object({ trust: v.number(), closeness: v.number() });
const scope = { worldId: v.id('worlds'), playerId: v.string(), scope: v.string() };
export const cognitionTables = {
  houseMemories: defineTable({ ...scope, key: v.string(), at: v.number(), recordedAt: v.number(), epoch: v.optional(v.number()),
    participants: v.array(v.string()), summary: v.string(), searchText: v.string(), importance: v.number(), kind: knowledgeKind,
    origin: v.union(v.literal('recorded'), v.literal('live'), v.literal('test')),
    eventId: v.optional(v.id('houseEvents')), messageId: v.optional(v.id('privateMessages')),
    speaker: v.string(), excerpt: v.string() })
    .index('dedupe', ['worldId', 'playerId', 'key']).index('scope', ['worldId', 'playerId', 'scope', 'at'])
    .searchIndex('search', { searchField: 'searchText', filterFields: ['worldId', 'playerId', 'scope', 'origin', 'epoch'] }),
  houseBeliefs: defineTable({ ...scope, topic: v.string(), value: beliefValue, reason: v.string(),
    memoryId: v.id('houseMemories'), at: v.number(), origin: v.union(v.literal('live'), v.literal('test')) })
    .index('topic', ['worldId', 'playerId', 'scope', 'topic', 'origin']).index('scope', ['worldId', 'playerId', 'scope']),
  houseBeliefRevisions: defineTable({ beliefId: v.id('houseBeliefs'), before: v.union(v.null(), beliefValue),
    after: beliefValue, reason: v.string(), memoryId: v.id('houseMemories'), at: v.number(),
    sourceMemoryIds: v.optional(v.array(v.id('houseMemories'))), method: v.optional(v.literal('structured')) })
    .index('belief', ['beliefId', 'at']),
  houseRelationships: defineTable({ worldId: v.id('worlds'), playerId: v.string(), to: v.string(),
    value: relationValue, at: v.number() }).index('pair', ['worldId', 'playerId', 'to']),
  houseRelationshipRevisions: defineTable({ relationshipId: v.id('houseRelationships'), key: v.string(),
    before: relationValue, after: relationValue, reason: v.string(), eventId: v.id('houseEvents'),
    messageIds: v.array(v.id('messages')), at: v.number(), contributionKey: v.optional(v.string()) })
    .index('relation', ['relationshipId', 'at']).index('dedupe', ['relationshipId', 'key']),
};
