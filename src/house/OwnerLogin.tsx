import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export function OwnerLogin() {
  const owner = useQuery(api.owner.status);
  const { signIn, signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="owner-access">
    {owner?.isOwner ? <button disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await signOut(); } catch { setError('退出失败，请检查连接后重试。'); }
      finally { setBusy(false); }
    }}>{busy ? '正在退出' : '屋主已登录 · 退出登录'}</button> : <button onClick={() => { setOpen(!open); setError(''); }}>屋主登录</button>}
    {open && !owner?.isOwner && <form className="owner-form" aria-label="屋主登录" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const data = new FormData(e.currentTarget); data.set('flow', 'signIn');
      setBusy(true); setError('');
      try { await signIn('password', data); setOpen(false); }
      catch { setError('登录失败，请检查账户与密码；多次失败后请稍后再试。'); }
      finally { setBusy(false); }
    }}>
      <p>仅屋主可登录。访客无需账户即可观察小屋。</p>
      <label htmlFor="owner-username">用户名</label><input id="owner-username" name="username" type="text" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" />
      <label htmlFor="owner-password">密码</label><input id="owner-password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={256} />
      <button type="submit" disabled={busy}>{busy ? '正在验证' : '登录小屋'}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
