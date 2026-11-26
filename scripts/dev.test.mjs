import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

async function until(check, timeout, message) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(message());
}

for (const [mode, command, port, apiPort] of [['personal', 'dev', 1117, 8787], ['demo', 'dev:demo', 1118, 8788]]) {
  test(`${mode} starts the UI and API and releases both ports`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-life-serve-'));
    const proc = spawn('npm', ['run', command], {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, 'session.sqlite')}` },
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
    let snapshot;
    await until(async () => {
      assert.equal(proc.exitCode, null, log);
      try {
        snapshot = await (await fetch(`http://127.0.0.1:${port}/api/snapshot`)).json();
        return true;
      } catch { return false; }
    }, 60000, () => log);
    for (const key of ['items', 'expenses', 'trips']) assert.equal(snapshot[key].length > 0, mode === 'demo');
    assert.match(await (await fetch(`http://127.0.0.1:${port}/`)).text(), /id="root"/);
  });
}
