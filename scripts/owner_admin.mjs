// Loopback management tool. Never prints private keys, hashes, passwords or tokens.
import { readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { Scrypt } from 'lucia';
import { randomBytes } from 'node:crypto';

const cfg = JSON.parse(readFileSync('.convex/local/default/config.json', 'utf8'));
if (cfg.ports.cloud !== 4212 || cfg.ports.site !== 4213) throw new Error('请在现有 app 本地配置中运行。');
const client = new ConvexHttpClient('http://127.0.0.1:4212', { logger: false });
client.setAdminAuth(cfg.adminKey);
if (process.argv.includes('--keys')) {
  const vars = await client.query('_system/cli/queryEnvironmentVariables', {});
  if (vars.some(v => v.name === 'JWT_PRIVATE_KEY') && vars.some(v => v.name === 'JWKS')) {
    console.log('已有签名配置，保持原密钥。');
  } else {
    if (vars.some(v => ['JWT_PRIVATE_KEY', 'JWKS'].includes(v.name))) throw new Error('签名配置不完整，请先检查；不会覆盖原密钥。');
    const keys = await generateKeyPair('RS256', { extractable: true });
    const privateKey = await exportPKCS8(keys.privateKey);
    const publicKey = await exportJWK(keys.publicKey);
    const response = await fetch('http://127.0.0.1:4212/api/update_environment_variables', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Convex ${cfg.adminKey}` },
      body: JSON.stringify({ changes: [
        { name: 'JWT_PRIVATE_KEY', value: privateKey.trimEnd().replace(/\n/g, ' ') },
        { name: 'JWKS', value: JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] }) },
      ] }),
    });
    if (!response.ok) throw new Error('配置签名密钥失败。');
    console.log('本地服务端签名密钥已配置；未写入前端或日志。');
  }
} else {
  let credentials;
  const generated = process.argv.includes('--generate');
  if (generated) {
    credentials = { username: 'owner', password: randomBytes(24).toString('base64url') };
    // Exclusive creation protects existing credentials.
    writeFileSync('.convex/owner-login.json', JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
  } else {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    credentials = JSON.parse(input);
  }
  const username = credentials.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username) || credentials.password.length < 8 || credentials.password.length > 256) throw new Error('用户名需为3～32位英文字母、数字、下划线；密码需为8～256个字符。');
  await client.function('owner:provision', undefined, { username,
    passwordHash: await new Scrypt().hash(credentials.password), rotate: process.argv.includes('--rotate') });
  console.log(generated ? '屋主已配置；本机登录资料保存在被 Git 忽略的 .convex/owner-login.json。' : '屋主密码已设置，历史数据保持，旧会话已失效。');
}
