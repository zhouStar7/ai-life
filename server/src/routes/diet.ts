import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { estimateMeal, mealDate, pickRecipe, recipeTags } from '../dietPlan.js';
import { uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';

const SLOTS = ['早餐', '午餐', '晚餐', '加餐'];

export function registerDiet(app: Hono, db: PrismaClient) {
  app.post('/api/meals/estimate', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (!text) return c.json({ error: 'invalid' }, 400);
    const recipes = await db.recipe.findMany();
    return c.json({
      draft: estimateMeal(
        text,
        recipes.map((recipe) => ({
          name: recipe.name,
          slot: recipe.slot,
          kcal: recipe.kcal,
          protein: recipe.protein,
          carb: recipe.carb,
          fat: recipe.fat,
        })),
      ),
    });
  });

  app.post('/api/meals', async (c) => {
    const body = await c.req.json();
    if (!body.name || !SLOTS.includes(body.slot)) return c.json({ error: 'invalid' }, 400);
    await db.meal.create({
      data: {
        id: uid('m'),
        slot: body.slot,
        name: String(body.name).trim(),
        time: body.time || '12:30',
        date: mealDate(body.date),
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
        date: mealDate(body.date),
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

  app.get('/api/diet/suggestion', async (c) => {
    const snap = await readSnapshot(db);
    const recipe = pickRecipe(snap.recipes, snap.meals, snap.targets);
    return c.json({ recipe });
  });

  app.post('/api/recipes', async (c) => {
    const body = await c.req.json();
    const name = String(body.name ?? '').trim();
    if (!name || !SLOTS.includes(body.slot)) return c.json({ error: 'invalid' }, 400);
    await db.recipe.create({
      data: {
        id: uid('r'),
        name,
        tags: JSON.stringify(recipeTags(body.tags)),
        slot: body.slot,
        kcal: Number(body.kcal) || 0,
        protein: Number(body.protein) || 0,
        carb: Number(body.carb) || 0,
        fat: Number(body.fat) || 0,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/recipes/:id/apply', async (c) => {
    const recipe = await db.recipe.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await db.meal.create({
      data: {
        id: uid('m'),
        slot: recipe.slot,
        name: recipe.name,
        time,
        date: mealDate(undefined),
        kcal: recipe.kcal,
        protein: recipe.protein,
        carb: recipe.carb,
        fat: recipe.fat,
      },
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
