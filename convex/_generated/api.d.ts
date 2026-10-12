/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_conversation from "../agent/conversation.js";
import type * as agent_embeddingsCache from "../agent/embeddingsCache.js";
import type * as agent_memory from "../agent/memory.js";
import type * as aiTown_agent from "../aiTown/agent.js";
import type * as aiTown_agentDescription from "../aiTown/agentDescription.js";
import type * as aiTown_agentInputs from "../aiTown/agentInputs.js";
import type * as aiTown_agentOperations from "../aiTown/agentOperations.js";
import type * as aiTown_conversation from "../aiTown/conversation.js";
import type * as aiTown_conversationMembership from "../aiTown/conversationMembership.js";
import type * as aiTown_game from "../aiTown/game.js";
import type * as aiTown_ids from "../aiTown/ids.js";
import type * as aiTown_inputHandler from "../aiTown/inputHandler.js";
import type * as aiTown_inputs from "../aiTown/inputs.js";
import type * as aiTown_insertInput from "../aiTown/insertInput.js";
import type * as aiTown_location from "../aiTown/location.js";
import type * as aiTown_main from "../aiTown/main.js";
import type * as aiTown_movement from "../aiTown/movement.js";
import type * as aiTown_player from "../aiTown/player.js";
import type * as aiTown_playerDescription from "../aiTown/playerDescription.js";
import type * as aiTown_world from "../aiTown/world.js";
import type * as aiTown_worldMap from "../aiTown/worldMap.js";
import type * as auth from "../auth.js";
import type * as cognition from "../cognition.js";
import type * as cognitionEpoch from "../cognitionEpoch.js";
import type * as cognitionPolicy from "../cognitionPolicy.js";
import type * as cognitionProposal from "../cognitionProposal.js";
import type * as cognitionSchema from "../cognitionSchema.js";
import type * as cognitionStore from "../cognitionStore.js";
import type * as cognitionTestSupport from "../cognitionTestSupport.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as engine_abstractGame from "../engine/abstractGame.js";
import type * as engine_historicalObject from "../engine/historicalObject.js";
import type * as house from "../house.js";
import type * as houseDiagnostics from "../houseDiagnostics.js";
import type * as houseEventModel from "../houseEventModel.js";
import type * as houseEvents from "../houseEvents.js";
import type * as houseMock from "../houseMock.js";
import type * as houseReset from "../houseReset.js";
import type * as houseRoutine from "../houseRoutine.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as llmAdapter from "../llmAdapter.js";
import type * as llmDev from "../llmDev.js";
import type * as llmDiagnostics from "../llmDiagnostics.js";
import type * as llmEvidence from "../llmEvidence.js";
import type * as llmGateway from "../llmGateway.js";
import type * as llmGrant from "../llmGrant.js";
import type * as llmLedger from "../llmLedger.js";
import type * as llmPolicy from "../llmPolicy.js";
import type * as llmPrompt from "../llmPrompt.js";
import type * as llmTiming from "../llmTiming.js";
import type * as llmTransport from "../llmTransport.js";
import type * as messages from "../messages.js";
import type * as music from "../music.js";
import type * as owner from "../owner.js";
import type * as ownerPolicy from "../ownerPolicy.js";
import type * as privateAudit from "../privateAudit.js";
import type * as privateChat from "../privateChat.js";
import type * as privateModel from "../privateModel.js";
import type * as privatePolicy from "../privatePolicy.js";
import type * as privateReply from "../privateReply.js";
import type * as publicModel from "../publicModel.js";
import type * as resetTestSupport from "../resetTestSupport.js";
import type * as testing from "../testing.js";
import type * as util_FastIntegerCompression from "../util/FastIntegerCompression.js";
import type * as util_assertNever from "../util/assertNever.js";
import type * as util_asyncMap from "../util/asyncMap.js";
import type * as util_compression from "../util/compression.js";
import type * as util_geometry from "../util/geometry.js";
import type * as util_isSimpleObject from "../util/isSimpleObject.js";
import type * as util_llm from "../util/llm.js";
import type * as util_minheap from "../util/minheap.js";
import type * as util_object from "../util/object.js";
import type * as util_sleep from "../util/sleep.js";
import type * as util_types from "../util/types.js";
import type * as util_xxhash from "../util/xxhash.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/conversation": typeof agent_conversation;
  "agent/embeddingsCache": typeof agent_embeddingsCache;
  "agent/memory": typeof agent_memory;
  "aiTown/agent": typeof aiTown_agent;
  "aiTown/agentDescription": typeof aiTown_agentDescription;
  "aiTown/agentInputs": typeof aiTown_agentInputs;
  "aiTown/agentOperations": typeof aiTown_agentOperations;
  "aiTown/conversation": typeof aiTown_conversation;
  "aiTown/conversationMembership": typeof aiTown_conversationMembership;
  "aiTown/game": typeof aiTown_game;
  "aiTown/ids": typeof aiTown_ids;
  "aiTown/inputHandler": typeof aiTown_inputHandler;
  "aiTown/inputs": typeof aiTown_inputs;
  "aiTown/insertInput": typeof aiTown_insertInput;
  "aiTown/location": typeof aiTown_location;
  "aiTown/main": typeof aiTown_main;
  "aiTown/movement": typeof aiTown_movement;
  "aiTown/player": typeof aiTown_player;
  "aiTown/playerDescription": typeof aiTown_playerDescription;
  "aiTown/world": typeof aiTown_world;
  "aiTown/worldMap": typeof aiTown_worldMap;
  auth: typeof auth;
  cognition: typeof cognition;
  cognitionEpoch: typeof cognitionEpoch;
  cognitionPolicy: typeof cognitionPolicy;
  cognitionProposal: typeof cognitionProposal;
  cognitionSchema: typeof cognitionSchema;
  cognitionStore: typeof cognitionStore;
  cognitionTestSupport: typeof cognitionTestSupport;
  constants: typeof constants;
  crons: typeof crons;
  "engine/abstractGame": typeof engine_abstractGame;
  "engine/historicalObject": typeof engine_historicalObject;
  house: typeof house;
  houseDiagnostics: typeof houseDiagnostics;
  houseEventModel: typeof houseEventModel;
  houseEvents: typeof houseEvents;
  houseMock: typeof houseMock;
  houseReset: typeof houseReset;
  houseRoutine: typeof houseRoutine;
  http: typeof http;
  init: typeof init;
  llmAdapter: typeof llmAdapter;
  llmDev: typeof llmDev;
  llmDiagnostics: typeof llmDiagnostics;
  llmEvidence: typeof llmEvidence;
  llmGateway: typeof llmGateway;
  llmGrant: typeof llmGrant;
  llmLedger: typeof llmLedger;
  llmPolicy: typeof llmPolicy;
  llmPrompt: typeof llmPrompt;
  llmTiming: typeof llmTiming;
  llmTransport: typeof llmTransport;
  messages: typeof messages;
  music: typeof music;
  owner: typeof owner;
  ownerPolicy: typeof ownerPolicy;
  privateAudit: typeof privateAudit;
  privateChat: typeof privateChat;
  privateModel: typeof privateModel;
  privatePolicy: typeof privatePolicy;
  privateReply: typeof privateReply;
  publicModel: typeof publicModel;
  resetTestSupport: typeof resetTestSupport;
  testing: typeof testing;
  "util/FastIntegerCompression": typeof util_FastIntegerCompression;
  "util/assertNever": typeof util_assertNever;
  "util/asyncMap": typeof util_asyncMap;
  "util/compression": typeof util_compression;
  "util/geometry": typeof util_geometry;
  "util/isSimpleObject": typeof util_isSimpleObject;
  "util/llm": typeof util_llm;
  "util/minheap": typeof util_minheap;
  "util/object": typeof util_object;
  "util/sleep": typeof util_sleep;
  "util/types": typeof util_types;
  "util/xxhash": typeof util_xxhash;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
