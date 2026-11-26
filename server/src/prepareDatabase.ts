import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { configureDatabase, serverRoot } from './databaseEnvironment.js';
import { migrateLegacyMoney } from './migrateMoney.js';

configureDatabase();
const db = new PrismaClient();
try {
  await migrateLegacyMoney(db);
} finally {
  await db.$disconnect();
}
const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
// Installation generates the shared client. Startup only changes the selected database.
execFileSync(process.execPath, [prisma, 'db', 'push', '--skip-generate'], {
  cwd: serverRoot,
  stdio: 'inherit',
});
