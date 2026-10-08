import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { estimateMeal, pickRecipe, weekFromMeals } from './dietPlan.js';
import { SEED_MEALS, SEED_RECIPES } from './seedData.js';
import { seedIfEmpty } from './seed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-diet-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('npx prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'pipe',
});

const db = new PrismaClient();
await seedIfEmpty(db);
const server = serve({ fetch: createApp(db).fetch, port: 0, hostname: '127.0.0.1' });
await new Promise<void>((resolve) => {
  if (server.listening) resolve();
  else server.once('listening', () => resolve());
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('port');
const base = `http://127.0.0.1:${address.port}`;

after(async () => {
  server.close();
  await db.$disconnect();
});

async function json(pathname: string, init?: RequestInit) {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json();
  return { status: response.status, body };
}

const targets = { kcal: 1800, protein: 120 };

test('one sentence estimates portion, slot and macros', () => {
  const noodles = estimateMeal('中午一碗牛肉面');
  assert.equal(noodles.slot, '午餐');
  assert.equal(noodles.time, '12:30');
  assert.equal(noodles.kcal, 550);
  assert.equal(noodles.protein, 24);
  assert.equal(noodles.carb, 70);
  assert.equal(noodles.fat, 16);

  const breakfast = estimateMeal('早餐一个鸡蛋和一杯牛奶');
  assert.equal(breakfast.slot, '早餐');
  assert.equal(breakfast.kcal, 230);
  assert.equal(breakfast.protein, 15);
  assert.equal(breakfast.carb, 13);
  assert.equal(breakfast.fat, 13);

  const doubled = estimateMeal('两份鸡胸肉沙拉', SEED_RECIPES);
  assert.equal(doubled.kcal, 840);
  assert.equal(doubled.protein, 84);

  const unknown = estimateMeal('神秘料理');
  assert.equal(unknown.kcal, 450);
  assert.match(unknown.note, /家常菜/);
});

test('recipe suggestion follows calorie and protein gaps', () => {
  const picked = pickRecipe(SEED_RECIPES, SEED_MEALS, targets);
  assert.equal(picked?.id, 'r1');

  const high = { id: 'r-high', name: '高蛋白鸡胸', tags: ['增肌'], slot: '晚餐', kcal: 300, protein: 50, carb: 5, fat: 6 };
  assert.equal(pickRecipe([high, ...SEED_RECIPES], SEED_MEALS, targets)?.id, 'r-high');

  const full = [{ date: '2026-09-22', kcal: 1800, protein: 120, carb: 0, fat: 0 }];
  assert.equal(pickRecipe(SEED_RECIPES, full, targets), null);
  assert.equal(pickRecipe(SEED_RECIPES, SEED_MEALS, { kcal: 0, protein: 0 }), null);
});

test('seven day intake uses stored meals', () => {
  const week = weekFromMeals(SEED_MEALS);
  assert.deepEqual(week.map((day) => day.label), ['16', '17', '18', '19', '20', '21', '22']);
  assert.deepEqual(week.slice(0, 6).map((day) => day.kcal), [0, 0, 0, 0, 0, 0]);
  assert.equal(week[6].kcal, 980);
  const withYesterday = weekFromMeals([...SEED_MEALS, { date: '2026-09-21', kcal: 100, protein: 0, carb: 0, fat: 0 }]);
  assert.equal(withYesterday[5].kcal, 100);
  assert.equal(withYesterday[6].kcal, 980);
});

test('estimate, confirm, dated meal and custom recipe stay on the books', async () => {
  const estimate = await json('/api/meals/estimate', { method: 'POST', body: JSON.stringify({ text: '中午一碗牛肉面' }) });
  assert.equal(estimate.status, 200);
  assert.equal(estimate.body.draft.kcal, 550);
  assert.equal(JSON.stringify(estimate.body).includes('eyJ'), false);

  const saved = await json('/api/meals', { method: 'POST', body: JSON.stringify(estimate.body.draft) });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.snapshot.meals.some((meal: { name: string; date: string }) => meal.name === '中午一碗牛肉面' && meal.date === '2026-09-22'));

  const yesterday = await json('/api/meals', {
    method: 'POST',
    body: JSON.stringify({ slot: '午餐', name: '昨天的米饭', time: '12:00', date: '2026-09-21', kcal: 230, protein: 4, carb: 50, fat: 1 }),
  });
  const week = weekFromMeals(yesterday.body.snapshot.meals);
  assert.equal(week.find((day) => day.date === '2026-09-21')?.kcal, 230);
  assert.equal(week.find((day) => day.date === '2026-09-22')?.kcal, 980 + 550);

  const blank = await json('/api/meals/estimate', { method: 'POST', body: JSON.stringify({ text: '   ' }) });
  assert.equal(blank.status, 400);

  const created = await json('/api/recipes', {
    method: 'POST',
    body: JSON.stringify({ name: '高蛋白鸡胸', tags: '增肌 快手', slot: '晚餐', kcal: 300, protein: 50, carb: 5, fat: 6 }),
  });
  assert.equal(created.status, 200);
  const recipe = created.body.snapshot.recipes.find((item: { name: string }) => item.name === '高蛋白鸡胸');
  assert.deepEqual(recipe.tags, ['增肌', '快手']);

  const suggestion = await json('/api/diet/suggestion');
  assert.equal(suggestion.body.recipe.name, '高蛋白鸡胸');

  const adopted = await json('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'protein' }) });
  assert.equal(adopted.status, 200);
  assert.ok(adopted.body.snapshot.meals.some((meal: { name: string }) => meal.name === '高蛋白鸡胸'));
});
