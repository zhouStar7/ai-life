import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { configureDatabase, serverRoot } from './databaseEnvironment.js';
import { migrateLegacyMoney } from './migrateMoney.js';
import { migrateAccounts } from './migrateAccounts.js';
import { migrateTripDates } from './tripDates.js';

configureDatabase();
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await migrateAccounts(tx);
    await migrateLegacyMoney(tx);
  }, { timeout: 120_000 });
  const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
  // Installation generates the shared client. Startup only changes the selected database.
  execFileSync(process.execPath, [prisma, 'db', 'push', '--skip-generate'], {
    cwd: serverRoot,
    stdio: 'inherit',
  });
  await migrateTripDates(db);
} finally {
  await db.$disconnect();
}
