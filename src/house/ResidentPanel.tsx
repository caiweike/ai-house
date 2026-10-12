import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import type { HouseGame as ServerGame, HousePlayer as Player } from './houseGame';
import { residents, roomAt } from '../../data/house';
import { PrivateChat } from './PrivateChat';
import { GameId } from '../../convex/aiTown/ids';
import { messageSource } from './messageSource';
import { CognitionPanel } from './CognitionPanel';

const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export function chineseTime(at: number) { return timeFormat.format(at); }
const eventKinds: Record<string, string> = { arrival: '入住', room: '到达', move: '出发', activity: '活动', activityEnd: '活动结束', conversation: '相遇', conversationEnd: '交流结束', message: '室友发言' };
const sourceKinds: Record<string, string> = { worldStep: '小屋生活调度', agentMessage: '室友发言，来源见事件标识', visitorMock: '本地模拟留言', legacy: '旧记录，未记录原始来源' };

export function ResidentPanel({ game, player, worldId, onClose }: { game: ServerGame; player: Player; worldId: Id<'worlds'>; onClose: () => void }) {
  const name = game.playerDescriptions.get(player.id)?.name;
  const r = residents.find((r) => r.name === name) ?? residents[0];
  const history = useQuery(api.house.journal, { worldId, playerId: player.id });
  const owner = useQuery(api.owner.status);
  const [tab, setTab] = useState<'events' | 'chat' | 'private' | 'memories' | 'beliefs' | 'relationships'>('events');
  const conversation = game.world.playerConversation(player);
  const activity = conversation ? '正在与室友交流' : player.activity?.description ?? '正在安静地观察小屋';
  const state = conversation ? '交流中' : player.houseTask?.stage === 'walking' ? '行走中' : player.houseTask?.stage === 'using' ? '活动中' : '稍作等待';
  const messages = history?.messages.slice(-20) ?? [];
  const npcScroll = useRef<HTMLDivElement>(null);
  const lastNpcId = messages.at(-1)?._id;
  useEffect(() => { if (npcScroll.current) npcScroll.current.scrollTop = npcScroll.current.scrollHeight; }, [lastNpcId, tab]);
  return <aside className={`resident-panel ${tab === 'private' ? 'private-panel-active' : ''}`} aria-label={`${r.name}的生活档案`}>
    <div className="panel-top"><span className="eyebrow">居民档案</span><button className="icon-button" onClick={onClose} aria-label="关闭居民档案">×</button></div>
    <div className="profile"><span className="portrait large" style={{ '--resident-color': `#${r.color.toString(16)}` } as any} aria-hidden="true">{r.name.slice(0, 1)}</span><div><h2>{r.name}</h2><span className="personality">{r.tag}</span></div><span className="state-badge">{state}</span></div>
    <p className="bio">{r.identity}</p>
    <dl className="current-status"><div><dt>自己的房间</dt><dd>{r.name}的卧室</dd></div><div><dt>现在的位置</dt><dd>{roomAt(player.position)}</dd></div><div><dt>正在做什么</dt><dd>{activity}</dd></div></dl>
    <div className="panel-tabs" role="tablist" aria-label="居民记录">{([{ id: 'events', label: '生活记录' }, { id: 'chat', label: '聊天记录' }, { id: 'private', label: '私聊' }, { id: 'memories', label: '记忆' }, { id: 'beliefs', label: '观点' }, { id: 'relationships', label: '关系' }] as const).map(t => <button key={t.id} id={`${t.id}-tab`} role="tab" aria-selected={tab === t.id} aria-controls={`${t.id}-panel`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {tab === 'memories' || tab === 'beliefs' || tab === 'relationships' ? <div id={`${tab}-panel`} role="tabpanel" aria-labelledby={`${tab}-tab`}><CognitionPanel key={`${player.id}:${tab}:${!!owner?.isOwner}`} pair={{ worldId, playerId: player.id }} tab={tab} owner={!!owner?.isOwner} names={Object.fromEntries([...game.playerDescriptions].map(([id, d]) => [id, d.name]))} /></div> : tab === 'private' ? <div id="private-panel" role="tabpanel" aria-labelledby="private-tab">{owner?.isOwner ? <PrivateChat key={player.id} worldId={worldId} playerId={player.id} name={r.name} /> : <p className="empty">私人聊天仅向屋主开放。请使用页面上方的「屋主登录」，访客可继续观看生活记录。</p>}</div> : !history ? <p className="empty" role="status">正在翻开生活记录……</p> : tab === 'events' ? <div id="events-panel" role="tabpanel" aria-labelledby="events-tab" className="timeline"><p className="record-note">服务端记录的真实活动；模板交流单独标注为模拟。</p>{history.events.length === 0 ? <p className="empty">还没有生活记录，稍等一会儿再来看看。</p> : history.events.map((e) => <article className="event" key={e._id}><div className="event-meta"><time>{chineseTime(e.at)}</time><span>{eventKinds[e.kind] ?? '生活'}</span>{e.simulated && <b>模拟</b>}</div><p>{e.text}</p><details><summary>查看记录来源</summary><p className="record-note">参与者：{(e.participants ?? [e.actor]).map((id) => id === 'visitor:local-mock' ? '本地体验者' : game.playerDescriptions.get(id as GameId<'players'>)?.name ?? '居民').join('、')}<br />来源：{sourceKinds[e.source?.type ?? 'legacy']}<br />记录序号：{e.seq}</p></details></article>)}</div> : <div id="chat-panel" role="tabpanel" aria-labelledby="chat-tab" className="chat-panel">
      <p className="record-note">室友交流由后端自主发起。每条消息注明真实模型、模拟或本机测试来源。</p>
      <div className="message-history" ref={npcScroll}>{messages.length === 0 ? <p className="empty">还没有室友聊天，居民相遇后会留下记录。</p> : messages.map((m) => <article key={m._id} className="message"><div className="message-meta"><strong>{game.playerDescriptions.get(m.author as GameId<'players'>)?.name ?? '居民'}</strong><time>{chineseTime(m._creationTime)}</time></div><p>{m.text}</p><span className="mock-label">{messageSource(m.mode)}</span></article>)}</div>
      <h3 className="demo-heading">历史公开模拟留言</h3><p className="record-note">以下是任务1、2的公开体验记录，已保留原文。新的私人消息请进入「私聊」。</p>
      <div className="demo-history">{history.demo.map(m => <article className="message" key={m._id}><div className="message-meta"><strong>{m.author}</strong><time>{chineseTime(m.at)}</time></div><p>{m.text}</p></article>)}</div>
    </div>}
  </aside>;
}
