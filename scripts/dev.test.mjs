import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { testPorts } from './testPorts.mjs';

async function until(check, timeout, message) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(message());
}

for (const [mode, command] of [['personal', 'dev'], ['demo', 'dev:demo']]) {
  test(`${mode} starts the UI and API and releases both ports`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-life-serve-'));
    const { webPort: port, apiPort } = await testPorts();
    const proc = spawn('npm', ['run', command], {
      env: {
        ...process.env, DATABASE_URL: `file:${join(dir, 'session.sqlite')}`,
        AI_LIFE_WEB_PORT: String(port), AI_LIFE_API_PORT: String(apiPort),
      },
      detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exit = once(proc, 'exit');
    let log = '';
    proc.stdout.on('data', (data) => { log += data; });
    proc.stderr.on('data', (data) => { log += data; });
    t.after(async () => {
      if (proc.exitCode === null && proc.signalCode === null) process.kill(-proc.pid, 'SIGTERM');
      await exit;
      for (const p of [port, apiPort]) {
        await until(() => fetch(`http://127.0.0.1:${p}/`).then(() => false, () => true), 5000, () => `Port ${p} still listening`);
      }
    });
    const base = `http://127.0.0.1:${port}`;
    await until(async () => {
      assert.equal(proc.exitCode, null, log);
      return fetch(`${base}/api/health`).then((response) => response.ok, () => false);
    }, 60000, () => log);
    let response = await fetch(`${base}/api/snapshot`);
    if (mode === 'personal') {
      assert.equal(response.status, 401);
      const account = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'owner', name: '本人', password: 'a-long-fixture-password' }),
      });
      assert.equal(account.status, 200, await account.clone().text());
      const cookie = account.headers.get('set-cookie').split(';')[0];
      response = await fetch(`${base}/api/snapshot`, { headers: { cookie } });
    }
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    for (const key of ['items', 'expenses', 'trips']) assert.equal(snapshot[key].length > 0, mode === 'demo');
    assert.match(await (await fetch(`http://127.0.0.1:${port}/`)).text(), /id="root"/);
  });
}
