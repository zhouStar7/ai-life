import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { configureDatabase, serverRoot } from './databaseEnvironment.js';
import { seedIfEmpty } from './seed.js';
import { readSnapshot } from './snapshot.js';

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
    INSERT INTO Expense VALUES('old','食',12,'2026-09-09','店','午餐','t1');
    INSERT INTO Budget VALUES('local',2147483647,2,3,4,5);
  `);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, ['--import', 'tsx', 'src/prepareDatabase.ts'], { cwd: serverRoot, env });
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      await seedIfEmpty(db, 'personal');
      assert.equal((await db.expense.findUniqueOrThrow({ where: { id: 'old' } })).amountCents, 1200n);
      const snap = await readSnapshot(db, '2026-09');
      assert.deepEqual(snap.expenses, [{ id: 'old', tag: '食', amount: 12, date: '2026-09-09', merchant: '店', note: '午餐', tripId: 't1' }]);
      assert.equal(snap.spending.monthTotal, 12);
      assert.deepEqual(snap.budgets, { total: 2147483647, 衣: 2, 食: 3, 住: 4, 行: 5 });
    } finally {
      await db.$disconnect();
    }
  }
});
