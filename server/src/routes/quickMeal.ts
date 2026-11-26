import { createHash, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isLocalDate, localDate } from '../localDate.js';

const digest = (value: string) => createHash('sha256').update(value).digest();

export function registerQuickMeal(app: Hono, db: PrismaClient, token?: string) {
  const secret = token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? digest(`Bearer ${token}`) : null;

  app.post('/api/shortcuts/meal-drafts', bodyLimit({ maxSize: 4096 }), async (c) => {
    if (!secret) return c.json({ error: 'shortcut_disabled' }, 404);
    if (!timingSafeEqual(digest(c.req.header('Authorization') ?? ''), secret)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const requestId = c.req.header('Idempotency-Key') ?? '';
    const date = body?.date ?? localDate();
    if (!text || text.length > 240 || !isLocalDate(date) || !/^[\w-]{8,100}$/.test(requestId)) {
      return c.json({ error: 'invalid' }, 400);
    }

    const draft = await db.quickMealDraft.upsert({
      where: { requestId },
      create: { requestId, text, date },
      update: { requestId },
    });
    if (draft.text !== text || (body?.date != null && draft.date !== date)) {
      return c.json({ error: 'idempotency_conflict' }, 409);
    }
    return c.json({ id: draft.id, status: draft.status });
  });

  app.get('/api/meals/shortcut-drafts', async (c) => {
    const drafts = await db.quickMealDraft.findMany({
      where: { status: 'pending' },
      orderBy: { receivedAt: 'desc' },
      select: { id: true, text: true, date: true },
    });
    c.header('Cache-Control', 'no-store');
    return c.json({ drafts });
  });

  app.delete('/api/meals/shortcut-drafts/:id', async (c) => {
    await db.quickMealDraft.updateMany({ where: { id: c.req.param('id'), status: 'pending' }, data: { status: 'discarded' } });
    return c.json({ ok: true });
  });
}
