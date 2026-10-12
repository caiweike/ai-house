import { nextPrivateQuota } from './privatePolicy';

test('第500条可发送，第501条被拒绝', () => {
  const now = Date.parse('2026-10-12T10:00:00+08:00');
  const quota = nextPrivateQuota({ day: '2026-10-12', dailyCount: 499, lastSent: now - 2000 }, now);
  expect(quota.dailyCount).toBe(500);
  expect(() => nextPrivateQuota(quota, now + 2000)).toThrow();
});
test('上海午夜重置每日额度，跨日仍保留短时频率限制', () => {
  const lastSent = Date.parse('2026-10-12T23:59:59+08:00');
  const owner = { day: '2026-10-12', dailyCount: 500, lastSent };
  expect(() => nextPrivateQuota(owner, lastSent + 1000)).toThrow();
  expect(nextPrivateQuota(owner, lastSent + 1500)).toEqual({ day: '2026-10-13', dailyCount: 1, lastSent: lastSent + 1500 });
});
test('不同居民共享屋主发送频率，1500毫秒边界才允许下一条', () => {
  const now = Date.parse('2026-10-12T10:00:00+08:00');
  const owner = { day: '2026-10-12', dailyCount: 1, lastSent: now };
  expect(() => nextPrivateQuota(owner, now + 1499)).toThrow();
  expect(nextPrivateQuota(owner, now + 1500).dailyCount).toBe(2);
});
