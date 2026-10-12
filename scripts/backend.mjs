import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// Never attach this release's tests to another project's active backend.
for (const port of [4212, 4213]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Release port ${port} is occupied; refusing to reuse it.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const isolatedEnv = { ...process.env };
for (const key of Object.keys(isolatedEnv)) {
  if (/^(CONVEX_|HOUSE_|VITE_)/.test(key)) delete isolatedEnv[key];
}
// The native local backend otherwise binds every network interface. Pin to loopback.
const bundle = path.join(root, 'node_modules/convex/dist/cli.bundle.cjs');
const source = readFileSync(bundle, 'utf8');
const marker = 'const commandArgs = [\n    "--port",';
const patched = 'const commandArgs = [\n    "--interface", "127.0.0.1", "--disable-beacon",\n    "--port",';
if (!source.includes(patched)) {
  if (source.split(marker).length !== 2) throw new Error('本地后端启动参数已变化，请核对绑定地址后再启动。');
  writeFileSync(bundle, source.replace(marker, patched));
}
const child = spawn(process.execPath, ['node_modules/convex/bin/main.js', 'dev',
  '--local-cloud-port', '4212', '--local-site-port', '4213',
  '--local-backend-version', 'precompiled-2026-10-06-a3538c6', '--tail-logs', 'disable'], {
  cwd: root, stdio: 'inherit', env: { ...isolatedEnv, CONVEX_AGENT_MODE: 'anonymous', NODE_USE_ENV_PROXY: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => { process.exitCode = code ?? 1; });
