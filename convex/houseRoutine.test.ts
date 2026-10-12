import { Game } from './aiTown/game';
import { findRoute, blockedWithPositions } from './aiTown/movement';
import { HOUSE_WIDTH, HOUSE_HEIGHT, TILE, residents, furniture, objmap, bgtiles, solidAt, routine } from '../data/house';
import { houseRoutine } from './houseRoutine';
import { Agent } from './aiTown/agent';
import { Doc, Id } from './_generated/dataModel';
import { mockDialogue } from './houseMock';
import { Conversation } from './aiTown/conversation';
import { MAX_CONVERSATION_DURATION, MAX_CONVERSATION_MESSAGES } from './constants';

function fixture() {
  return new Game({ _id: 'test' as Id<'engines'>, _creationTime: 0, generationNumber: 0, running: true, nextInputNumber: 0 } as Doc<'engines'>, 'test' as Id<'worlds'>, {
    world: { nextId: 6, players: residents.map((r, i) => ({ id: `p:${i * 2}`, position: { ...r.spawn }, facing: { dx: 0, dy: 1 }, speed: 0, lastInput: 0 })), agents: [], conversations: [] },
    playerDescriptions: residents.map((r, i) => ({ playerId: `p:${i * 2}`, name: r.name, description: r.identity, character: r.character })), agentDescriptions: [],
    worldMap: { width: HOUSE_WIDTH, height: HOUSE_HEIGHT, tileDim: TILE, tileSetUrl: '', tileSetDimX: TILE, tileSetDimY: TILE, bgTiles: bgtiles, objectTiles: objmap, animatedSprites: [] },
  });
}

function talking() {
  const game = fixture();
  const [a, b] = [...game.world.players.values()];
  const aa = new Agent({ id: 'a:1', playerId: a.id }), bb = new Agent({ id: 'a:3', playerId: b.id });
  game.world.agents.set(aa.id, aa); game.world.agents.set(bb.id, bb);
  const c = new Conversation({ id: 'c:8', creator: a.id, created: 0, numMessages: 0,
    participants: [a, b].map(p => ({ playerId: p.id, invited: 0, status: { kind: 'participating', started: 0 } })) });
  game.world.conversations.set(c.id, c);
  return { game, a, b, aa, bb, c };
}
test('模型等待不能延长对话硬期限；结束清除两位居民旧操作', () => {
  const { game, aa, bb, c } = talking();
  aa.inProgressOperation = { name: 'agentGenerateMessage', operationId: 'o:9', started: MAX_CONVERSATION_DURATION - 1 };
  bb.inProgressOperation = { name: 'agentGenerateMessage', operationId: 'o:10', started: MAX_CONVERSATION_DURATION - 1 };
  aa.tick(game, MAX_CONVERSATION_DURATION);
  expect(game.world.conversations.has(c.id)).toBe(false);
  expect(aa.inProgressOperation).toBeUndefined(); expect(bb.inProgressOperation).toBeUndefined();
  expect(aa.lastConversation).toBe(MAX_CONVERSATION_DURATION);
});
test('第6条必须收尾，等待对方超时结束而不是自己连续发言', () => {
  const { game, aa, a, b, c } = talking();
  c.numMessages = MAX_CONVERSATION_MESSAGES - 1;
  c.lastMessage = { author: b.id, timestamp: 1 };
  aa.tick(game, 3000);
  expect(game.pendingOperations[0].args).toMatchObject({ type: 'leave' });
  const ownLast = talking();
  ownLast.c.numMessages = MAX_CONVERSATION_MESSAGES - 1;
  ownLast.c.lastMessage = { author: ownLast.a.id, timestamp: 1 };
  ownLast.aa.tick(ownLast.game, 3000);
  expect(ownLast.game.pendingOperations).toHaveLength(0);
  const second = talking();
  second.c.numMessages = 2; second.c.lastMessage = { author: second.a.id, timestamp: 1 };
  second.aa.tick(second.game, 61002);
  expect(second.game.world.conversations.size).toBe(0);
  expect(second.game.pendingOperations).toHaveLength(0);
});

describe('室内地图与原世界寻路', () => {
  it('三位居民的全部家具目标都可达，出卧室必须经过自己的门', () => {
    const game = fixture();
    [...game.world.players.values()].forEach((p, owner) => {
      for (let cycle = 0; cycle < 5; cycle++) {
        const dest = routine(owner, cycle).destination;
        expect(blockedWithPositions(dest, [], game.worldMap)).toBeNull();
        const route = findRoute(game, 0, p, dest)!;
        expect(route).not.toBeNull(); expect(route.newDestination).toBeNull();
        // Inspect every grid step inside compressed route segments, not only endpoints.
        const cells: {x: number; y: number}[] = [];
        for (let j = 1; j < route.path.length; j++) {
          const a = { x: route.path[j - 1][0], y: route.path[j - 1][1] }, b = { x: route.path[j][0], y: route.path[j][1] };
          const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          for (let n = 0; n <= length; n++) {
            const cell = { x: a.x + Math.sign(b.x - a.x) * n, y: a.y + Math.sign(b.y - a.y) * n };
            cells.push(cell); expect(solidAt(cell.x, cell.y)).toBe(false);
          }
        }
        if (dest.y >= 14) expect(cells).toContainEqual({ x: owner * 12 + 6, y: 11 });
      }
    });
  });
  it('墙体、家具和其他居民阻挡移动；三个出生点不被阻挡', () => {
    const game = fixture();
    expect(blockedWithPositions({ x: 12, y: 8 }, [], game.worldMap)).toBe('world blocked');
    for (const f of furniture) expect(blockedWithPositions({ x: f.x, y: f.y }, [], game.worldMap)).toBe('world blocked');
    for (const r of residents) expect(blockedWithPositions(r.spawn, [], game.worldMap)).toBeNull();
    expect(blockedWithPositions(residents[0].spawn, [residents[0].spawn], game.worldMap)).toBe('player');
  });
  it('尚未到达家具不开始使用；到达后持久化使用状态，再结束转下一活动', () => {
    const game = fixture(), p = [...game.world.players.values()][0];
    const agent = new Agent({ id: 'a:1', playerId: p.id });
    houseRoutine(game, 100, p, agent);
    expect(p.houseTask?.stage).toBe('walking');
    expect(p.activity?.description).toContain('前往');
    p.position = { ...p.houseTask!.destination };
    houseRoutine(game, 200, p, agent);
    expect(p.houseTask?.stage).toBe('using');
    expect(p.activity?.description).toBe('在床边休息');
    const restored = fixture();
    restored.world.players.set(p.id, new (p.constructor as any)(p.serialize()));
    expect(restored.world.players.get(p.id)?.houseTask?.stage).toBe('using');
    houseRoutine(game, 13000, p, agent);
    expect(p.houseTask?.furnitureId).toContain('desk-0');
  });
  it('共用座位预约互斥，空闲后能够继续，私人家具只分给所属角色', () => {
    const game = fixture(), [a, , n] = [...game.world.players.values()];
    a.houseCycle = 2; n.houseCycle = 2;
    houseRoutine(game, 1, a, new Agent({ id: 'a:1', playerId: a.id }));
    houseRoutine(game, 2, n, new Agent({ id: 'a:5', playerId: n.id }));
    expect(n.houseTask).toBeUndefined(); expect(n.activity?.description).toBe('等待空闲座位');
    delete a.houseTask;
    houseRoutine(game, 3, n, new Agent({ id: 'a:5', playerId: n.id }));
    expect(n.houseTask?.furnitureId).toBe('shelf:0');
    for (let i = 0; i < 3; i++) expect(routine(i, 0).furnitureId).toContain(`bed-${i}`);
  });
  it('三种中文模拟人格明显标记，告别仍为模拟', () => {
    const answers = residents.map((_, i) => mockDialogue(i, 0));
    expect(new Set(answers).size).toBe(3);
    for (const text of answers) { expect(text).toMatch(/模拟对话/); expect(text).toMatch(/[\u4e00-\u9fff]/); }
    expect(mockDialogue(0, 0, true)).toContain('模拟对话');
  });
});
