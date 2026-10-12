import { fixture } from './cognitionTestSupport';
import { commit, rollback, maintenance } from './houseReset';
import { projectHouseEvent, projectPrivateMessage, cognitionPacket, applyCognition } from './cognitionStore';
import { backfill, memories, beliefs, relationships, evidence, eventEvidence, beliefHistory, relationshipHistory } from './cognition';
import { history, send } from './privateChat';
import { claim, finish } from './privateModel';
import { context } from './publicModel';
import { agentSendMessage } from './aiTown/agent';
import { normalizeUsername, validPassword } from './ownerPolicy';
import { jest } from '@jest/globals';

const run = (f: any, ctx: any, args: any) => f._handler(ctx, args);
const page = { cursor: null, numItems: 30 };
const args = { worldId: 'world', runId: 'reset-test', backupHash: 'a'.repeat(64) };
async function prepared() {
  const f = fixture();
  Object.assign(await f.db.get('world'), { conversations: [], agents: [{ id: 'a:0', playerId: 'p:0', toRemember: 'c:1', inProgressOperation: { operationId: 'o:1', started: 1 } }], nextId: 100 });
  Object.assign(await f.db.get('status'), { engineId: 'engine', status: 'stoppedByDeveloper' });
  const engineId = await f.db.insert('engines', { running: false });
  (await f.db.get('status')).engineId = engineId;
  await f.db.insert('llmControl', { key: 'global', paused: true, active: 0 });
  await f.db.insert('houseRelationships', { worldId: 'world', playerId: 'p:0', to: 'p:2', value: { trust: 60, closeness: 5 }, at: 100 });
  f.login();
  return f;
}
afterEach(() => jest.restoreAllMocks());

test('用户名规则、大小写统一、8字符密码及长度边界', () => {
  expect(normalizeUsername(' OwNeRdEmO_123 ')).toBe('ownerdemo_123');
  for (const name of ['ab', 'a'.repeat(33), 'owner@example.org', '用户名', 'with-dash']) expect(() => normalizeUsername(name)).toThrow();
  expect(validPassword('12345678')).toBe(true); expect(validPassword('1234567')).toBe(false);
  expect(validPassword('a'.repeat(257))).toBe(false);
});

test('真实重置保留来源/角色/下一ID，6条初始关系；重复提交幂等', async () => {
  const f = await prepared();
  await f.privateMessage('关于「旧偏好」，我支持，因为这是旧生活。');
  const sources = f.rows.filter(r => ['privateMessages','houseMemories','houseBeliefs','houseBeliefRevisions'].includes(r.table)).map(r => ({ ...r }));
  jest.spyOn(Date, 'now').mockReturnValue(100000);
  await run(commit, f.ctx, args); await run(commit, f.ctx, args);
  expect(f.rows.filter(r => r.table === 'houseCognitionResets')).toHaveLength(1);
  expect(f.rows.filter(r => r.table === 'houseRelationships')).toHaveLength(6);
  expect((await f.db.get('world')).agents).toEqual([{ id: 'a:0', playerId: 'p:0' }]);
  expect((await f.db.get('world')).nextId).toBe(100);
  expect(sources.every(s => JSON.stringify(f.rows.find(r => r._id === s._id)) === JSON.stringify(s))).toBe(true);
  for (const playerId of ['p:0','p:2','p:4']) {
    for (const privateScope of [false,true]) {
      expect((await run(memories, f.ctx, { ...f.pair, playerId, private: privateScope, paginationOpts: page })).page).toEqual([]);
      expect(await run(beliefs, f.ctx, { ...f.pair, playerId, private: privateScope })).toEqual([]);
    }
    expect((await run(relationships, f.ctx, { ...f.pair, playerId })).every((r: any) => r.value.trust === 50 && r.value.closeness === 0 && r.history.length === 0)).toBe(true);
  }
  expect((await run(history, f.ctx, { ...f.pair, paginationOpts: page })).page).toEqual([]);
  expect((await cognitionPacket(f.ctx, 'world' as any, 'p:0', '旧偏好', 'user' as any)).text).not.toContain('旧偏好');
});

test('旧公开/私人回填、旧来源直读、旧异步finish均拒绝，恢复后新来源照常投影', async () => {
  const f = await prepared();
  const oldMessage = await f.privateMessage('旧私有秘密');
  const oldEvent = await f.publicMessage('关于「旧立场」，我支持，因为旧理由有帮助。');
  const oldMemory = f.rows.find(r => r.table === 'houseMemories');
  const receipt = await f.db.insert('privateRequests', { ...f.pair, ownerId: 'user', at: 100, status: 'running', mode: 'live' });
  jest.spyOn(Date, 'now').mockReturnValue(100000);
  await run(commit, f.ctx, args);
  const count = f.rows.filter(r => r.table === 'houseMemories').length;
  await projectPrivateMessage(f.ctx, oldMessage); await projectHouseEvent(f.ctx, oldEvent);
  for (const table of ['events','private']) await run(backfill, f.ctx, { worldId: 'world', table, cursor: null });
  await run(finish, f.ctx, { receipt, text: '迟到的旧回答', mode: 'live' });
  expect(f.rows.filter(r => r.table === 'houseMemories')).toHaveLength(count);
  expect(f.rows.some(r => r.text === '迟到的旧回答')).toBe(false);
  expect(await run(claim, f.ctx, { receipt })).toBeNull();
  await expect(run(evidence, f.ctx, { memoryId: oldMemory._id })).rejects.toThrow();
  await expect(run(eventEvidence, f.ctx, { eventId: oldEvent })).rejects.toThrow();
  await f.privateMessage('新生活自己的第一条记忆', 'owner', 'user', 100001);
  expect((await run(memories, f.ctx, { ...f.pair, private: true, paginationOpts: page })).page).toHaveLength(1);
  expect((await cognitionPacket(f.ctx, 'world' as any, 'p:0', '新生活', 'user' as any)).text).toContain('新生活');
  const newReceipt = await f.db.insert('privateRequests', { ...f.pair, ownerId: 'user', at: 100010, text: '现在开始', status: 'queued', mode: 'live' });
  const input = JSON.stringify(await run(claim, f.ctx, { receipt: newReceipt }));
  expect(input).not.toContain('旧私有秘密'); expect(input).toContain('新生活');
});

test('旧公开会话与迟到发言不会跨纪元，旧观点依据不能用于新修订', async () => {
  const f = await prepared();
  await f.privateMessage('旧依据'); const old = f.rows.find(r => r.table === 'houseMemories');
  jest.spyOn(Date, 'now').mockReturnValue(100000); await run(commit, f.ctx, args);
  const world = await f.db.get('world');
  world.conversations = [{ id: 'c:1', created: 50, isTyping: { messageUuid: 'uuid' }, participants: [{ playerId: 'p:0', status: { kind: 'participating' } }, { playerId: 'p:2', status: { kind: 'participating' } }] }];
  world.agents = [{ id: 'a:0', playerId: 'p:0', inProgressOperation: { operationId: 'o:1', started: 50 } }];
  const a = { worldId: 'world', playerId: 'p:0', otherPlayerId: 'p:2', agentId: 'a:0', conversationId: 'c:1', operationId: 'o:1', messageUuid: 'uuid', type: 'continue' };
  expect(await run(context, f.ctx, a)).toBeNull();
  await run(agentSendMessage, f.ctx, { ...a, text: '旧公开迟到', leaveConversation: false, mode: 'live' });
  expect(f.rows.some(r => r.text === '旧公开迟到')).toBe(false);
  const id = await f.privateMessage('我重新形成观点', 'resident', 'live', 100001);
  const reply = f.rows.find(r => r.messageId === id);
  expect((await applyCognition(f.ctx, reply._id, [old._id], { status: 'structured', used: ['m1'], belief: { topic: '新观点', stance: 'agree', confidence: 50, reason: '以前的依据', sources: ['m1'] } } as any)).status).toBe('invalid_source');
});

test('维护条件不满足拒绝重置；刚重置可回滚，已产生新记录拒绝混合', async () => {
  const f = await prepared();
  const control = f.rows.find(r => r.table === 'llmControl'); control.active = 1;
  await expect(run(commit, f.ctx, args)).rejects.toThrow(); control.active = 0;
  jest.spyOn(Date, 'now').mockReturnValue(100000); await run(commit, f.ctx, args);
  await run(rollback, f.ctx, { runId: args.runId });
  expect(f.rows.find(r => r.table === 'houseCognitionEpochs').resetAt).toBe(0);
  expect(f.rows.find(r => r.table === 'houseRelationships' && r.playerId === 'p:0' && r.to === 'p:2').value.trust).toBe(60);
  await run(commit, f.ctx, { ...args, runId: 'another-reset' });
  await f.db.insert('privateMessages', { ...f.pair, _creationTime: 100001 });
  f.rows[f.rows.length - 1]._creationTime = 100001;
  await expect(run(rollback, f.ctx, { runId: 'another-reset' })).rejects.toThrow('已有新生活');
});

test('备份维护窗口阻止新私聊并归档待完成任务，备份后没有迟到写入', async () => {
  const f = await prepared();
  const receipt = await f.db.insert('privateRequests', { ...f.pair, ownerId: 'user', at: 100, status: 'running', mode: 'live' });
  await run(maintenance, f.ctx, { worldId: 'world', stop: true });
  expect((await f.db.get(receipt)).status).toBe('failed');
  expect(f.rows.find(r => r.table === 'houseResetCheckpoints').before.pending[0].status).toBe('running');
  expect((await f.db.get('world')).agents[0].inProgressOperation).toBeUndefined();
  await expect(run(send, f.ctx, { ...f.pair, text: '备份期间不能写入', requestId: '12345678-1234-1234-1234-123456789abc' })).rejects.toThrow('维护');
  await run(finish, f.ctx, { receipt, text: '备份之后迟到的回答', mode: 'live' });
  expect(f.rows.some(r => r.text === '备份之后迟到的回答')).toBe(false);
});
