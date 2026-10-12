import { parseCognitionReply, boundedBelief } from './cognitionProposal';
import { applyCognition, projectPrivateMessage, projectHouseEvent, cognitionPacket } from './cognitionStore';
import { explicitOpinion, relationChange } from './cognitionPolicy';
import { boundedContext } from './llmPrompt';
import { tokenBound } from './llmPolicy';
import { fixture } from './cognitionTestSupport';
import { claim, finish } from './privateModel';
const proposal = { topic: '创造力', stance: 'agree' as const, confidence: 60, reason: '屋主区分了组合与独立创造，我赞成讨论这种区别', sources: ['m1'] };
const output = { used: ['m1'], status: 'structured' as const, belief: proposal };
const run = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);

test('自然中文不符合固定句式仍可提出结构化观点；正文与元数据分开', () => {
  const reply = '我原来倾向于否定，但你提出的组合与评价标准让我愿意重新考虑。';
  expect(explicitOpinion(reply)).toBeNull();
  const result = parseCognitionReply(JSON.stringify({ reply, used: ['m1'], belief: proposal }));
  expect(result?.text).toBe(reply); expect(result?.cognition.belief?.stance).toBe('agree');
});

test('条件修订无需伪造支持值或确信度变化，保留旧说明并验证中文长度', async () => {
  const before={stance:'agree' as const,confidence:50,position:'成果需有新颖性和价值'};
  const revised={...proposal,confidence:50,position:'过程按独创性评价，成果再看新颖性与价值'};
  expect(boundedBelief(before,revised)).toEqual({stance:'agree',confidence:50,position:revised.position});
  expect(boundedBelief(before,{...proposal,confidence:50})).toBeNull();
  expect(boundedBelief(before,{...proposal,confidence:50,position:before.position})).toBeNull();
  for(const position of ['', 'English', '中'.repeat(201)]) expect(parseCognitionReply(JSON.stringify({reply:'自然中文',used:['m1'],belief:{...revised,position}}))?.cognition.status).toBe('invalid_proposal');
  const f=fixture();await f.privateMessage('创造的定义同时包含过程和成果，这是本次澄清。','owner','user',1);
  await f.privateMessage('我按成果标准赞同。','resident','live',2);
  const [source,oldReply]=f.rows.filter(r=>r.table==='houseMemories');
  await applyCognition(f.ctx,oldReply._id,[source._id],{...output,belief:{...proposal,position:before.position}});
  await f.privateMessage('我接受分层标准，概括支持和确信度保持。','resident','live',3);
  const reply=f.rows.filter(r=>r.table==='houseMemories').at(-1);
  expect((await applyCognition(f.ctx,reply._id,[source._id],{...output,belief:revised})).status).toBe('accepted');
  const revisions=f.rows.filter(r=>r.table==='houseBeliefRevisions');
  expect(revisions[1].before.position).toBe(before.position);expect(revisions[1].after.position).toBe(revised.position);
  expect(revisions[1].sourceMemoryIds).toEqual([source._id]);
});
test('允许保持、纯文本降级；不自动补发模型修复请求', () => {
  expect(parseCognitionReply('{"reply":"暂时保持原有看法。","used":[],"belief":null}')?.cognition.belief).toBeUndefined();
  expect(parseCognitionReply('我还没有足够的理由改变观点。')?.cognition.status).toBe('plain');
  expect(parseCognitionReply('{"reply":')).toBeNull();
});

test('无效建议只报告闭合字段诊断，不保存被拒绝的供应商值', () => {
  const result=parseCognitionReply(JSON.stringify({reply:'自然正文仍可保留',used:[],belief:{...proposal,confidence:'private-invalid-value'}}));
  expect(result?.cognition.proposalIssue).toBe('confidence');expect(JSON.stringify(result?.cognition)).not.toContain('private-invalid-value');
});
test.each([
  { ...proposal, confidence: 500 }, { ...proposal, confidence: NaN }, { ...proposal, sources: ['unprovided-source'] },
  { ...proposal, sources: [] }, { ...proposal, sources: ['m1', 'm1'] }, { ...proposal, worldFact: true },
  { ...proposal, playerId: 'p:4' }, { ...proposal, scope: 'public' },
])('无效字段、角色、可见范围或来源不能由模型指定', b => {
  const result = parseCognitionReply(JSON.stringify({ reply: '这仍然是自然中文回复。', used: [], belief: b }));
  expect(result?.cognition.status).toBe('invalid_proposal'); expect(result?.cognition.belief).toBeUndefined();
});
test('同一来源的自然观点保存初值、旧新值、来源与理由，单次确信度限制10', async () => {
  const f = fixture(); const sourceMsg = await f.privateMessage('组合已有想法也能产生新颖且有用的作品。', 'owner', 'user', 1);
  const source = f.rows.find(m => m.table === 'houseMemories' && m.messageId === sourceMsg);
  const reply = await f.privateMessage('我愿意把组合创作视为一种创造。', 'resident', 'live', 2);
  const memory = f.rows.find(m => m.table === 'houseMemories' && m.messageId === reply);
  expect((await applyCognition(f.ctx, memory._id, [source._id], output)).status).toBe('accepted');
  const second = await f.privateMessage('经过你的补充，我更倾向于保留判断。', 'resident', 'live', 3);
  const next = f.rows.find(m => m.table === 'houseMemories' && m.messageId === second);
  await applyCognition(f.ctx, next._id, [source._id], { ...output, belief: { ...proposal, stance: 'uncertain', confidence: 10 } });
  const history = f.rows.filter(r => r.table === 'houseBeliefRevisions');
  expect(history).toHaveLength(2); expect(history[0].before).toBeNull();
  expect(history[1].before).toEqual({ stance: 'agree', confidence: 50 }); expect(history[1].after).toEqual({ stance: 'uncertain', confidence: 40 });
  expect(history[1].sourceMemoryIds).toEqual([source._id]); expect(history[1].method).toBe('structured');
  expect(history[1].reason).toContain('主观立场');
  expect((await applyCognition(f.ctx, next._id, [source._id], output)).status).toBe('stale');
});
test('跨角色、跨世界、公开引用私人、测试污染和未来记录均被拒绝', async () => {
  for (const variant of ['actor', 'world', 'private', 'test', 'future', 'missing']) {
    const f = fixture(); await f.privateMessage('这是授权来源', 'owner', 'user', 1);
    await f.privateMessage('自然的观点表达', 'resident', 'live', 2);
    const [source, reply] = f.rows.filter(r => r.table === 'houseMemories');
    if (variant === 'actor') source.playerId = 'p:4';
    if (variant === 'world') source.worldId = 'other';
    if (variant === 'private') reply.scope = 'public';
    if (variant === 'test') source.origin = 'test';
    if (variant === 'future') source.at = 999;
    const result = await applyCognition(f.ctx, reply._id, variant === 'missing' ? [] : [source._id], output);
    expect(result.status).toBe('invalid_source'); expect(result.used).toEqual([]);
    expect(f.rows.filter(r => r.table === 'houseBeliefs')).toHaveLength(0);
  }
});
test('虚构、猜测不支撑肯定立场；允许根据未证实内容保持不确定', async () => {
  const f = fixture(); await f.privateMessage('假设故事里有地下通道。', 'owner', 'user', 1);
  await f.privateMessage('我不认为这种故事能证明房间存在。', 'resident', 'live', 2);
  const [source, reply] = f.rows.filter(r => r.table === 'houseMemories');
  expect((await applyCognition(f.ctx, reply._id, [source._id], output)).status).toBe('unverified_basis');
  expect((await applyCognition(f.ctx, reply._id, [source._id], { ...output, belief: { ...proposal, stance: 'uncertain', reason: '故事未提供世界记录，需要保留判断' } })).status).toBe('accepted');
  expect(source.kind).toBe('fiction'); expect(reply.kind).not.toBe('world_event');
});
test('普通多轮、泛泛感谢及重复寒暄不再机械增加亲近；具体引用对方贡献才小幅变化', () => {
  const base = { trust: 50, closeness: 0 };
  const generic = ['p:0', 'p:2', 'p:0', 'p:2'].map(author => ({ author, text: '谢谢你的建议，我们继续聊天。' }));
  expect(relationChange(base, generic, 'p:0', 'p:2', 0)).toBeNull();
  const specific = [{ author: 'p:2', text: '建议先核对记录，再判断是否存在通道。' }, { author: 'p:0', text: '谢谢你提醒我核对记录，这个方法有帮助。' },
    { author: 'p:2', text: '我们就先检查来源。' }, { author: 'p:0', text: '我保持谨慎。' }];
  expect(relationChange(base, specific, 'p:0', 'p:2', 0)).toEqual({ trust: 51, closeness: 1 });
  expect(relationChange(base, specific, 'p:2', 'p:0', 0)).toBeNull();
  expect(relationChange(base, specific, 'p:0', 'p:2', 3)).toBeNull();
});
test('长中文上下文符合网关字节预留上限，记忆块及最新消息保留', () => {
  const context = boundedContext('系统'.repeat(500), Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `${i}历史`+'长'.repeat(2500) })), '记忆'.repeat(2000));
  expect(tokenBound(context)).toBeLessThanOrEqual(27000); expect(context[1].content).toContain('记忆'); expect(context.at(-1)?.content).toContain('19历史');
});
test('私人claim保存实际检索快照；finish校验后写入，自然回复不依赖固定句式', async () => {
  const f = fixture(), old = process.env.HOUSE_COGNITION_STRUCTURED;
  process.env.HOUSE_COGNITION_STRUCTURED = '1';
  try {
    await f.privateMessage('关于创造力，我想讨论组合创新。', 'owner', 'user', 1);
    const receipt = await f.db.insert('privateRequests', { ...f.pair, ownerId: 'user', requestId: 'structured', text: '创造力', at: 2, status: 'queued', mode: 'live' });
    await run(claim, f.ctx, { receipt }); expect((await f.db.get(receipt)).cognitionInput).toHaveLength(1);
    await run(finish, f.ctx, { receipt, text: '这个定义让我愿意重新考虑组合创新。', mode: 'test', cognition: output });
    expect((await f.db.get(receipt)).cognitionStatus).toBe('accepted');
    const m = f.rows.filter(r => r.table === 'privateMessages').at(-1); expect(m.cognitionStructured).toBe(true);
    await projectPrivateMessage(f.ctx, m._id);
    expect(f.rows.filter(r => r.table === 'houseBeliefRevisions')).toHaveLength(1);
    expect(f.rows.find(r => r.table === 'houseBeliefs').origin).toBe('test');
    const packet = await cognitionPacket(f.ctx, 'world' as any, 'p:2', '创造力', 'user' as any);
    expect(packet.input).toHaveLength(0); expect(packet.text).not.toContain('组合创新');
  } finally { if (old === undefined) delete process.env.HOUSE_COGNITION_STRUCTURED; else process.env.HOUSE_COGNITION_STRUCTURED = old; }
});
test('同立场同确信度无修订，模型置信值不能越界', () => {
  expect(boundedBelief({ stance: 'agree', confidence: 50 }, { ...proposal, confidence: 50 })).toBeNull();
  expect(boundedBelief({ stance: 'agree', confidence: 95 }, { ...proposal, confidence: 100 })).toEqual({ stance: 'agree', confidence: 100 });
});

test('公开结构化修订回放不重写原发言状态或重复修订', async () => {
  const f = fixture(); await f.publicMessage('组合也可以带来新颖的作品');
  const source = f.rows.find(m => m.table === 'houseMemories' && m.playerId === 'p:0');
  const event = await f.publicMessage('这个例子让我愿意重新考虑。');
  const e = await f.db.get(event);
  const message = f.rows.find(m => m.table === 'messages' && m.messageUuid === e.source.id);
  await f.db.patch(message._id, { cognition: output, cognitionInput: [source._id], cognitionStructured: true });
  await projectHouseEvent(f.ctx, event);
  expect(message.cognitionStatus).toBe('accepted');
  const saved = JSON.stringify(message);
  await projectHouseEvent(f.ctx, event);
  expect(JSON.stringify(message)).toBe(saved);
  expect(f.rows.filter(r => r.table === 'houseBeliefRevisions')).toHaveLength(1);
});

test('一天内重复引用同一贡献，不因另开会话反复增加亲近', async () => {
  const f = fixture();
  for (const c of ['c:1', 'c:2']) {
    for (const [author, text] of [['p:2', '建议先核对记录'], ['p:0', '谢谢你建议先核对记录'], ['p:2', '继续检查'], ['p:0', '保持谨慎']]) await f.publicMessage(text, author, 'live', c);
    await f.end('p:0', c);
  }
  expect(f.rows.find(r => r.table === 'houseRelationships').value).toEqual({ trust: 51, closeness: 1 });
  expect(f.rows.filter(r => r.table === 'houseRelationshipRevisions')).toHaveLength(1);
});
