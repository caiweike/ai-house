import { OwnerLogin } from './house/OwnerLogin';
import { Component, ReactNode, useState } from 'react';
import { useConvexConnectionState, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useHouseGame } from './house/houseGame';
import { residents, roomAt } from '../data/house';
import { HouseCanvas } from './house/HouseCanvas';
import { ResidentPanel } from './house/ResidentPanel';

export class HouseErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="loading-card" role="alert"><h1>小屋暂时没能打开</h1><p>请确认本地服务正在运行，再刷新页面。</p><button onClick={() => location.reload()}>重新打开</button></main> : this.props.children;
  }
}

export default function Home() {
  const status = useQuery(api.world.defaultWorldStatus);
  const game = useHouseGame(status?.worldId);
  const state = useQuery(api.world.worldState, status ? { worldId: status.worldId } : 'skip');
  const journal = useQuery(api.house.journal, status ? { worldId: status.worldId } : 'skip');
  const connection = useConvexConnectionState();
  const model = useQuery(api.llmLedger.status);
  const modelLabel = model?.mode !== 'live' ? '模拟模式 · 无真实模型' : model.fixture ? '本机接口测试 · 非真实 AI' : model.paused ? '新模型请求已暂停 · 规则生活' : model.ready ? (model.unlimitedDev ? '本地真实 AI 开发模式' : '真实 AI 模式') : '真实模型未就绪 · 规则生活';
  const [selected, setSelected] = useState<string>();
  const players = game ? [...game.world.players.values()] : [];
  const selectedPlayer = players.find((p) => p.id === selected);
  const running = status?.status === 'running' && !!state?.engine.running;
  return <div className="house-app">
    <header className="site-header"><a className="wordmark" href="./" aria-label="AI 小屋首页"><span className="house-logo" aria-hidden="true">⌂</span><span>AI 小屋<small>同一屋檐下，各自的小日子</small></span></a><div className="header-actions"><span className="demo-tag">{modelLabel}</span><OwnerLogin /></div></header>
    <main data-world-id={status?.worldId} data-engine-generation={state?.engine.generationNumber}>
      <section className="intro"><div><p className="eyebrow">三位居民，一间小屋</p><h1>进来坐坐，生活正在发生。</h1><p>点一点屋里的居民，看看他们在忙什么。</p></div><div className="live-status" role="status"><i className={connection.isWebSocketConnected && running ? 'dot' : 'dot offline'} />{!connection.isWebSocketConnected ? '正在连接小屋' : running ? '小屋持续运行中' : '小屋暂时休息'}<small>规则生活 · 聊天来源分别标记</small></div></section>
      {!connection.isWebSocketConnected && <p className="notice" role="status">连接暂时中断，正在重新连接。画面会在恢复连接后同步。</p>}
      {!game || !status ? <div className="loading-card"><span className="house-logo">⌂</span><h2>{status === null ? '居民还没有搬进来' : '正在打开小屋'}</h2><p>{status === null ? '请先按照本地运行说明初始化三位居民。' : '正在同步房间与居民的生活状态……'}</p></div> : <div className="house-layout">
        <section className="world-card" aria-label="室内小屋全景">
          <div className="card-heading"><div><span className="eyebrow">小屋全景</span><h2>今天，也一起好好生活</h2></div><span className="quiet-tag">三间卧室 · 公共客厅</span></div>
          <HouseCanvas game={game} engine={state?.engine} selected={selected} onSelect={setSelected} messages={journal?.messages ?? []} />
          <div className="map-caption"><span>点击居民查看详情</span><span>床边休息 · 书架阅读 · 客厅交流</span></div>
          <div className="resident-roster" aria-label="选择居民">{residents.map((r) => {
            const p = players.find((p) => game.playerDescriptions.get(p.id)?.name === r.name);
            return <button className={`resident-card ${p?.id === selected ? 'selected' : ''}`} key={r.name} disabled={!p} onClick={() => p && setSelected(p.id)} aria-label={`查看${r.name}的详情`}><span className="portrait" style={{ '--resident-color': `#${r.color.toString(16)}` } as any} aria-hidden="true">{r.name.slice(0, 1)}</span><span><strong>{r.name}</strong><small>{p ? roomAt(p.position) : '正在搬入'}</small></span><span className="roster-arrow" aria-hidden="true">↗</span></button>;
          })}</div>
        </section>
        {selectedPlayer ? <ResidentPanel key={selectedPlayer.id} game={game} player={selectedPlayer} worldId={status.worldId} onClose={() => setSelected(undefined)} /> : <aside className="welcome-card"><p className="eyebrow">屋里的小日常</p><h2>每个人都有自己的节奏</h2><p>他们会回房休息、整理笔记，也会来到客厅读书和聊聊天。</p><div className="welcome-art" aria-hidden="true"><span>☕</span><span>📖</span><span>🪴</span></div><p className="tip">点击地图中的居民，或下方的名字，打开生活档案。</p><div className="recent-heading">最近发生</div><ul className="mini-events">{journal?.events.slice(0, 4).map((e) => <li key={e._id}><span>{game.playerDescriptions.get(e.actor as any)?.name ?? '居民'}</span>{e.text}</li>)}</ul>{journal && journal.events.length === 0 && <p className="empty">第一段生活记录还在路上。</p>}</aside>}
      </div>}
      <footer className="page-footer">{modelLabel}。生活由服务端持续推进，聊天记录标明来源。<span>记忆、观点与关系保留实际来源；私人记录仅限屋主与对应角色。</span></footer>
    </main>
  </div>;
}
