import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

const TAGS = ['衣', '食', '住', '行'];

export function registerSpending(app: Hono, db: PrismaClient) {
  app.get('/api/expenses', async (c) => {
    const tag = c.req.query('tag');
    const rows = await db.expense.findMany({ orderBy: { date: 'desc' } });
    return c.json(tag && TAGS.includes(tag) ? rows.filter((row) => row.tag === tag) : rows);
  });

  app.post('/api/expenses', async (c) => {
    const body = await c.req.json();
    if (!TAGS.includes(body.tag) || !(Number(body.amount) > 0) || !body.merchant) return c.json({ error: 'invalid' }, 400);
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
