import { projectPrivateMessage, projectHouseEvent } from './cognitionStore';
export function fixture() {
  const rows: any[] = [];
  let user: string | null = null;
  const db: any = {
    get: async (id: string) => rows.find(r => r._id === id) ?? null,
    normalizeId: (_: string, id: string) => id,
    insert: async (table: string, value: any) => { const id = `${table}:${rows.length}`; rows.push({ ...value, _id: id, _creationTime: rows.length, table }); return id; },
    patch: async (id: string, value: any) => { Object.assign(rows.find(r => r._id === id), value); },
    query: (table: string) => {
      const filters: ((r: any) => boolean)[] = [];
      let order = 1;
      const q: any = {
        eq: (k: any, v: any) => { if (typeof k === 'function') return (r: any) => k(r) === v; filters.push(r => r[k] === v); return q; },
        gt: (k: any, v: any) => { if (typeof k === 'function') return (r: any) => k(r) > v; filters.push(r => r[k] > v); return q; },
        lte: (k: string, v: any) => { filters.push(r => r[k] <= v); return q; },
        gte: (k: string, v: any) => { filters.push(r => r[k] >= v); return q; },
        and: (...fs: any[]) => (r: any) => fs.every(f => f(r)),
        or: (...fs: any[]) => (r: any) => fs.some(f => f(r)),
        field: (k: string) => (r: any) => r[k],
        search: (k: string, text: string) => { const terms = text.split(' '); filters.push(r => terms.some(t => r[k].split(' ').includes(t))); return q; },
      };
      const result = () => rows.filter(r => r.table === table && filters.every(f => f(r)))
        .sort((a, b) => order * ((a.at ?? a.seq ?? a._creationTime) - (b.at ?? b.seq ?? b._creationTime)));
      const query: any = {
        withIndex: (_: string, cb: any) => { cb(q); return query; },
        withSearchIndex: (_: string, cb: any) => { cb(q); return query; },
        filter: (cb: any) => { filters.push(cb(q)); return query; },
        order: (direction: string) => { order = direction === 'desc' ? -1 : 1; return query; },
        collect: async () => result(), first: async () => result()[0] ?? null, unique: async () => result()[0] ?? null,
        take: async (n: number) => result().slice(0, n),
        paginate: async ({ numItems, cursor }: any) => { const offset = Number(cursor ?? 0), r = result(); return { page: r.slice(offset, offset + numItems), isDone: offset + numItems >= r.length, continueCursor: String(offset + numItems) }; },
      };
      return query;
    },
  };
  const ctx: any = { db, auth: { getUserIdentity: async () => user ? { issuer: process.env.CONVEX_SITE_URL, subject: `${user}|session` } : null } };
  const pair = { worldId: 'world', playerId: 'p:0' };
  rows.push({ _id: 'world', table: 'worlds', players: [{ id: 'p:0' }, { id: 'p:2' }, { id: 'p:4' }] },
    { _id: 'status', table: 'worldStatus', worldId: 'world', isDefault: true },
    { _id: 'owner', table: 'houseOwners', userId: 'user' },
    { _id: 'session', table: 'authSessions', userId: 'user', expirationTime: Date.now() + 10000000 },
    ...['艾莉丝', '桃桃', '诺瓦'].map((name, i) => ({ _id: `description:${i}`, table: 'playerDescriptions', worldId: 'world', playerId: `p:${i * 2}`, name })));
  const privateMessage = async (text: string, role = 'resident', mode = 'live', at = rows.length * 1000, playerId = 'p:0') => {
    const id = await db.insert('privateMessages', { ...pair, playerId, ownerId: 'user', role, mode, at, text, requestId: `request-${rows.length}` });
    await projectPrivateMessage(ctx, id); return id;
  };
  const publicMessage = async (text: string, author = 'p:0', mode = 'live', conversationId = 'c:1') => {
    const id = await db.insert('messages', { worldId: 'world', author, mode, text, conversationId, messageUuid: `uuid-${rows.length}` });
    const m = await db.get(id);
    const event = await db.insert('houseEvents', { worldId: 'world', actor: author, kind: 'message', text: '分享了一句话', key: m.messageUuid, at: rows.length * 1000,
      simulated: mode !== 'live', participants: ['p:0', 'p:2'], source: { type: 'agentMessage', id: m.messageUuid, conversationId } });
    await projectHouseEvent(ctx, event); return event;
  };
  const end = async (actor = 'p:0', conversationId = 'c:1') => {
    const id = await db.insert('houseEvents', { worldId: 'world', actor, kind: 'conversationEnd', text: '结束了与室友的交流', at: rows.length * 1000,
      simulated: false, participants: ['p:0', 'p:2'], source: { type: 'worldStep', id: 'generation:1', conversationId } });
    await projectHouseEvent(ctx, id); return id;
  };
  return { ctx, db, rows, pair, privateMessage, publicMessage, end, login: (u: string | null = 'user') => { user = u; } };
}
