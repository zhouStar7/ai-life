import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readJson } from '../ids.js';

export function registerSearch(app: Hono, db: PrismaClient) {
  app.get('/api/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    if (!q) return c.json([]);
    const [items, recipes, devices, trips] = await Promise.all([
      db.wardrobeItem.findMany(),
      db.recipe.findMany(),
      db.device.findMany(),
      db.trip.findMany(),
    ]);
    const hits = [
      ...items.map((item) => ({ href: '/wardrobe', kind: '衣橱', title: item.name, meta: `${item.category} · ${item.color}` })),
      ...recipes.map((item) => ({ href: '/diet', kind: '食谱', title: item.name, meta: readJson<string[]>(item.tags, []).join(' / ') })),
      ...devices.map((item) => ({ href: '/home', kind: '设备', title: item.name, meta: item.room })),
      ...trips.map((item) => ({ href: '/travel', kind: '行程', title: item.title, meta: item.dateLabel })),
    ].filter((item) => `${item.title} ${item.meta} ${item.kind}`.toLowerCase().includes(q)).slice(0, 6);
    return c.json(hits);
  });
}
