import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2];
if (!['personal', 'demo'].includes(mode)) throw new Error('请选择 personal 或 demo');
const root = fileURLToPath(new URL('../', import.meta.url));
const host = '127.0.0.1';
// Different origins also isolate browser storage for personal and demo sessions.
const webPort = mode === 'personal' ? 1117 : 1118;
const apiPort = mode === 'personal' ? 8787 : 8788;
const api = `http://${host}:${apiPort}`;
const children = new Set();
let stopping = false;
// npm can exit before forwarding a terminal signal to its lifecycle script.
const parentPid = process.ppid;
const parentWatch = setInterval(() => {
  if (process.ppid !== parentPid) stop(0);
}, 200);
parentWatch.unref();

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', (error) => reject(new Error(`端口 ${port} 无法使用 (${error.code})`)));
    socket.listen(port, host, () => socket.close(resolve));
  });
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message);
    }
  }
}

function start(directory, args, env) {
  const child = spawn(process.execPath, [process.env.npm_execpath, '--prefix', directory, 'run', 'dev', ...args], {
    cwd: root, detached: true, stdio: 'inherit', env: { ...process.env, ...env },
  });
  children.add(child);
  child.once('error', (error) => { console.error(error.message); stop(1); });
  child.once('exit', (code) => {
    stop(code || 1);
    children.delete(child);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
process.on('SIGHUP', () => stop(0));
try {
  await Promise.all([checkPort(apiPort), checkPort(webPort)]);
  if (!stopping) start('server', [], { HOST: host, PORT: String(apiPort), AI_LIFE_MODE: mode });
  const deadline = Date.now() + 60_000;
  while (!stopping) {
    try {
      const response = await fetch(`${api}/api/snapshot`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && Array.isArray((await response.json()).items)) break;
    } catch { /* Prisma and the API are still starting. */ }
    if (Date.now() >= deadline) throw new Error('本机 API 在 60 秒内未就绪，请检查上方后端日志');
    await delay(250);
  }
  if (!stopping) {
    console.log(`本机 API 已就绪，启动 ${mode === 'personal' ? '个人' : '演示'}工作台`);
    start('web', ['--', '--port', String(webPort)], { AI_LIFE_API_URL: api, VITE_AI_LIFE_MODE: mode });
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
