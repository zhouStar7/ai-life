import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';
import { sessionCookie } from './testSession.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-reliability-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('./node_modules/.bin/prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'), env: process.env, stdio: 'pipe',
});
const db = new PrismaClient();
await seedIfEmpty(db);
const server = serve({ fetch: createApp(db).fetch, port: 0, hostname: '127.0.0.1' });
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('port');
const base = `http://127.0.0.1:${address.port}`;
const cookie = await sessionCookie(base);

after(async () => { server.close(); await db.$disconnect(); });

async function request(pathname: string, init?: RequestInit) {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, 'x-client-version': '2', ...(init?.headers ?? {}) },
  });
  return { response, body: await response.json() };
}

test('a repeated mutation key replays one committed expense', async () => {
  const input = {
    method: 'POST',
    headers: { 'idempotency-key': 'lost-response-expense' },
    body: JSON.stringify({ tag: '食', amount: 12.34, date: '2026-10-19', merchant: '重试测试', note: '只记一次' }),
  };
  const first = await request('/api/expenses', input);
  const replay = await request('/api/expenses', input);
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(replay.body, first.body);
  assert.equal(await db.expense.count({ where: { merchant: '重试测试' } }), 1);
});

test('a mutation key cannot be reused for different input', async () => {
  const result = await request('/api/expenses', {
    method: 'POST', headers: { 'idempotency-key': 'lost-response-expense' },
    body: JSON.stringify({ tag: '食', amount: 99, merchant: '另一个请求' }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, 'key_reused');
});

test('compact snapshots omit ledger rows and expose paginated summaries', async () => {
  const snapshot = await request('/api/snapshot');
  assert.deepEqual(snapshot.body.expenses, []);
  assert.equal(snapshot.body.items.some((item: { cover: string }) => item.cover.startsWith('data:image/')), false);
  const ledger = await request('/api/expenses?limit=5&month=2026-09');
  assert.equal(ledger.response.status, 200);
  assert.equal(ledger.body.rows.length, 5);
  assert.equal(typeof ledger.body.summary.monthTotal, 'number');
  assert.equal(ledger.body.nextCursor === null || typeof ledger.body.nextCursor === 'string', true);
});

test('stored trip dates derive current status instead of trusting stale labels', async () => {
  await db.trip.create({ data: {
    id: 'trip-expired', memberId: 'm-xingyu', title: '旧行程', status: '即将开始', transport: '高铁',
    dateLabel: '2026-09-01 – 2026-09-02', startDate: '2026-09-01', endDate: '2026-09-02',
    tickets: '[]', timeline: '[]', packing: '[]', prepAdopted: false,
  } });
  const snapshot = await request('/api/snapshot');
  assert.equal(snapshot.body.trips.find((trip: { id: string }) => trip.id === 'trip-expired').status, '已结束');
});
