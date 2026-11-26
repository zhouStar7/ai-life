import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { contextualDb } from './requestContext.js';
import { seedIfEmpty } from './seed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-mutations-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execFileSync('npm', ['exec', '--', 'prisma', 'db', 'push', '--skip-generate'], {
  cwd: path.join(import.meta.dirname, '..'), env: process.env, stdio: 'pipe',
});
const db = new PrismaClient();
await seedIfEmpty(db, 'personal');
const app = createApp(db, { auth: true });
const scoped = contextualDb(db);
let fail = true;
app.post('/api/test-transaction', async (c) => {
  await scoped.meal.create({ data: { id: 'test-atomicity', date: '2026-11-26', slot: '午餐', name: '事务样例', time: '12:00', kcal: 1, protein: 1, carb: 1, fat: 1 } });
  return fail ? c.json({ error: 'fixture_failure' }, 500) : c.json({ saved: true });
});
after(() => db.$disconnect());

const account = await app.request('http://localhost/api/auth/register', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'owner', name: '本人', password: 'fixture-owner-pass' }),
});
assert.equal(account.status, 200, await account.clone().text());
const owner = account.headers.getSetCookie()[0].split(';')[0];

async function request(url: string, method = 'GET', body?: object, key?: string, cookie = owner) {
  const headers: Record<string, string> = { cookie, 'content-type': 'application/json' };
  if (key) headers['idempotency-key'] = key;
  const result = await app.request(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: result.status, replay: result.headers.get('idempotency-replayed'), body: await result.json() };
}

const sample = { tag: '食', amount: 12.34, date: '2026-11-26', merchant: '回执样例' };

test('receipts serialize concurrent writes, reject a different payload, and replay a fresh snapshot', async () => {
  const submit = () => request('/api/expenses', 'POST', sample, 'shared-key');
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map((result) => result.status), [200, 200]);
  assert.equal(responses.filter((result) => result.replay === 'true').length, 1);
  assert.equal(await db.expense.count({ where: { merchant: sample.merchant } }), 1);
  assert.equal((await request('/api/expenses', 'POST', { ...sample, amount: 2 }, 'shared-key')).status, 409);
  assert.equal((await request('/api/expenses', 'POST', { ...sample, amount: 0.66, merchant: '稍后写入' }, 'later-key')).status, 200);
  const replay = await submit();
  assert.equal(replay.body.snapshot.expenses.length, 2);
  assert.equal(replay.replay, 'true');

  const body = { username: 'guest', name: '成员', password: 'fixture-guest-pass' };
  assert.equal((await request('/api/auth/members', 'POST', body)).status, 200);
  const login = await app.request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(login.status, 200);
  const guest = login.headers.getSetCookie()[0].split(';')[0];
  const independent = await request('/api/expenses', 'POST', sample, 'shared-key', guest);
  assert.equal(independent.status, 200);
  assert.equal(independent.replay, null);
  assert.equal(independent.body.snapshot.expenses.length, 1);
});

test('a failed local mutation rolls back the write and releases its key', async () => {
  const submit = () => request('/api/test-transaction', 'POST', {}, 'retry-key');
  assert.equal((await submit()).status, 500);
  assert.equal(await db.meal.count({ where: { id: 'test-atomicity' } }), 0);
  assert.equal(await db.mutationReceipt.count({ where: { key: 'retry-key' } }), 0);
  fail = false;
  assert.equal((await submit()).body.saved, true);
  assert.equal((await submit()).replay, 'true');
});

test('expense cursor keeps stable order within a date and totals exact cents', async () => {
  const url = '/api/expenses?month=2026-11&tag=食&limit=1';
  const first = await request(url);
  assert.equal(first.status, 200);
  assert.equal(first.body.rows.length, 1);
  assert.equal(first.body.total, 2);
  assert.equal(first.body.amount, 13);
  const second = await request(`${url}&cursor=${encodeURIComponent(first.body.nextCursor)}`);
  assert.equal(second.status, 200);
  assert.equal(second.body.nextCursor, null);
  assert.notEqual(first.body.rows[0].id, second.body.rows[0].id);
  assert.equal((await request(`${url}&cursor=bad`)).status, 400);
});

test('agent receipts are local, idempotent, and do not execute a scene', async () => {
  const payload = { key: 'cross', actions: [
    { type: 'add_expense', id: 'ai-fixed-id', tag: '行', amount: 0.01, date: sample.date, merchant: '确认后的建议' },
    { type: 'apply_scene', name: '离家' },
  ] };
  const empty = await request('/api/agent/adopt', 'POST', { key: 'cross', actions: [] });
  assert.deepEqual(empty.body.results, []);
  const adopted = await request('/api/agent/adopt', 'POST', payload);
  assert.equal(adopted.status, 200);
  assert.deepEqual(adopted.body.results, [
    { type: 'add_expense', status: 'done' }, { type: 'apply_scene', status: 'skipped', error: 'confirmation_required' },
  ]);
  assert.equal(adopted.body.snapshot.activeScene, null);
  const repeated = await request('/api/agent/adopt', 'POST', payload);
  assert.equal(repeated.body.results[0].status, 'skipped');
  assert.equal(await db.expense.count({ where: { merchant: '确认后的建议' } }), 1);
});
