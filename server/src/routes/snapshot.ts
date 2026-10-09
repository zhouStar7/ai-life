import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readSnapshot } from '../snapshot.js';

export function registerSnapshot(app: Hono, db: PrismaClient) {
  app.get('/api/snapshot', async (c) => c.json(await readSnapshot(db)));
}
