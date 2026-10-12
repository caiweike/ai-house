import { ConvexError } from 'convex/values';

export function nextPrivateQuota(owner: { day: string; dailyCount: number; lastSent: number }, now: number) {
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const dailyCount = owner.day === day ? owner.dailyCount : 0;
  if (now - owner.lastSent < 1500) throw new ConvexError('发送太快，请稍候再试。');
  if (dailyCount >= 500) throw new ConvexError('今天的私聊消息已达上限，请明天再来。');
  return { lastSent: now, day, dailyCount: dailyCount + 1 };
}
