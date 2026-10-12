export function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error('用户名需为3～32位英文字母、数字或下划线。');
  return username;
}
export function validPassword(value: string) { return value.length >= 8 && value.length <= 256; }
