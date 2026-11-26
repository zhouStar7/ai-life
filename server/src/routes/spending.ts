import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { isTag, parseCsv, recognizeBill, type BillDraft, type SpendTag } from '../adapters/bills.js';
import { currentMonth, shiftMonth } from '../calendar.js';
import { fromCents } from '../money.js';
import { todayIso } from '../calendar.js';
import { uid } from '../ids.js';
import { billFingerprint, toCents } from '../money.js';
import { memberOf } from '../auth.js';
import { readMutationSnapshot, readSnapshot, summarizeSpending, spendingSummary } from '../snapshot.js';

function importable(row: Partial<BillDraft> | null | undefined): row is BillDraft & { tag: SpendTag } {
  return Boolean(row && isTag(row.tag) && Number(row.amount) > 0 && row.merchant);
}

export function registerSpending(app: Hono, db: PrismaClient) {
  app.post('/api/bills/preview', async (c) => {
    const body = await c.req.json();
    const csv = typeof body.csv === 'string' ? body.csv : '';
    const image = typeof body.image === 'string' ? body.image : '';
    if (csv.trim()) return c.json({ rows: await markDuplicates(db, memberOf(c), parseCsv(csv)) });
    if (!image.startsWith('data:image/')) return c.json({ error: 'invalid' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    try {
      const rows = await recognizeBill(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        image,
      );
      return c.json({ rows: await markDuplicates(db, memberOf(c), rows) });
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.post('/api/bills/import', async (c) => {
    const body = await c.req.json();
    const rows: Partial<BillDraft>[] = Array.isArray(body.rows) ? body.rows : [];
    const accepted = rows.filter(importable);
    if (accepted.length === 0) return c.json({ error: 'empty' }, 400);
    const memberId = memberOf(c);
    const known = new Set((await db.expense.findMany({ where: { memberId }, select: { fingerprint: true } }))
      .map((row) => row.fingerprint)
      .filter((item): item is string => Boolean(item)));
    const fresh = accepted.filter((row) => {
      const fingerprint = fingerprintOf(row);
      if (known.has(fingerprint)) return false;
      known.add(fingerprint);
      return true;
    });
    if (fresh.length > 0) {
      await db.$transaction(fresh.map((row) => db.expense.create({
        data: {
          id: uid('e'),
          memberId,
          tag: row.tag,
          amount: toCents(Number(row.amount)),
          date: row.date || todayIso(),
          merchant: String(row.merchant).trim(),
          note: row.note || '账单导入',
          fingerprint: fingerprintOf(row),
        },
      })));
    }
    return c.json({
      snapshot: await readMutationSnapshot(db, c),
      imported: fresh.length,
      skipped: accepted.length - fresh.length,
    });
  });

  app.get('/api/expenses', async (c) => {
    if (c.req.query('limit')) {
      const limit = Math.max(1, Math.min(100, Number(c.req.query('limit')) || 30));
      const month = c.req.query('month');
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return c.json({ error: 'invalid_month' }, 400);
      const tag = c.req.query('tag');
      const tripId = c.req.query('tripId');
      const filter = { memberId: memberOf(c), ...(month ? { date: { gte: `${month}-01`, lt: `${shiftMonth(month, 1)}-01` } } : {}),
        ...(isTag(tag) ? { tag } : {}), ...(tripId ? { tripId } : {}) };
      let after: { date: string; id: string } | null = null;
      if (c.req.query('cursor')) {
        try { after = JSON.parse(Buffer.from(c.req.query('cursor')!, 'base64url').toString()); } catch { return c.json({ error: 'invalid_cursor' }, 400); }
        if (!after || typeof after.date !== 'string' || typeof after.id !== 'string') return c.json({ error: 'invalid_cursor' }, 400);
      }
      const [items, total, sum, summary] = await Promise.all([
        db.expense.findMany({ where: { ...filter, ...(after ? { AND: [{ OR: [{ date: { lt: after.date } }, { date: after.date, id: { lt: after.id } }] }] } : {}) },
          orderBy: [{ date: 'desc' }, { id: 'desc' }], take: limit + 1 }),
        db.expense.count({ where: filter }), db.expense.aggregate({ where: filter, _sum: { amount: true } }),
        spendingSummary(db, memberOf(c), month || currentMonth()),
      ]);
      const rows = items.slice(0, limit);
      const last = rows.at(-1);
      return c.json({ rows: rows.map(({ fingerprint, ...row }) => ({ ...row, amount: fromCents(row.amount) })), total,
        amount: fromCents(sum._sum.amount ?? 0), summary,
        nextCursor: items.length > limit && last ? Buffer.from(JSON.stringify({ date: last.date, id: last.id })).toString('base64url') : null });
    }
    const tag = c.req.query('tag');
    const snap = await readSnapshot(db, memberOf(c));
    return c.json(isTag(tag) ? snap.expenses.filter((row) => row.tag === tag) : snap.expenses);
  });

  app.post('/api/expenses', async (c) => {
    const body = await c.req.json();
    if (!isTag(body.tag) || !(Number(body.amount) > 0) || !body.merchant) return c.json({ error: 'invalid' }, 400);
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayIso();
    const merchant = String(body.merchant).trim();
    const note = body.note || '手动记账';
    await db.expense.create({
      data: {
        id: uid('e'),
        memberId: memberOf(c),
        tag: body.tag,
        amount: toCents(Number(body.amount)),
        date,
        merchant,
        note,
      },
    });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.delete('/api/expenses/:id', async (c) => {
    const owned = await db.expense.findFirst({ where: { id: c.req.param('id'), memberId: memberOf(c) } });
    if (!owned) return c.json({ error: 'missing' }, 404);
    await db.expense.delete({ where: { id: owned.id } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.get('/api/spending/summary', async (c) => {
    const snap = await readSnapshot(db, memberOf(c));
    const month = c.req.query('month');
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return c.json(await spendingSummary(db, memberOf(c), month));
    return c.json(snap.spending);
  });

  app.get('/api/budgets', async (c) => c.json((await readSnapshot(db, memberOf(c))).budgets));

  app.put('/api/budgets', async (c) => {
    const body = await c.req.json();
    await db.budget.update({
      where: { memberId: memberOf(c) },
      data: {
        total: Number(body.total) || 0,
        cloth: Number(body.衣) || 0,
        food: Number(body.食) || 0,
        home: Number(body.住) || 0,
        trip: Number(body.行) || 0,
      },
    });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });
}

function fingerprintOf(row: BillDraft & { tag: SpendTag }) {
  return row.fingerprint || billFingerprint({
    date: row.date || todayIso(),
    merchant: String(row.merchant).trim(),
    amount: Number(row.amount),
    note: row.note || '账单导入',
    sourceId: row.sourceId,
  });
}

async function markDuplicates(db: PrismaClient, memberId: string, rows: BillDraft[]) {
  const known = new Set((await db.expense.findMany({ where: { memberId }, select: { fingerprint: true } }))
    .map((row) => row.fingerprint)
    .filter((item): item is string => Boolean(item)));
  return rows.map((row) => {
    const fingerprint = row.fingerprint || billFingerprint(row);
    const duplicate = known.has(fingerprint);
    known.add(fingerprint);
    return { ...row, fingerprint, duplicate };
  });
}
