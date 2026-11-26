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

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-auth-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('./node_modules/.bin/prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'pipe',
});

const db = new PrismaClient();
await seedIfEmpty(db);
const server = serve({ fetch: createApp(db).fetch, port: 0, hostname: '127.0.0.1' });
await new Promise<void>((resolve) => {
  if (server.listening) resolve();
  else server.once('listening', () => resolve());
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('port');
const base = `http://127.0.0.1:${address.port}`;

after(async () => {
  server.close();
  await db.$disconnect();
});

let cookie = '';
async function json(pathname: string, init?: RequestInit) {
  if (!cookie) cookie = await sessionCookie(base);
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init?.headers ?? {}) },
  });
  const body = await response.json();
  return { status: response.status, body };
}

test('business routes require a login cookie', async () => {
  const response = await fetch(`${base}/api/snapshot`);
  assert.equal(response.status, 401);
  const session = await fetch(`${base}/api/auth/session`);
  assert.equal(session.status, 401);
  const body = await session.json();
  assert.equal(body.register, false);
  assert.equal(JSON.stringify(body).includes('scrypt'), false);
});

test('another member sees a separate wardrobe and ledger', async () => {
  const mine = await json('/api/snapshot');
  assert.equal(mine.body.member.username, 'xingyu');
  assert.equal(mine.body.items.length, 6);
  assert.ok(mine.body.expenses.length > 0);
  const created = await json('/api/members', {
    method: 'POST',
    body: JSON.stringify({ username: 'lin', name: '林林', password: 'life-local' }),
  });
  assert.equal(created.status, 200);
  const other = await sessionCookie(base, 'lin', 'life-local');
  const response = await fetch(`${base}/api/snapshot`, { headers: { cookie: other } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.member.name, '林林');
  assert.equal(body.items.length, 0);
  assert.equal(body.expenses.length, 0);
  assert.equal(body.meals.length, 0);
  assert.equal(body.trips.length, 0);
  assert.ok(body.devices.length > 0);
  const again = await json('/api/snapshot');
  assert.equal(again.body.items.length, 6);
  assert.equal(again.body.expenses.length, mine.body.expenses.length);
});
