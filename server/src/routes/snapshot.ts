import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readSnapshot } from '../snapshot.js';

import { isMonth } from '../../../shared/spending.js';

export function registerSnapshot(app: Hono, db: PrismaClient) {
  app.get('/api/snapshot', async (c) => {
    const month = c.req.query('month');
    if (month !== undefined && !isMonth(month)) return c.json({ error: 'invalid_month' }, 400);
    return c.json(await readSnapshot(db, month));
  });
}
