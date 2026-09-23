import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';
import { pickSuggestion } from '../suggestion.js';

const CATEGORIES = ['上衣', '裤装', '裙装', '外套', '鞋包'];

export function registerWardrobe(app: Hono, db: PrismaClient) {
  app.get('/api/items', async (c) => {
    const snap = await readSnapshot(db);
    return c.json(snap.items);
  });

  app.post('/api/items', async (c) => {
    const body = await c.req.json();
    if (!body.name || !CATEGORIES.includes(body.category) || !body.color) return c.json({ error: 'invalid' }, 400);
    await db.wardrobeItem.create({
      data: {
        id: uid('w'),
        name: String(body.name).trim(),
        category: body.category,
        season: body.season || '四季',
        color: String(body.color).trim(),
        occasion: body.occasion || '通勤',
        wears: 0,
        createdAt: '2026-09-22',
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.patch('/api/items/:id', async (c) => {
    const body = await c.req.json();
    if (body.category && !CATEGORIES.includes(body.category)) return c.json({ error: 'invalid' }, 400);
    await db.wardrobeItem.update({
      where: { id: c.req.param('id') },
      data: {
        name: body.name,
        category: body.category,
        season: body.season,
        color: body.color,
        occasion: body.occasion,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/items/:id', async (c) => {
    await db.wardrobeItem.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/outfits', async (c) => {
    const body = await c.req.json();
    const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) return c.json({ error: 'empty' }, 400);
    const outfits = await db.outfit.findMany();
    const joined = itemIds.join();
    if (outfits.some((outfit) => JSON.parse(outfit.itemIds).join() === joined)) {
      return c.json({ snapshot: await readSnapshot(db), duplicate: true });
    }
    await db.outfit.create({
      data: { id: uid('o'), name: body.name || `今日推荐 ${outfits.length + 1}`, itemIds: JSON.stringify(itemIds), favorite: false },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/outfits/:id/favorite', async (c) => {
    const outfit = await db.outfit.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    await db.outfit.update({ where: { id: outfit.id }, data: { favorite: !outfit.favorite } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/outfits/:id/apply', async (c) => {
    const outfit = await db.outfit.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    const ids = JSON.parse(outfit.itemIds) as string[];
    await db.wardrobeItem.updateMany({ where: { id: { in: ids } }, data: { wears: { increment: 1 } } });
    await db.sessionState.update({ where: { id: 'local' }, data: { activeOutfitId: outfit.id } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.get('/api/wardrobe/suggestion', async (c) => {
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    return c.json(pickSuggestion(session.suggestionIndex, session.weatherOn));
  });

  app.post('/api/wardrobe/suggestion/refresh', async (c) => {
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    await db.sessionState.update({
      where: { id: 'local' },
      data: { suggestionIndex: session.suggestionIndex + 1, outfitAdopted: false },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/session/weather', async (c) => {
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    await db.sessionState.update({
      where: { id: 'local' },
      data: { weatherOn: !session.weatherOn, weatherLabel: session.weatherOn ? '天气未知' : '22°C 多云', suggestionIndex: 0, outfitAdopted: false },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/session/tips', async (c) => {
    const body = await c.req.json();
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const tips = JSON.parse(session.adoptedTips) as string[];
    if (body.id && !tips.includes(body.id)) tips.push(String(body.id));
    await db.sessionState.update({ where: { id: 'local' }, data: { adoptedTips: JSON.stringify(tips) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
