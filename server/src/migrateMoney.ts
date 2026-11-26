import type { Prisma } from '@prisma/client';

export async function tableColumns(tx: Prisma.TransactionClient, table: string) {
  const info = await tx.$queryRawUnsafe<{ name: string; type: string; pk: bigint }[]>(`PRAGMA table_info("${table}")`);
  return new Map(info.map(({ name, type, pk }) => [name, { type, pk }]));
}

// Column names are the migration marker. SQLite rolls back both schema and
// values together if any part fails, and a second startup sees only cent names.
const columns = { Expense: ['amount'], Budget: ['total', 'cloth', 'food', 'home', 'trip'] };

export async function migrateLegacyMoney(tx: Prisma.TransactionClient) {
  const profile = await tableColumns(tx, 'Profile');
  const marker = profile.has('moneyCents') ? await tx.$queryRaw<{ moneyCents: boolean }[]>`
    SELECT moneyCents FROM Profile WHERE id = 'local'
  ` : [];
  for (const [table, fields] of Object.entries(columns)) {
    const names = await tableColumns(tx, table);
    // WIP's marker only governed Expense.amount. Its budget API stored yuan.
    const scale = table === 'Expense' && marker[0]?.moneyCents ? 1 : 100;
    for (const old of fields) {
      if (!names.has(old)) continue;
      const next = `${old}Cents`;
      if (names.has(next)) throw new Error(`Ambiguous money columns in ${table}: ${old} and ${next}`);
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${next}" BIGINT NOT NULL DEFAULT 0`);
      await tx.$executeRawUnsafe(`UPDATE "${table}" SET "${next}" = "${old}" * ${scale}`);
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "${old}"`);
    }
  }
  if (profile.has('moneyCents')) await tx.$executeRaw`ALTER TABLE Profile DROP COLUMN moneyCents`;
}
