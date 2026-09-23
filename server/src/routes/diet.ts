import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

const SLOTS = ['早餐', '午餐', '晚餐', '加餐'];

export function registerDiet(app: Hono, db: PrismaClient) {
  app.post('/api/meals', async (c) => {
    const body = await c.req.json();
    if (!body.name || !SLOTS.includes(body.slot)) return c.json({ error: 'invalid' }, 400);
    await db.meal.create({
      data: {
        id: uid('m'),
        slot: body.slot,
        name: String(body.name).trim(),
        time: body.time || '12:30',
        kcal: Number(body.kcal) || 0,
        protein: Number(body.protein) || 0,
        carb: Number(body.carb) || 0,
        fat: Number(body.fat) || 0,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.patch('/api/meals/:id', async (c) => {
    const body = await c.req.json();
    await db.meal.update({
      where: { id: c.req.param('id') },
      data: {
        slot: body.slot,
        name: body.name,
        time: body.time,
        kcal: Number(body.kcal) || 0,
        protein: Number(body.protein) || 0,
        carb: Number(body.carb) || 0,
        fat: Number(body.fat) || 0,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/meals/:id', async (c) => {
    await db.meal.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.get('/api/recipes', async (c) => c.json((await readSnapshot(db)).recipes));

  app.post('/api/recipes/:id/apply', async (c) => {
    const recipe = await db.recipe.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await db.meal.create({
      data: { id: uid('m'), slot: recipe.slot, name: recipe.name, time, kcal: recipe.kcal, protein: recipe.protein, carb: recipe.carb, fat: recipe.fat },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.put('/api/nutrition-target', async (c) => {
    const body = await c.req.json();
    await db.nutritionTarget.update({
      where: { id: 'local' },
      data: { kcal: Number(body.kcal) || 0, protein: Number(body.protein) || 0, carb: Number(body.carb) || 0, fat: Number(body.fat) || 0 },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
