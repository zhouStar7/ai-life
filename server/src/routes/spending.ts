import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { isTag, parseCsv, recognizeBill, type BillDraft } from '../adapters/bills.js';
import { prepareBills } from '../billImport.js';
import { isMonth } from '../../../shared/spending.js';
import { isLocalDate, localDate } from '../localDate.js';
import { expenseToYuan, yuanToCents } from '../money.js';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

export function registerSpending(app: Hono, db: PrismaClient) {
  app.post('/api/bills/preview', async (c) => {
    const body = await c.req.json();
    const csv = typeof body.csv === 'string' ? body.csv : '';
    const image = typeof body.image === 'string' ? body.image : '';
    if (csv.trim()) return c.json({ rows: (await prepareBills(db, parseCsv(csv))).rows });
    if (!image.startsWith('data:image/')) return c.json({ error: 'invalid' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    try {
      const rows = await recognizeBill(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        image,
      );
      return c.json({ rows: (await prepareBills(db, rows)).rows });
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.post('/api/bills/import', async (c) => {
    const body = await c.req.json();
    const rows: BillDraft[] = Array.isArray(body.rows) ? body.rows : [];
    const month = c.req.query('month');
    if (month !== undefined && !isMonth(month)) return c.json({ error: 'invalid_month' }, 400);
    if (rows.some((row) => !row || typeof row !== 'object')) return c.json({ error: 'invalid' }, 400);
    if (rows.length === 0) return c.json({ error: 'empty' }, 400);
    const result = await db.$transaction(async (tx) => {
      const preview = await prepareBills(tx, rows);
      if (preview.rows.some((row) => row.status !== 'duplicate' && !isLocalDate(row.date))) return { dateRequired: true };
      if (preview.rows.some((row) => row.status === 'review' && row.decision !== 'import' && row.decision !== 'skip')) return { reviewRows: preview.rows };
      const { expenses, identities, receipt } = preview;
      if (expenses.length) {
        await tx.expense.createMany({ data: expenses });
        await tx.billImport.createMany({ data: identities });
      }
      return { receipt, imported: receipt.imported };
    }, { timeout: 30_000 });
    if ('dateRequired' in result) return c.json({ error: 'date_required' }, 400);
    return c.json({ snapshot: await readSnapshot(db, month), ...result });
  });

  app.get('/api/expenses', async (c) => {
    const tag = c.req.query('tag');
    const month = c.req.query('month');
    if (month !== undefined && !isMonth(month)) return c.json({ error: 'invalid_month' }, 400);
    const rows = await db.expense.findMany({
      where: { tag: isTag(tag) ? tag : undefined, date: month ? { startsWith: `${month}-` } : undefined },
      orderBy: { date: 'desc' },
    });
    return c.json(rows.map(expenseToYuan));
  });

  app.post('/api/expenses', async (c) => {
    const body = await c.req.json();
    const amountCents = yuanToCents(body.amount);
    const date = body.date ?? localDate();
    if (!isTag(body.tag) || !amountCents || !isLocalDate(date) || typeof body.merchant !== 'string' || !body.merchant.trim()) {
      return c.json({ error: 'invalid' }, 400);
    }
    await db.expense.create({
      data: {
        id: uid('e'),
        tag: body.tag,
        amountCents,
        date,
        merchant: String(body.merchant).trim(),
        note: body.note || '手动记账',
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/expenses/:id', async (c) => {
    await db.expense.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.get('/api/spending/summary', async (c) => {
    const month = c.req.query('month');
    if (month !== undefined && !isMonth(month)) return c.json({ error: 'invalid_month' }, 400);
    return c.json((await readSnapshot(db, month)).spending);
  });

  app.get('/api/budgets', async (c) => c.json((await readSnapshot(db)).budgets));

  app.put('/api/budgets', async (c) => {
    const body = await c.req.json();
    const totalCents = yuanToCents(body.total ?? 0);
    const clothCents = yuanToCents(body.衣 ?? 0);
    const foodCents = yuanToCents(body.食 ?? 0);
    const homeCents = yuanToCents(body.住 ?? 0);
    const tripCents = yuanToCents(body.行 ?? 0);
    if (totalCents === null || clothCents === null || foodCents === null || homeCents === null || tripCents === null) {
      return c.json({ error: 'invalid' }, 400);
    }
    await db.budget.update({ where: { id: 'local' }, data: { totalCents, clothCents, foodCents, homeCents, tripCents } });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
