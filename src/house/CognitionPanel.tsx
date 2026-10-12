import { useState } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { knowledgeLabels } from '../../convex/cognitionPolicy';

const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
const stanceName = { agree: '支持', disagree: '反对', uncertain: '不确定' };
type Pair = { worldId: Id<'worlds'>; playerId: string };
type Tab = 'memories' | 'beliefs' | 'relationships';
type Source = { memoryId: Id<'houseMemories'>; private: boolean } | { eventId: Id<'houseEvents'> };

function Evidence({ source, owner, names, onClose }: { source: Source; owner: boolean; names: Record<string, string>; onClose: () => void }) {
  const allowed = !('memoryId' in source && source.private && !owner);
  const memory = useQuery(api.cognition.evidence, allowed && 'memoryId' in source ? { memoryId: source.memoryId } : 'skip');
  const event = useQuery(api.cognition.eventEvidence, 'eventId' in source ? { eventId: source.eventId } : 'skip');
  const data = memory ?? event;
  if (!allowed) return null;
  return <section className="cognition-evidence" aria-label="保存的来源记录"><button onClick={onClose}>收起来源</button><h3>保存的来源记录</h3>{!data ? <p className="empty">正在读取来源……</p> : <>
    {'privateMessage' in data && data.privateMessage ? <><p>私人消息 · {dateFormat.format(data.privateMessage.at)}</p><p>{data.privateMessage.role === 'owner' ? '屋主' : '角色'}：{data.privateMessage.text}</p><small>消息编号：{data.privateMessage._id}<br />请求编号：{data.privateMessage.requestId}</small></> : data.event && <><p>世界事件 · {dateFormat.format(data.event.at)} · 序号 {data.event.seq}</p><p>{data.event.text}</p><small>事件编号：{data.event._id}<br />来源标识：{data.event.source?.id ?? '旧记录'}<br />参与者：{data.event.participants?.map(id => names[id] ?? (id === 'owner' ? '屋主' : id)).join('、')}</small></>}
    {data.messages.map(m => <article className="message" key={m._id}><div className="message-meta"><span>{names[m.author] ?? '居民'}</span><time>{dateFormat.format(m._creationTime)}</time></div><p>{m.text}</p><small>{m.mode === 'live' ? '真实 AI 发言，内容未证实' : '模拟或测试发言'} · {m._id}</small></article>)}
  </>}</section>;
}
function Memories({ pair, privateScope, names, onSource }: { pair: Pair; privateScope: boolean; names: Record<string, string>; onSource: (source: Source) => void }) {
  const page = usePaginatedQuery(api.cognition.memories, { ...pair, private: privateScope }, { initialNumItems: 20 });
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const recalled = useQuery(api.cognition.recall, search ? { ...pair, private: privateScope, text: search } : 'skip');
  const rows = search ? recalled : page.results;
  return <><form className="memory-search" onSubmit={e => { e.preventDefault(); setSearch(input.trim()); }}><label htmlFor="memory-query">检索经历</label><input id="memory-query" value={input} onChange={e => setInput(e.target.value)} maxLength={300} placeholder="例如：探索、读书" /><button type="submit">检索</button>{search && <button type="button" onClick={() => { setInput(''); setSearch(''); }}>查看全部</button>}</form>
    {!rows || page.status === 'LoadingFirstPage' ? <p className="empty">正在读取记忆……</p> : rows.length === 0 ? <p className="empty">此范围还没有保存的记忆。</p> : rows.map(m => <article className="event cognition-record" key={m._id}>
      <div className="event-meta"><time>{dateFormat.format(m.at)}</time><span>{m.scope === 'public' ? '公开' : '仅屋主与本角色'}</span></div><p className="knowledge-tag">{knowledgeLabels[m.kind]}{m.origin === 'test' ? ' · 本地模拟测试' : ''}</p><p>{m.summary}</p><small>重要程度：{m.importance}/10 · {m.participants.map(id => names[id] ?? (id === 'owner' ? '屋主' : id)).join('、')}</small><button className="source-link" onClick={() => onSource({ memoryId: m._id, private: privateScope })}>查看实际来源</button>
    </article>)}
    {!search && page.status === 'CanLoadMore' && <button className="history-more" onClick={() => page.loadMore(20)}>读取更早记忆</button>}
  </>;
}
function BeliefHistory({ id, privateScope, onSource }: { id: Id<'houseBeliefs'>; privateScope: boolean; onSource: (s: Source) => void }) {
  const page = usePaginatedQuery(api.cognition.beliefHistory, { beliefId: id }, { initialNumItems: 10 });
  return <>{page.results.map(h => <article className="revision" key={h._id}><time>{dateFormat.format(h.at)}</time><p>{h.before ? `${stanceName[h.before.stance]}（${h.before.confidence}）` : '尚未记录立场'} → {stanceName[h.after.stance]}（{h.after.confidence}）</p>{h.after.position && <p>立场说明：{h.before?.position ?? '此前未单独记录说明'} → {h.after.position}</p>}<p>{h.reason}</p><button className="source-link" onClick={() => onSource({ memoryId: h.memoryId, private: privateScope })}>查看修订依据</button>{h.sourceMemoryIds?.map((sourceId, index) => <button className="source-link" key={sourceId} onClick={() => onSource({ memoryId: sourceId, private: privateScope })}>查看依据 {index + 1}</button>)}</article>)}{page.status === 'CanLoadMore' && <button onClick={() => page.loadMore(10)}>读取更早修订</button>}</>;
}
function Beliefs({ pair, privateScope, onSource }: { pair: Pair; privateScope: boolean; onSource: (s: Source) => void }) {
  const rows = useQuery(api.cognition.beliefs, { ...pair, private: privateScope });
  return !rows ? <p className="empty">正在读取观点……</p> : rows.length === 0 ? <p className="empty">还没有带明确理由的角色立场。聊天可以保留原观点。</p> : <>{rows.map(b => <article className="event cognition-record" key={b._id}><h3>{b.topic}</h3><p>{stanceName[b.value.stance]} · 确信度 {b.value.confidence}/100{b.origin === 'test' ? ' · 本地模拟测试' : ''}</p>{b.value.position && <p>当前立场说明：{b.value.position}</p>}<p>{b.reason}</p><details><summary>观点更新历史</summary><BeliefHistory id={b._id} privateScope={privateScope} onSource={onSource} /></details></article>)}</>;
}
function RelationHistory({ id, onSource }: { id: Id<'houseRelationships'>; onSource: (s: Source) => void }) {
  const page = usePaginatedQuery(api.cognition.relationshipHistory, { relationshipId: id }, { initialNumItems: 10 });
  return <>{page.results.map(h => <article className="revision" key={h._id}><time>{dateFormat.format(h.at)}</time><p>信任 {h.before.trust} → {h.after.trust} · 亲近 {h.before.closeness} → {h.after.closeness}</p><p>{h.reason}</p><button className="source-link" onClick={() => onSource({ eventId: h.eventId })}>查看互动事件与发言</button></article>)}{page.status === 'CanLoadMore' && <button onClick={() => page.loadMore(10)}>读取更早互动</button>}</>;
}
function Relationships({ pair, names, onSource }: { pair: Pair; names: Record<string, string>; onSource: (s: Source) => void }) {
  const rows = useQuery(api.cognition.relationships, pair);
  return !rows ? <p className="empty">正在读取关系……</p> : <>{rows.map(r => <article className="event cognition-record" key={r.to}><h3>{names[pair.playerId]} → {names[r.to] ?? '室友'}</h3><p>信任 {r.value.trust}/100 · 亲近 {r.value.closeness}/100</p>{!r.history.length ? <p className="record-note">初始规则值：信任50、亲近0。尚无符合条件的关系修订。</p> : <details><summary>关系变化与重要互动</summary><RelationHistory id={r.id!} onSource={onSource} /></details>}</article>)}</>;
}
export function CognitionPanel({ pair, tab, owner, names }: { pair: Pair; tab: Tab; owner: boolean; names: Record<string, string> }) {
  const [privateScope, setPrivateScope] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const effectivePrivate = owner && privateScope;
  return <div className="cognition-panel"><p className="record-note">记录来自保存的事件或消息。角色陈述与猜测不等于世界事实；关系及确信度是小屋规则指标。</p>
    {tab !== 'relationships' && <div className="scope-switch"><button aria-pressed={!effectivePrivate} onClick={() => { setPrivateScope(false); setSource(null); }}>公开记录</button>{owner && <button aria-pressed={effectivePrivate} onClick={() => { setPrivateScope(true); setSource(null); }}>本角色私有记录</button>}</div>}
    {!owner && tab !== 'relationships' && <p className="record-note">访客只能查看公开记录。私人记忆与观点需屋主登录。</p>}
    {source && <Evidence source={source} owner={owner} names={names} onClose={() => setSource(null)} />}
    {tab === 'memories' ? <Memories key={`${pair.playerId}:${effectivePrivate}`} pair={pair} privateScope={effectivePrivate} names={names} onSource={setSource} /> : tab === 'beliefs' ? <Beliefs key={`${pair.playerId}:${effectivePrivate}`} pair={pair} privateScope={effectivePrivate} onSource={setSource} /> : <Relationships pair={pair} names={names} onSource={setSource} />}
  </div>;
}
