import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { isTag, parseCsv, recognizeBill, type BillDraft, type SpendTag } from '../adapters/bills.js';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

function importable(row: Partial<BillDraft> | null | undefined): row is BillDraft & { tag: SpendTag } {
  return Boolean(row && isTag(row.tag) && Number(row.amount) > 0 && row.merchant);
}

export function registerSpending(app: Hono, db: PrismaClient) {
  app.post('/api/bills/preview', async (c) => {
    const body = await c.req.json();
    const csv = typeof body.csv === 'string' ? body.csv : '';
    const image = typeof body.image === 'string' ? body.image : '';
    if (csv.trim()) return c.json({ rows: parseCsv(csv) });
    if (!image.startsWith('data:image/')) return c.json({ error: 'invalid' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    try {
      const rows = await recognizeBill(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        image,
      );
      return c.json({ rows });
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.post('/api/bills/import', async (c) => {
    const body = await c.req.json();
    const rows: Partial<BillDraft>[] = Array.isArray(body.rows) ? body.rows : [];
    const accepted = rows.filter(importable);
    if (accepted.length === 0) return c.json({ error: 'empty' }, 400);
    await db.$transaction(accepted.map((row) => db.expense.create({
      data: {
        id: uid('e'),
        tag: row.tag,
        amount: Math.round(Number(row.amount)),
        date: row.date || '2026-09-22',
        merchant: String(row.merchant).trim(),
        note: row.note || '账单导入',
      },
    })));
    return c.json({ snapshot: await readSnapshot(db), imported: accepted.length });
  });

  app.get('/api/expenses', async (c) => {
    const tag = c.req.query('tag');
    const rows = await db.expense.findMany({ orderBy: { date: 'desc' } });
    return c.json(isTag(tag) ? rows.filter((row) => row.tag === tag) : rows);
  });

  app.post('/api/expenses', async (c) => {
    const body = await c.req.json();
    if (!isTag(body.tag) || !(Number(body.amount) > 0) || !body.merchant) return c.json({ error: 'invalid' }, 400);
    await db.expense.create({
      data: {
        id: uid('e'),
        tag: body.tag,
        amount: Math.round(Number(body.amount)),
        date: body.date || '2026-09-22',
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

  app.get('/api/spending/summary', async (c) => c.json((await readSnapshot(db)).spending));

  app.get('/api/budgets', async (c) => c.json((await readSnapshot(db)).budgets));

  app.put('/api/budgets', async (c) => {
    const body = await c.req.json();
    await db.budget.update({
      where: { id: 'local' },
      data: {
        total: Number(body.total) || 0,
        cloth: Number(body.衣) || 0,
        food: Number(body.食) || 0,
        home: Number(body.住) || 0,
        trip: Number(body.行) || 0,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
