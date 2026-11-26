import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { memberOf } from '../auth.js';
import { readClientSnapshot } from '../snapshot.js';

export function registerSnapshot(app: Hono, db: PrismaClient) {
  app.get('/api/snapshot', async (c) => c.json(await readClientSnapshot(db, memberOf(c))));
}
