import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { SEED_ITEMS } from './seedData.js';
import { seedIfEmpty } from './seed.js';
import { draftsFromOrder, planOutfit, similarItems } from './wardrobePlan.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-wardrobe-'));
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

test('outfit plan uses the closet, prefers rarely worn pieces, and rotates', () => {
  const first = planOutfit(SEED_ITEMS, 0, true, '22°C 多云');
  assert.deepEqual(first.itemIds, ['w1', 'w6', 'w5']);
  assert.match(first.reason, /22°C 多云/);
  assert.match(first.reason, /久未穿着：碎花半身裙/);
  const second = planOutfit(SEED_ITEMS, 1, true, '22°C 多云');
  assert.deepEqual(second.itemIds, ['w1', 'w6', 'w4']);
  assert.notDeepEqual(second.itemIds, first.itemIds);

  const cold = planOutfit(SEED_ITEMS, 0, true, '8°C 阴');
  assert.ok(cold.itemIds.includes('w3'));
  assert.match(cold.reason, /8°C 阴/);

  const indoor = planOutfit(SEED_ITEMS, 0, false, '22°C 多云');
  assert.match(indoor.reason, /没拿到天气/);
  assert.equal(indoor.reason.includes('°'), false);
  assert.equal(planOutfit([], 0, true, '22°C 多云').itemIds.length, 0);
});

test('duplicate check uses name or the same color and style', () => {
  const hits = similarItems(SEED_ITEMS, { name: '牛津衬衫', color: '黑色', occasion: '运动' });
  assert.deepEqual(hits.map((item) => item.id), ['w1']);
  const styled = similarItems(SEED_ITEMS, { name: '新乐福', color: '黑色', occasion: '通勤' });
  assert.deepEqual(styled.map((item) => item.id), ['w5']);
  const different = similarItems(SEED_ITEMS, { name: '亚麻衬衫', color: '白色', occasion: '运动' }, 'w1');
  assert.equal(different.some((item) => item.id === 'w1'), false);
});

test('order text becomes clothing drafts and skips totals', () => {
  const drafts = draftsFromOrder('订单号 998\n商品名称：白色牛津衬衫\n藏青大衣 外套 正式 ¥899\n合计 ¥899');
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].category, '上衣');
  assert.equal(drafts[0].color, '白色');
  assert.equal(drafts[1].category, '外套');
  assert.equal(drafts[1].occasion, '正式');
  assert.equal(drafts[1].color, '藏青');
});

test('suggestion and order drafts stay on the closet without a model', async () => {
  const blocked = await json('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,aaaa' }) });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error, 'model_unavailable');

  const suggested = await json('/api/wardrobe/suggestion');
  assert.deepEqual(suggested.body.itemIds, ['w1', 'w6', 'w5']);
  assert.match(suggested.body.reason, /久未穿着/);
  const refreshed = await json('/api/wardrobe/suggestion/refresh', { method: 'POST' });
  assert.equal(refreshed.status, 200);
  const next = await json('/api/wardrobe/suggestion');
  assert.deepEqual(next.body.itemIds, ['w1', 'w6', 'w4']);

  const order = await json('/api/wardrobe/drafts', { method: 'POST', body: JSON.stringify({ text: '深蓝直筒牛仔裤\n白色运动鞋' }) });
  assert.equal(order.status, 200);
  assert.equal(order.body.drafts[0].category, '裤装');
  assert.equal(order.body.drafts[1].category, '鞋包');

  const manual = await json('/api/wardrobe/drafts', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,aaaa' }) });
  assert.equal(manual.status, 200);
  assert.equal(manual.body.manual, true);
  assert.equal(manual.body.drafts[0].name, '');
  assert.equal(JSON.stringify(manual.body).includes('eyJ'), false);
});
