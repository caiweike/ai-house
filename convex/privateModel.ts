import { resetAt, currentRecord, afterReset } from './cognitionEpoch';
import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { resident } from './privateChat';
import { boundedContext, personaPrompt } from './llmPrompt';
import { failureText } from './llmPolicy';
import { generate } from './llmGateway';
import { cognitionPacket, projectPrivateMessage, applyCognition } from './cognitionStore';
import { cognitionOutput } from './cognitionProposal';

export const claim = internalMutation({ args: { receipt: v.id('privateRequests') }, handler: async (ctx, { receipt }) => {
  const r = await ctx.db.get(receipt);
  if (!r || !await currentRecord(ctx, r.worldId, r.at) || r.status !== 'queued' || r.mode !== 'live') return null;
  const owner = await ctx.db.query('houseOwners').filter(q => q.eq(q.field('userId'), r.ownerId)).first();
  if (!owner) return null;
  const index = await resident(ctx, r.worldId, r.playerId);
  const world = await ctx.db.get(r.worldId);
  const player = world!.players.find(p => p.id === r.playerId)!;
  const boundary = await resetAt(ctx, r.worldId);
  const history = await ctx.db.query('privateMessages').withIndex('thread', q =>
    q.eq('ownerId', r.ownerId).eq('worldId', r.worldId).eq('playerId', r.playerId).gt('at', boundary).lte('at', r.at))
    .order('desc').take(20);
  await ctx.db.patch(receipt, { status: 'running' });
  const packet = await cognitionPacket(ctx, r.worldId, r.playerId, r.text, r.ownerId, process.env.HOUSE_LLM_TEST_ONLY === '1');
  if (process.env.HOUSE_COGNITION_STRUCTURED === '1') await ctx.db.patch(receipt, { cognitionInput: packet.input,
    shortContextIds: history.filter(m => m.mode === 'user' || m.mode === 'live' || (process.env.HOUSE_LLM_TEST_ONLY === '1' && m.mode === 'test')).map(m => m._id) });
  return boundedContext(personaPrompt(index, player.activity?.description ?? '在小屋里休息', true), history.reverse()
    .filter(m => m.mode === 'user' || m.mode === 'live' || (process.env.HOUSE_LLM_TEST_ONLY === '1' && m.mode === 'test'))
    .map(m => ({ role: m.role === 'owner' ? 'user' as const : 'assistant' as const, content: m.text })), packet.text);
} });
export const finish = internalMutation({ args: { receipt: v.id('privateRequests'), text: v.optional(v.string()),
  model: v.optional(v.string()), mode: v.optional(v.union(v.literal('live'), v.literal('test'))), error: v.optional(v.string()),
  cognition: v.optional(cognitionOutput) }, handler: async (ctx, args) => {
  const r = await ctx.db.get(args.receipt);
  if (!r || !await currentRecord(ctx, r.worldId, r.at) || (r.status !== 'running' && r.status !== 'queued')) return;
  const failed = !!args.error || !args.text;
  const messageId = await ctx.db.insert('privateMessages', { ownerId: r.ownerId, worldId: r.worldId, playerId: r.playerId,
    requestId: r.requestId, role: failed ? 'system' : 'resident', text: failed ? (failureText[args.error ?? 'invalid'] ?? failureText.provider) : args.text!,
    at: Date.now(), mode: failed ? 'rule' : args.mode ?? 'live', ...(args.model ? { model: args.model } : {}),
    ...(r.cognitionInput ? { cognitionStructured: true } : {}) });
  const replyMemory = await projectPrivateMessage(ctx, messageId);
  if (replyMemory && args.cognition && r.cognitionInput) {
    const outcome = await applyCognition(ctx, replyMemory, r.cognitionInput, args.cognition);
    await ctx.db.patch(r._id, { cognitionUsed: outcome.used, cognitionStatus: outcome.status, cognitionFormat: args.cognition.status,
      ...(args.cognition.proposalIssue ? { cognitionIssue: args.cognition.proposalIssue } : {}) });
  }
  await ctx.db.patch(r._id, { status: failed ? 'failed' : 'completed', ...(args.error ? { error: args.error } : {}) });
} });
export const reply = internalAction({ args: { receipt: v.id('privateRequests') }, handler: async (ctx, { receipt }): Promise<void> => {
  try {
    const messages = await ctx.runMutation(internal.privateModel.claim, { receipt });
    if (!messages) return;
    // Request accepted under owner ACL; scheduled worker uses only that persisted pair's context.
    const result = await generate(ctx, `private:${receipt}`, 'private', messages);
    await ctx.runMutation(internal.privateModel.finish, { receipt, ...result });
  } catch {
    // Never log provider bodies, prompt, private text or secrets.
    await ctx.runMutation(internal.privateModel.finish, { receipt, error: 'provider' });
  }
} });
export const expire = internalMutation({ args: { receipt: v.id('privateRequests') }, handler: async (ctx, { receipt }) => {
  const r = await ctx.db.get(receipt);
  if (r && r.at + (r.watchdogMs ?? 90000) <= Date.now() && (r.status === 'queued' || r.status === 'running')) {
    await ctx.runMutation(internal.privateModel.finish, { receipt, error: 'expired' });
  }
} });
export const recover = internalMutation({ args: {}, handler: async ctx => {
  for (const status of ['queued', 'running'] as const) {
    const rows = await ctx.db.query('privateRequests').withIndex('status', q => q.eq('status', status).lte('at', Date.now() - 90000)).take(20);
    for (const r of rows) if (r.at + (r.watchdogMs ?? 90000) <= Date.now()) await ctx.runMutation(internal.privateModel.finish, { receipt: r._id, error: 'expired' });
  }
} });
