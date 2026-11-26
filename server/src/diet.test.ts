import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalDate, localDate } from './localDate.js';
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
  const week = weekFromMeals(SEED_MEALS, '2026-09-22');
  assert.deepEqual(week.map((day) => day.label), ['16', '17', '18', '19', '20', '21', '22']);
  assert.deepEqual(week.slice(0, 6).map((day) => day.kcal), [0, 0, 0, 0, 0, 0]);
  assert.equal(week[6].kcal, 980);
  const withYesterday = weekFromMeals([...SEED_MEALS, { date: '2026-09-21', kcal: 100, protein: 0, carb: 0, fat: 0 }], '2026-09-22');
  assert.equal(withYesterday[5].kcal, 100);
  assert.equal(withYesterday[6].kcal, 980);
});

test('estimate, confirm, dated meal and custom recipe stay on the books', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 22, 14) });
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


test('local midnight advances the default day and week across months, with dates preserved on readback', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2028, 1, 29, 23, 59, 59, 999) });
  const post = (route: string, body: object) => json(route, { method: 'POST', body: JSON.stringify(body) });
  const meal = { name: '月末餐', slot: '晚餐', kcal: 123 };
  assert.equal(localDate(), '2028-02-29');
  assert.equal(isLocalDate('2028-02-30'), false);
  assert.equal((await post('/api/meals', meal)).status, 200);
  const item = { name: '月末外套', category: '外套', color: '白' };
  assert.equal((await post('/api/items', item)).status, 200);
  t.mock.timers.tick(1);
  assert.equal(localDate(), '2028-03-01');
  assert.equal(estimateMeal('牛肉面').date, '2028-03-01');
  assert.equal((await post('/api/items/batch', { items: [{ ...item, name: '月初外套' }] })).status, 200);
  assert.equal((await post('/api/meals', { ...meal, name: '月初餐', kcal: 234 })).status, 200);
  assert.equal((await post('/api/recipes/r1/apply', { date: '2028-02-26' })).status, 200);
  const { body: snapshot } = await json('/api/snapshot');
  const week = weekFromMeals(snapshot.meals);
  assert.deepEqual(week.map(day => day.date), ['2028-02-24', '2028-02-25', '2028-02-26', '2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(week.slice(-2).map(day => day.kcal), [123, 234]);
  assert.ok(week[2].kcal > 0);
  assert.equal(snapshot.items.find((row: { name: string }) => row.name === '月末外套').createdAt, '2028-02-29');
  assert.equal(snapshot.items.find((row: { name: string }) => row.name === '月初外套').createdAt, '2028-03-01');
});

test('shortcut authorization is revocable and confirmation commits exactly one meal', async () => {
  const token = 'example-shortcut-key-123456789000';
  const enabled = createApp(db, { shortcutToken: token });
  const path = '/api/shortcuts/meal-drafts';
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': 'meal-draft-retry-test' },
    body: JSON.stringify({ text: '午餐一碗番茄面', date: '2028-02-28' }),
  };
  assert.equal((await createApp(db).request(path, init)).status, 404);
  assert.equal((await createApp(db, { shortcutToken: 'replacement-shortcut-key-123456789' }).request(path, init)).status, 401);
  const responses = await Promise.all([enabled.request(path, init), enabled.request(path, init)]);
  const [draft, retry] = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(draft, retry);
  assert.equal(draft.status, 'pending');
  assert.equal(await db.meal.count({ where: { name: '快捷番茄面' } }), 0);
  assert.equal((await enabled.request(path, { ...init, body: JSON.stringify({ text: '另一餐' }) })).status, 409);

  const confirm = () => enabled.request('/api/meals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '快捷番茄面', slot: '午餐', date: '2028-02-28', shortcutDraftId: draft.id }),
  });
  const confirmed = await Promise.all([confirm(), confirm()]);
  assert.deepEqual(confirmed.map((response) => response.status), [200, 200]);
  assert.equal(await db.meal.count({ where: { name: '快捷番茄面' } }), 1);
  assert.deepEqual(await (await enabled.request(path, init)).json(), { id: draft.id, status: 'saved' });
});
