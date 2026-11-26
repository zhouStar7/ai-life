import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { openSession } from './auth.js';
import { configureDatabase, serverRoot } from './databaseEnvironment.js';
import { seedIfEmpty } from './seed.js';
import { readSnapshot } from './snapshot.js';
import { contextualDb, requestContext } from './requestContext.js';
import { prepareBills } from './billImport.js';
import type { BillDraft } from './adapters/bills.js';

const root = mkdtempSync(path.join(tmpdir(), 'ai-life-data-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('default database paths separate personal and demo and leave legacy data alone', () => {
  const demo: NodeJS.ProcessEnv = {};
  const personal: NodeJS.ProcessEnv = { AI_LIFE_MODE: 'personal' };
  assert.equal(configureDatabase(demo, root), 'demo');
  assert.equal(configureDatabase(personal, root), 'personal');
  assert.equal(demo.DATABASE_URL, `file:${path.join(root, 'data/demo.sqlite')}`);
  assert.equal(personal.DATABASE_URL, `file:${path.join(root, 'data/personal.sqlite')}`);
  assert.throws(() => configureDatabase({ AI_LIFE_MODE: 'typo' }, root), /AI_LIFE_MODE/);
});

test('external database URL is used by schema setup and personal initialization preserves existing rows', async () => {
  const file = path.join(root, 'custom.sqlite');
  const env = { ...process.env, DATABASE_URL: `file:${file}`, AI_LIFE_MODE: 'personal' };
  const mode = configureDatabase(env, root);
  assert.equal(env.DATABASE_URL, `file:${file}`);
  const startup = execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], { cwd: serverRoot, env, encoding: 'utf8' });
  assert.doesNotMatch(startup, /Generated Prisma Client/);
  assert.ok(existsSync(file));
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    await seedIfEmpty(db, mode);
    const snapshot = await readSnapshot(db);
    for (const rows of [snapshot.items, snapshot.outfits, snapshot.meals, snapshot.recipes, snapshot.devices,
      snapshot.alerts, snapshot.trips, snapshot.expenses, snapshot.packingTemplates]) {
      assert.equal(rows.length, 0);
    }
    assert.equal(snapshot.activeTripId, '');
    assert.equal(snapshot.weatherLabel, '');
    await db.expense.create({ data: { id: 'mine', amountCents: 4200n, merchant: 'test', note: '', tag: '食', date: '2026-09-22' } });
    await db.budget.update({ where: { id: 'local' }, data: { totalCents: 32100n } });
    await db.profile.delete({ where: { id: 'local' } });
    await seedIfEmpty(db, 'demo');
    await seedIfEmpty(db, 'personal');
    const again = await readSnapshot(db);
    assert.deepEqual(again.expenses.map((expense) => expense.id), ['mine']);
    assert.equal(again.budgets.total, 321);
    assert.equal(again.items.length, 0);
    assert.equal(again.trips.length, 0);
  } finally {
    await db.$disconnect();
  }
});

test('startup upgrades legacy integer yuan exactly once', async () => {
  const file = path.join(root, 'legacy.sqlite');
  const env = { ...process.env, DATABASE_URL: `file:${file}`, AI_LIFE_MODE: 'personal' };
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE Expense(id TEXT PRIMARY KEY, tag TEXT NOT NULL, amount INTEGER NOT NULL,
      date TEXT NOT NULL, merchant TEXT NOT NULL, note TEXT NOT NULL, tripId TEXT NOT NULL DEFAULT '');
    CREATE TABLE Budget(id TEXT PRIMARY KEY, total INTEGER NOT NULL, cloth INTEGER NOT NULL,
      food INTEGER NOT NULL, home INTEGER NOT NULL, trip INTEGER NOT NULL);
    CREATE TABLE BillImport(expenseId TEXT PRIMARY KEY REFERENCES Expense(id) ON DELETE CASCADE,
      source TEXT NOT NULL, rowKey TEXT UNIQUE, platformKey TEXT UNIQUE, transactionId TEXT);
    CREATE TABLE SessionState(id TEXT PRIMARY KEY, suggestionIndex INTEGER NOT NULL DEFAULT 0,
      activeTripId TEXT NOT NULL DEFAULT '', adoptedTips TEXT NOT NULL DEFAULT '[]');
    INSERT INTO SessionState VALUES('local', 4, 't1', '["filter"]');
    INSERT INTO Expense VALUES('old','食',12,'2026-09-09','店','午餐','t1');
    INSERT INTO BillImport VALUES('old','wechat','legacy-row','wechat:order','order');
    INSERT INTO Budget VALUES('local',2147483647,2,3,4,5);
  `);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], { cwd: serverRoot, env, stdio: 'inherit' });
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      await seedIfEmpty(db, 'personal');
      assert.equal((await db.expense.findUniqueOrThrow({ where: { id: 'old' } })).amountCents, 1200n);
      const snap = await readSnapshot(db, '2026-09');
      assert.deepEqual(snap.expenses, [{ id: 'old', tag: '食', amount: 12, date: '2026-09-09', merchant: '店', note: '午餐', tripId: 't1' }]);
      assert.equal(snap.spending.monthTotal, 12);
      assert.deepEqual(snap.budgets, { total: 2147483647, 衣: 2, 食: 3, 住: 4, 行: 5 });
      assert.equal(snap.suggestionIndex, 4);
      assert.equal(snap.activeTripId, 't1');
      assert.deepEqual(snap.adoptedTips, ['filter']);
      const bill = await db.billImport.findUniqueOrThrow({ where: { memberId_expenseId: { memberId: 'local', expenseId: 'old' } } });
      assert.equal(bill.platformKey, 'wechat:order');
    } finally {
      await db.$disconnect();
    }
  }
});

test('scoped transactions isolate unique selectors, write ownership and bill identities', async () => {
  const datasourceUrl = `file:${path.join(root, 'scoped.sqlite')}`;
  execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], {
    cwd: serverRoot, env: { ...process.env, DATABASE_URL: datasourceUrl, AI_LIFE_MODE: 'personal' },
  });
  const raw = new PrismaClient({ datasourceUrl });
  const db = contextualDb(raw);
  const row: BillDraft = {
    tag: '食', amount: 12.34, date: '2026-09-09', merchant: '店', note: '',
    source: 'wechat', transactionId: 'reused-order', rowKey: `${'a'.repeat(64)}:1`,
  };
  try {
    async function importBill(memberId: string) {
      return requestContext.run({ memberId }, () => db.$transaction(async (tx) => {
        const { expenses, identities, receipt } = await prepareBills(tx, [row]);
        assert.equal(receipt.imported, 1);
        await tx.expense.createMany({ data: expenses });
        await db.billImport.createMany({ data: identities });
        return expenses[0].id;
      }));
    }
    const first = await importBill('local');
    const second = await importBill('other');
    await requestContext.run({ memberId: 'other' }, async () => {
      const [visible, hidden] = await db.$transaction([
        db.expense.findUnique({ where: { id: second }, include: { billImport: true } }),
        db.billImport.findUnique({ where: { memberId_expenseId: { memberId: 'local', expenseId: first } } }),
      ]);
      assert.equal(visible?.billImport?.memberId, 'other');
      assert.equal(hidden, null);
      assert.equal(await db.expense.findUnique({ where: { id: first, memberId: 'local' } }), null);
      await assert.rejects(db.expense.update({ where: { id: first }, data: { note: 'tampered' } }));
      await assert.rejects(db.expense.delete({ where: { id: first } }));
      assert.throws(() => db.expense.update({ where: { id: second }, data: { memberId: 'local' } }), /ownership/);
      assert.equal((await prepareBills(db, [row])).receipt.duplicates, 1);
    });
    assert.equal((await raw.expense.findUniqueOrThrow({ where: { id: first } })).note, '账单导入');
    assert.equal(await raw.billImport.count({ where: { platformKey: 'wechat:reused-order' } }), 2);
  } finally {
    await raw.$disconnect();
  }
});

test('WIP upgrade keeps existing accounts, sessions, cents, budget and trip preparation', async () => {
  const file = path.join(root, 'wip.sqlite');
  const env = { ...process.env, DATABASE_URL: `file:${file}`, AI_LIFE_MODE: 'personal' };
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE Profile(id TEXT PRIMARY KEY, name TEXT NOT NULL, moneyCents BOOLEAN NOT NULL DEFAULT false);
    INSERT INTO Profile VALUES ('local', 'House', true);
    CREATE TABLE Member(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      passwordHash TEXT NOT NULL, createdAt TEXT NOT NULL);
    INSERT INTO Member VALUES ('m-xingyu', 'xingyu', 'Xingyu', 'retained-hash', '2026-09-01'),
      ('other', 'other', 'Other', 'other-hash', '2026-09-02');
    CREATE TABLE AuthSession(token TEXT PRIMARY KEY, memberId TEXT NOT NULL, expiresAt TEXT NOT NULL);
    INSERT INTO AuthSession VALUES ('retained-token', 'm-xingyu', '2099-01-01');
    CREATE TABLE MemberState(memberId TEXT PRIMARY KEY, suggestionIndex INTEGER NOT NULL DEFAULT 0,
      activeTripId TEXT NOT NULL DEFAULT '', adoptedTips TEXT NOT NULL DEFAULT '[]');
    INSERT INTO MemberState VALUES ('m-xingyu', 2, 'journey', '["trip"]');
    CREATE TABLE SessionState(id TEXT PRIMARY KEY, activeTripId TEXT NOT NULL DEFAULT 'stale');
    INSERT INTO SessionState VALUES ('local', 'stale');
    CREATE TABLE Expense(id TEXT PRIMARY KEY, memberId TEXT NOT NULL DEFAULT 'm-xingyu', tag TEXT NOT NULL,
      amount INTEGER NOT NULL, date TEXT NOT NULL, merchant TEXT NOT NULL, note TEXT NOT NULL,
      tripId TEXT NOT NULL DEFAULT '', fingerprint TEXT);
    INSERT INTO Expense VALUES('private-expense','m-xingyu','食',1234,'2026-09-09','店','午餐','journey','src:wip-order');
    CREATE TABLE Budget(id TEXT PRIMARY KEY, memberId TEXT NOT NULL UNIQUE DEFAULT 'm-xingyu', total INTEGER NOT NULL,
      cloth INTEGER NOT NULL, food INTEGER NOT NULL, home INTEGER NOT NULL, trip INTEGER NOT NULL);
    INSERT INTO Budget VALUES('local','m-xingyu',200,40,60,20,80);
    CREATE TABLE Trip(id TEXT PRIMARY KEY, memberId TEXT NOT NULL DEFAULT 'm-xingyu', title TEXT NOT NULL,
      status TEXT NOT NULL, transport TEXT NOT NULL, dateLabel TEXT NOT NULL,
      startDate TEXT, endDate TEXT, tickets TEXT NOT NULL, timeline TEXT NOT NULL, packing TEXT NOT NULL,
      prepAdopted BOOLEAN NOT NULL DEFAULT false);
    INSERT INTO Trip VALUES('journey','m-xingyu','行程','进行中','高铁','2026-09-09',
      '2026-09-09','2026-09-09','[]','[]','[]',true);
    CREATE TABLE WardrobeItem(id TEXT PRIMARY KEY, memberId TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      season TEXT NOT NULL, color TEXT NOT NULL, occasion TEXT NOT NULL, wears INTEGER NOT NULL,
      createdAt TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '', priceCents INTEGER);
    INSERT INTO WardrobeItem VALUES ('mine','m-xingyu','外套','外套','秋','白','通勤',0,'','photo:shared',12345),
      ('theirs','other','长裤','裤装','秋','黑','通勤',0,'','photo:shared',null);
    CREATE TABLE WardrobePhoto(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    INSERT INTO WardrobePhoto VALUES ('shared', 'data:image/png;base64,AAAA');
  `);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], { cwd: serverRoot, env, stdio: 'inherit' });
    const raw = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      await seedIfEmpty(raw, 'personal');
      assert.equal((await raw.member.findUniqueOrThrow({ where: { id: 'm-xingyu' } })).passwordHash, 'retained-hash');
      assert.equal((await raw.authSession.findUniqueOrThrow({ where: { token: 'retained-token' } })).memberId, 'm-xingyu');
      const local = await readSnapshot(contextualDb(raw), '2026-09');
      assert.equal(local.activeTripId, '');
      assert.deepEqual(local.expenses, []);
      const db = contextualDb(raw);
      await requestContext.run({ memberId: 'm-xingyu' }, async () => {
        const snapshot = await readSnapshot(db, '2026-09');
        assert.equal(snapshot.expenses[0].amount, 12.34);
        assert.equal(snapshot.budgets.total, 200);
        assert.equal(snapshot.activeTripId, 'journey');
        assert.equal(snapshot.trips[0].prepAdopted, true);
        assert.equal(snapshot.trips[0].startDate, '2026-09-09');
        assert.equal(snapshot.suggestionIndex, 2);
        assert.deepEqual(snapshot.adoptedTips, ['trip']);
        assert.equal(snapshot.items[0].price, 123.45);
        const row: BillDraft = { tag: '食', amount: 12.34, date: '2026-09-09', merchant: '店', note: '午餐', source: 'wechat', transactionId: 'wip-order' };
        assert.equal((await prepareBills(db, [row])).rows[0].status, 'duplicate');
      });
      const shortcutToken = 's'.repeat(32);
      const app = createApp(raw, { auth: true, shortcutToken });
      const draft = await app.request('/api/shortcuts/meal-drafts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${shortcutToken}`, 'Idempotency-Key': 'wip-shortcut', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '午餐', date: '2026-09-09' }),
      });
      assert.equal(draft.status, 200);
      const { id } = await draft.json();
      assert.equal((await raw.quickMealDraft.findUniqueOrThrow({ where: { id } })).memberId, 'm-xingyu');
      const ownerToken = await openSession(raw, 'm-xingyu');
      const inbox = await app.request('/api/meals/shortcut-drafts', { headers: { cookie: `ailife=${ownerToken}` } });
      assert.deepEqual((await inbox.json()).drafts.map((item: { id: string }) => item.id), [id]);
      const otherToken = await openSession(raw, 'other');
      assert.equal((await app.request('/api/meals/shortcut-drafts', { headers: { cookie: `ailife=${otherToken}` } })).status, 403);
      const items = await raw.wardrobeItem.findMany();
      assert.equal(new Set(items.map(({ cover }) => cover)).size, 2);
      for (const { memberId, cover } of items) {
        const photo = await raw.wardrobePhoto.findUniqueOrThrow({ where: { id: cover.slice('photo:'.length) } });
        assert.equal(photo.memberId, memberId);
      }
    } finally {
      await raw.$disconnect();
    }
  }
});
