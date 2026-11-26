import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { tableColumns } from './migrateMoney.js';

const privateTables = [
  'WardrobeItem', 'Outfit', 'Meal', 'Recipe', 'NutritionTarget', 'Trip', 'Expense',
  'Budget', 'Notice', 'PackingTemplate', 'QuickMealDraft',
];

async function migrateMemberState(tx: Prisma.TransactionClient, wip: boolean) {
  const session = await tableColumns(tx, 'SessionState');
  const fields = ['suggestionIndex', 'outfitAdopted', 'activeOutfitId', 'activeTripId', 'adoptedTips'];
  const existing = fields.filter((name) => session.has(name));
  if (!existing.length) return;
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS MemberState (
    memberId TEXT NOT NULL PRIMARY KEY,
    suggestionIndex INTEGER NOT NULL DEFAULT 0,
    outfitAdopted BOOLEAN NOT NULL DEFAULT false,
    activeOutfitId TEXT,
    activeTripId TEXT NOT NULL DEFAULT '',
    adoptedTips TEXT NOT NULL DEFAULT '[]'
  )`;
  // WIP uses MemberState already. Its shared SessionState kept stale private
  // defaults. Only checkpoint's private fields belong to the local account.
  if (!wip) {
    await tx.$executeRawUnsafe(`INSERT INTO MemberState (memberId, ${existing.join(', ')})
      SELECT 'local', ${existing.join(', ')} FROM SessionState WHERE id = 'local'
      ON CONFLICT (memberId) DO NOTHING`);
  }
  for (const field of existing) await tx.$executeRawUnsafe(`ALTER TABLE SessionState DROP COLUMN "${field}"`);
}

async function migratePhotos(tx: Prisma.TransactionClient) {
  const item = await tableColumns(tx, 'WardrobeItem');
  if (item.get('priceCents')?.type.toUpperCase() === 'INTEGER') {
    await tx.$executeRaw`ALTER TABLE WardrobeItem RENAME COLUMN priceCents TO legacyPriceCents`;
    await tx.$executeRaw`ALTER TABLE WardrobeItem ADD COLUMN priceCents BIGINT`;
    await tx.$executeRaw`UPDATE WardrobeItem SET priceCents = legacyPriceCents`;
    await tx.$executeRaw`ALTER TABLE WardrobeItem DROP COLUMN legacyPriceCents`;
  }
  const photo = await tableColumns(tx, 'WardrobePhoto');
  if (!photo.size || photo.has('memberId')) return;
  await tx.$executeRaw`ALTER TABLE WardrobePhoto ADD COLUMN memberId TEXT NOT NULL DEFAULT 'local'`;
  if (!item.has('cover')) return;
  const refs = await tx.$queryRaw<{ id: string; memberId: string }[]>`
    SELECT DISTINCT photo.id, item.memberId
    FROM WardrobePhoto photo JOIN WardrobeItem item ON item.cover = 'photo:' || photo.id
    ORDER BY photo.id, item.memberId
  `;
  let previous: string | undefined;
  for (const { id, memberId } of refs) {
    if (id !== previous) {
      await tx.$executeRaw`UPDATE WardrobePhoto SET memberId = ${memberId} WHERE id = ${id}`;
    } else {
      const copy = randomUUID();
      await tx.$executeRaw`INSERT INTO WardrobePhoto (id, memberId, data)
        SELECT ${copy}, ${memberId}, data FROM WardrobePhoto WHERE id = ${id}`;
      await tx.$executeRaw`UPDATE WardrobeItem SET cover = ${`photo:${copy}`}
        WHERE cover = ${`photo:${id}`} AND memberId = ${memberId}`;
    }
    previous = id;
  }
}

async function migrateBillIdentities(tx: Prisma.TransactionClient) {
  const expense = await tableColumns(tx, 'Expense');
  if (!expense.size) return;
  if (!expense.has('fingerprint')) await tx.$executeRaw`ALTER TABLE Expense ADD COLUMN fingerprint TEXT`;
  await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS Expense_memberId_id_key ON Expense(memberId, id)`;
  await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS Expense_memberId_fingerprint_key ON Expense(memberId, fingerprint)`;
  const bill = await tableColumns(tx, 'BillImport');
  if (!bill.size || bill.get('memberId')?.pk) return;
  await tx.$executeRaw`ALTER TABLE BillImport RENAME TO LegacyBillImport`;
  await tx.$executeRaw`CREATE TABLE BillImport (
    expenseId TEXT NOT NULL,
    memberId TEXT NOT NULL DEFAULT 'local',
    source TEXT NOT NULL,
    rowKey TEXT,
    platformKey TEXT,
    transactionId TEXT,
    PRIMARY KEY (memberId, expenseId),
    CONSTRAINT BillImport_memberId_expenseId_fkey FOREIGN KEY (memberId, expenseId)
      REFERENCES Expense (memberId, id) ON DELETE CASCADE ON UPDATE CASCADE
  )`;
  await tx.$executeRaw`INSERT INTO BillImport (expenseId, memberId, source, rowKey, platformKey, transactionId)
    SELECT legacy.expenseId, (SELECT memberId FROM Expense WHERE id = legacy.expenseId),
      legacy.source, legacy.rowKey, legacy.platformKey, legacy.transactionId FROM LegacyBillImport legacy`;
  await tx.$executeRaw`DROP TABLE LegacyBillImport`;
  await tx.$executeRaw`CREATE UNIQUE INDEX BillImport_memberId_rowKey_key ON BillImport(memberId, rowKey)`;
  await tx.$executeRaw`CREATE UNIQUE INDEX BillImport_memberId_platformKey_key ON BillImport(memberId, platformKey)`;
}

export async function migrateAccounts(tx: Prisma.TransactionClient) {
  const profile = await tableColumns(tx, 'Profile');
  const wip = profile.has('moneyCents') || (await tableColumns(tx, 'MemberState')).size > 0;
  await migrateMemberState(tx, wip);
  for (const table of privateTables) {
    const columns = await tableColumns(tx, table);
    if (columns.size && !columns.has('memberId')) {
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN memberId TEXT NOT NULL DEFAULT 'local'`);
    }
  }
  for (const table of ['NutritionTarget', 'Budget', 'Notice']) {
    if ((await tableColumns(tx, table)).size) {
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "${table}_memberId_key" ON "${table}" (memberId)`);
    }
  }
  await migratePhotos(tx);
  await migrateBillIdentities(tx);
}
