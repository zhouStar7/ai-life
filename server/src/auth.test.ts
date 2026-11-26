import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { hashPassword, openSession, secureLegacyCredentials } from './auth.js';
import { serverRoot } from './databaseEnvironment.js';
import { seedIfEmpty } from './seed.js';

async function personalDb(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'ai-life-auth-'));
  const datasourceUrl = `file:${join(root, 'personal.sqlite')}`;
  const db = new PrismaClient({ datasourceUrl });
  t.after(async () => {
    await db.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], {
    cwd: serverRoot, env: { ...process.env, DATABASE_URL: datasourceUrl, AI_LIFE_MODE: 'personal' },
  });
  await seedIfEmpty(db, 'personal');
  return db;
}

const password = 'test-password';
const account = (username: string) => ({ username, name: username, password });
const json = (body: object, cookie = '') => ({
  method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
});
const cookieFrom = (response: Response) => response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');

test('one owner wins first registration and accounts remain isolated', async (t) => {
  const db = await personalDb(t);
  await db.expense.create({ data: { id: 'old', amountCents: 500n, merchant: 'Existing', note: '', tag: '食', date: '2026-09-01' } });
  const app = createApp(db, { auth: true });
  assert.equal((await app.request('/api/health')).status, 200);
  assert.equal((await app.request('/api/snapshot', { headers: { cookie: 'ailife=%xx' } })).status, 401);
  const pendingSession = await app.request('/api/auth/session');
  assert.equal((await pendingSession.json()).needsSetup, true);
  for (const response of await Promise.all([
    app.request('http://example.test/api/auth/register', json(account('plain'))),
    app.request('/api/auth/register', { ...json(account('remote')), headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } }),
  ])) assert.equal(response.status, 403);
  assert.equal((await app.request('/api/auth/register', json({ ...account('large'), password: 'x'.repeat(5000) }))).status, 413);

  const registered = await Promise.all(['owner-a', 'owner-b'].map(username => (
    app.request('/api/auth/register', json(account(username)))
  )));
  assert.deepEqual(registered.map(response => response.status).sort(), [200, 403]);
  const owner = registered.find(response => response.ok)!;
  const ownerCookie = cookieFrom(owner);
  const session = await owner.json();
  assert.equal(session.member.id, 'local');
  assert.equal(session.member.isOwner, true);
  assert.equal(await db.member.count(), 1);
  assert.match(owner.headers.getSetCookie()[0], /HttpOnly; Path=\/; SameSite=Lax/);
  assert.doesNotMatch(owner.headers.getSetCookie()[0], /Secure/);
  const ownerSnapshot = await app.request('/api/snapshot', { headers: { cookie: ownerCookie } });
  assert.equal((await ownerSnapshot.json()).expenses[0].id, 'old');

  const created = await app.request('/api/auth/members', json(account('second'), ownerCookie));
  assert.equal(created.status, 200);
  const secondary = (await created.json()).member;
  assert.notEqual(secondary.id, 'local');
  assert.equal(secondary.isOwner, false);
  assert.equal((await app.request('/api/auth/members', json(account('second'), ownerCookie))).status, 409);
  assert.equal((await app.request('/api/auth/login', json({ username: 'second', password: 'wrong-password' }))).status, 401);
  const secondLogin = await app.request('https://example.test/api/auth/login', json(account('second')));
  assert.equal(secondLogin.status, 200);
  assert.ok(secondLogin.headers.getSetCookie().every(cookie => cookie.includes('; Secure')));
  const cookie = cookieFrom(secondLogin);
  const secondSnapshot = await app.request('/api/snapshot', { headers: { cookie } });
  assert.deepEqual((await secondSnapshot.json()).expenses, []);
  assert.equal((await app.request('/api/auth/members', json(account('third'), cookie))).status, 403);
  assert.equal((await app.request('/api/meals/shortcut-drafts', { headers: { cookie } })).status, 403);
  assert.equal((await app.request('/api/snapshot', { headers: { cookie, 'x-account-session': session.cacheSession } })).status, 401);
  assert.equal((await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })).status, 200);
  assert.equal((await app.request('/api/snapshot', { headers: { cookie } })).status, 401);
  assert.equal((await app.request('/api/snapshot', { headers: { cookie: ownerCookie } })).status, 200);
  assert.equal((await createApp(db, { demo: true }).request('/api/snapshot')).status, 200);
  assert.equal((await createApp(db).request('/api/snapshot')).status, 200);
});

test('legacy password rotation preserves member identity and only revokes old default sessions', async (t) => {
  const db = await personalDb(t);
  const id = 'm-xingyu';
  await db.member.create({ data: { id, username: 'xingyu', name: 'Xingyu', passwordHash: await hashPassword('life-local'), createdAt: new Date().toISOString() } });
  const old = await openSession(db, id);
  const app = createApp(db, { auth: true });
  assert.equal(await secureLegacyCredentials(db, undefined), 'required');
  assert.equal((await app.request('/api/auth/session', { headers: { cookie: `ailife=${old}` } })).status, 401);
  assert.equal(await secureLegacyCredentials(db, password), 'rotated');
  const login = await app.request('/api/auth/login', json(account('xingyu')));
  assert.equal(login.status, 200);
  assert.deepEqual((await login.json()).member, { id, username: 'xingyu', name: 'Xingyu', isOwner: true });
  assert.equal(await secureLegacyCredentials(db, 'other-password'), null);
  assert.equal((await app.request('/api/auth/session', { headers: { cookie: cookieFrom(login) } })).status, 200);
});
