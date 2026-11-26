import type { PrismaClient } from '@prisma/client';

// Column names are the migration marker. SQLite rolls back both schema and
// values together if any part fails, and a second startup sees only cent names.
const columns = { Expense: ['amount'], Budget: ['total', 'cloth', 'food', 'home', 'trip'] };

export async function migrateLegacyMoney(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    for (const [table, fields] of Object.entries(columns)) {
      const info = await tx.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
      const names = new Set(info.map(({ name }) => name));
      for (const old of fields) {
        if (!names.has(old)) continue;
        const next = `${old}Cents`;
        if (names.has(next)) throw new Error(`Ambiguous money columns in ${table}: ${old} and ${next}`);
        await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${next}" BIGINT NOT NULL DEFAULT 0`);
        await tx.$executeRawUnsafe(`UPDATE "${table}" SET "${next}" = "${old}" * 100`);
        await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "${old}"`);
      }
    }
  }, { timeout: 120_000 });
}
