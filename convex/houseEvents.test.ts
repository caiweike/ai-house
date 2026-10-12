import { appendHouseEvent, recordHouseChanges } from './houseEvents';
import { eventParticipants, stepEventKey } from './houseEventModel';

function database() {
  const rows: any[] = [];
  const db: any = {
    get: async (id: string) => rows.find(r => r._id === id) ?? null,
    query: (table: string) => {
      const filters: Record<string, any> = {};
      let descending = false;
      const query: any = {
        withIndex: (_: string, callback: any) => { const q: any = { eq: (key: string, value: any) => { filters[key] = value; return q; } }; callback(q); return query; },
        order: (order: string) => { descending = order === 'desc'; return query; },
        first: async () => rows.filter((r) => Object.entries(filters).every(([key, value]) => r[key] === value)).sort((a,b) => descending ? b.seq-a.seq : a.seq-b.seq)[0] ?? null,
        take: async (n: number) => table === 'houseEvents' ? rows.filter(r => Object.entries(filters).every(([key, value]) => r[key] === value)).slice(0,n) : [],
      };
      return query;
    },
    insert: async (_: string, value: any) => { const _id = `event:${rows.length}`; rows.push({ ...value, _id }); return _id; },
  };
  return { ctx: { db } as any, rows };
}

test('event retry retains ID and sequence; participants include actor exactly once', async () => {
  const { ctx, rows } = database();
  const evidence = { at: 123, participants: ['p:2','p:0','p:2'], source: { type: 'visitorMock' as const, id: 'request' } };
  const first = await appendHouseEvent(ctx, 'world' as any, 'p:0', 'message', '模拟', 'key', evidence);
  const retry = await appendHouseEvent(ctx, 'world' as any, 'p:0', 'message', '模拟', 'key', { ...evidence, at: 456 });
  expect(retry).toBe(first); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ seq: 1, at: 123, participants: ['p:0','p:2'], source: evidence.source, simulated: true });
  expect(eventParticipants('p:0', [])).toEqual(['p:0']);
});

test('room transition retry uses engine generation rather than wall clock', async () => {
  const { ctx, rows } = database();
  const before = { players: [{ id: 'p:0', position: { x: 6, y: 10 } }], conversations: [] };
  const after = { players: [{ id: 'p:0', position: { x: 6, y: 12 } }], conversations: [] };
  await recordHouseChanges(ctx, 'world' as any, before, after, { generation: 9, at: 100 });
  await recordHouseChanges(ctx, 'world' as any, before, after, { generation: 9, at: 200 });
  expect(rows).toHaveLength(1); expect(rows[0].key).toBe(stepEventKey(9, 'p:0', 'room'));
  expect(rows[0].source.generation).toBe(9); expect(rows[0].at).toBe(100);
});

test('conversation lifecycle records all participants and original conversation source', async () => {
  const { ctx, rows } = database();
  const empty = { players: [], conversations: [] };
  const active = { players: [], conversations: [{ id: 'c:8', participants: [{ playerId: 'p:0' }, { playerId: 'p:2' }] }] };
  await recordHouseChanges(ctx, 'world' as any, empty, active, { generation: 10, at: 100 });
  await recordHouseChanges(ctx, 'world' as any, active, empty, { generation: 11, at: 200 });
  expect(rows).toHaveLength(4);
  expect(rows.every((r) => r.source.conversationId === 'c:8' && r.participants.join(',') === 'p:0,p:2')).toBe(true);
  expect(rows.map((r) => r.seq)).toEqual([1,2,3,4]);
});

test('immediate transition to next furniture retains the previous activity completion', async () => {
  const { ctx, rows } = database();
  const base = { id: 'p:0', position: { x: 3, y: 7 } };
  const before = { players: [{ ...base, houseTask: { started: 1, stage: 'using', activity: '在床边休息' } }], conversations: [] };
  const after = { players: [{ ...base, activity: { description: '前往书桌' }, houseTask: { started: 2, stage: 'walking' } }], conversations: [] };
  await recordHouseChanges(ctx, 'world' as any, before, after, { generation: 12, at: 300 });
  expect(rows.map((r) => r.kind).sort()).toEqual(['activityEnd','move']);
  expect(rows.find((r) => r.kind === 'activityEnd').key).toBe('end:p:0:1');
});
