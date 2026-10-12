import { useEffect, useRef, useState } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { shouldSendMessage } from './inputPolicy';
import { messageSource } from './messageSource';

export function PrivateChat({ worldId, playerId, name }: { worldId: Id<'worlds'>; playerId: string; name: string }) {
  const history = usePaginatedQuery(api.privateChat.history, { worldId, playerId }, { initialNumItems: 30 });
  const send = useMutation(api.privateChat.send);
  const pending = useQuery(api.privateChat.pending, { worldId, playerId });
  const usage = useQuery(api.llmLedger.usage);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const composing = useRef(false);
  const sending = useRef(false);
  const request = useRef<{ text: string; id: string }>();
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastId = history.results[0]?._id;
  useEffect(() => { if (scroll.current && nearBottom.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [lastId]);
  const submit = async () => {
    if (sending.current || pending?.waiting || composing.current || !text.trim()) return;
    const original = text;
    if (request.current?.text !== original) request.current = { text: original, id: crypto.randomUUID() };
    sending.current = true; setBusy(true); setError(''); nearBottom.current = true;
    try {
      await send({ worldId, playerId, text: original, requestId: request.current!.id });
      setText(''); request.current = undefined;
    } catch (e) { setError(e instanceof ConvexError && typeof e.data === 'string' ? e.data : '消息暂时未送达，请重试。内容已保留。'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <div className="private-chat">
    <p className="record-note">仅屋主与{name}的授权记录。每条回复标明来源；模型等待期间，小屋继续生活。</p>
    {usage?.unlimitedDev && <p className="record-note">本地真实 LLM 开发模式：调用次数和日月费用无客户端总上限。自主交流{usage.autonomous ? '已开启' : '已关闭'}；新请求{usage.paused ? '已暂停' : '可用'}。单次输出、并发、超时与熔断保护继续生效。</p>}
    {usage?.realTest && <p className="record-note">有限真实验收：剩余 {usage.realTest.remainingCalls} 次调用{usage.realTest.expires && `，有效至${new Date(usage.realTest.expires).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`}。耗尽或到期后停止模型调用，不生成模拟回复。</p>}
    {usage && <details className="model-usage"><summary>模型用量与预算</summary><p className="record-note">今日记账 ¥{((usage.daily?.spent ?? 0) / usage.currencyUnit).toFixed(4)}，预留 ¥{((usage.daily?.reserved ?? 0) / usage.currencyUnit).toFixed(4)}；本月记账 ¥{((usage.monthly?.spent ?? 0) / usage.currencyUnit).toFixed(4)}。<br />今日 {usage.daily?.calls ?? 0} 次，本月 {usage.monthly?.calls ?? 0} 次；本月可信输入 {usage.monthly?.inputTokens ?? 0} / 输出 {usage.monthly?.outputTokens ?? 0} Token；新增供应商报告输入 {usage.monthly?.reportedInputTokens ?? 0} / 输出 {usage.monthly?.reportedOutputTokens ?? 0} Token（可能不可信）。本月新增记录耗时 {((usage.monthly?.durationMs ?? 0) / 1000).toFixed(1)} 秒。<br />不确定费用 {usage.monthly?.uncertain ?? 0} 次，按预留金额保守记账。价格／用量变化可能影响实际账单。本机假接口使用独立测试账本。{usage.circuit && <><br />真实模型已暂停，请检查后台配置和供应商余额。</>}</p></details>}
    {history.status === 'CanLoadMore' && <button className="history-more" onClick={() => { nearBottom.current = false; history.loadMore(30); }}>查看更早的私聊</button>}
    <div className="private-history" ref={scroll} role="log" aria-label={`${name}的私人聊天记录`} onScroll={() => {
      const s = scroll.current; if (s) nearBottom.current = s.scrollHeight - s.scrollTop - s.clientHeight < 60;
    }}>
      {history.status === 'LoadingFirstPage' ? <p className="empty">正在读取私人记录……</p> : history.results.length === 0 ? <p className="empty">这是你们的私人小窗，写下第一句话吧。</p> : [...history.results].reverse().map(m => <article className={`message ${m.role === 'owner' ? 'mine' : ''}`} key={m._id}>
        <div className="message-meta"><strong>{m.role === 'owner' ? '屋主' : m.role === 'system' ? '小屋系统' : name}</strong><time>{new Date(m.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</time></div><p>{m.text}</p>{m.mode !== 'user' && <span className="mock-label">{messageSource(m.mode)}{m.model && ` · ${m.mode === 'live' ? '请求模型：' : ''}${m.model}`}</span>}
      </article>)}
    </div>
    {pending?.waiting && <p className="record-note" role="status">{name}正在组织回复……</p>}
    <form className="composer" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label htmlFor="private-message">给{name}的私人消息</label>
      <textarea id="private-message" value={text} rows={4} maxLength={8000} disabled={busy} placeholder="在这里慢慢说，支持多行中文……" onChange={e => setText(e.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={e => {
        if (shouldSendMessage(e.key, e.shiftKey, e.nativeEvent.isComposing || composing.current, e.nativeEvent.keyCode)) { e.preventDefault(); void submit(); }
      }} />
      <div className="composer-bottom"><small>回车发送 · 上档键加回车换行<br />{text.length} / 8000 字</small><button type="submit" disabled={busy || pending?.waiting || !text.trim()}>{busy ? '正在发送' : pending?.waiting ? '等待回复' : '发送私信'}</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </div>;
}
