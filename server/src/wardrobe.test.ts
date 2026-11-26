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
import { sessionCookie } from './testSession.js';
import { outfitFromModel } from './adapters/outfit.js';
import { draftsFromOrder, planOutfit, similarItems } from './wardrobePlan.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-wardrobe-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('./node_modules/.bin/prisma db push --skip-generate', {
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

let cookie = '';
async function json(pathname: string, init?: RequestInit) {
  if (!cookie) cookie = await sessionCookie(base);
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init?.headers ?? {}) },
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

test('model outfit keeps known ids and drops an unreadable reply', () => {
  const picked = outfitFromModel('```json\n{"itemIds":["w3","w1","missing"],"reason":"加一件风衣"}\n```', SEED_ITEMS);
  assert.deepEqual(picked?.itemIds, ['w3', 'w1']);
  assert.equal(picked?.reason, '加一件风衣');
  assert.equal(outfitFromModel('{"itemIds":["missing"]}', SEED_ITEMS), null);
  assert.equal(outfitFromModel('不是 JSON', SEED_ITEMS), null);
});

test('custom model picks the outfit, and a repeat falls back to closet rules', async () => {
  await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://model.local/v1', model: 'local', apiKey: 'secret' }) });
  const original = globalThis.fetch;
  let replies = [
    '{"itemIds":["w3","w1","w2"],"reason":"22°C 多云，风衣搭配衬衫和牛仔裤。"}',
    '{"itemIds":["w3","w1","w2"],"reason":"还是这一套"}',
    '不是衣服',
  ];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('chat/completions')) {
      const content = replies.shift() ?? '不是衣服';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  };
  try {
    const suggested = await json('/api/wardrobe/suggestion');
    assert.equal(suggested.status, 200);
    assert.equal(suggested.body.source, 'model');
    assert.deepEqual(suggested.body.itemIds, ['w3', 'w1', 'w2']);
    assert.match(suggested.body.reason, /风衣/);
    const asked = await json('/api/snapshot');
    const refreshed = await json('/api/wardrobe/suggestion/refresh', {
      method: 'POST',
      body: JSON.stringify({ avoid: ['w2', 'w3', 'w1'] }),
    });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.suggestion.source, 'rules');
    assert.notDeepEqual([...refreshed.body.suggestion.itemIds].sort(), ['w1', 'w2', 'w3']);
    assert.deepEqual(refreshed.body.suggestion.itemIds, planOutfit(SEED_ITEMS, asked.body.suggestionIndex + 1, true, '22°C 多云').itemIds);

    const broken = await json('/api/wardrobe/suggestion');
    assert.equal(broken.body.source, 'rules');
    assert.deepEqual(broken.body.itemIds, planOutfit(SEED_ITEMS, asked.body.suggestionIndex + 1, true, '22°C 多云').itemIds);
  } finally {
    globalThis.fetch = original;
    await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: '', model: '' }) });
  }
});

test('a photo data url is stored as the cover and other values are dropped', async () => {
  const cover = 'data:image/jpeg;base64,aaaa';
  const saved = await json('/api/items', { method: 'POST', body: JSON.stringify({ name: '封面衬衫', category: '上衣', color: '白色', cover }) });
  assert.equal(saved.status, 200);
  const item = saved.body.snapshot.items.find((row: { name: string; cover?: string }) => row.name === '封面衬衫');
  assert.equal(item.cover, cover);
  const dropped = await json('/api/items', { method: 'POST', body: JSON.stringify({ name: '无图裤子', category: '裤装', color: '蓝色', cover: 'https://example.invalid/a.jpg' }) });
  const plain = dropped.body.snapshot.items.find((row: { name: string; cover?: string }) => row.name === '无图裤子');
  assert.equal(plain.cover, '');
});

test('purchase price is optional, stored in cents and round-trips through updates', async () => {
  const draft = { name: '价格测试衬衫', category: '上衣', color: '米色' };
  const created = await json('/api/items', { method: 'POST', body: JSON.stringify({ ...draft, price: 199.99 }) });
  assert.equal(created.status, 200);
  const item = created.body.snapshot.items.find((row: { name: string }) => row.name === draft.name);
  assert.equal(item.price, 199.99);
  assert.equal('priceCents' in item, false);
  assert.equal((await db.wardrobeItem.findUniqueOrThrow({ where: { id: item.id } })).priceCents, 19999);
  await json(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ season: '春秋' }) });
  assert.equal((await json('/api/items')).body.find((row: { id: string }) => row.id === item.id).price, 199.99);
  await json(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ price: 0 }) });
  assert.equal((await json('/api/items')).body.find((row: { id: string }) => row.id === item.id).price, 0);
  await json(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ price: null }) });
  assert.equal((await json('/api/items')).body.find((row: { id: string }) => row.id === item.id).price, null);
  const noPrice = await json('/api/items', { method: 'POST', body: JSON.stringify({ ...draft, name: '未知价格衬衫' }) });
  assert.equal(noPrice.status, 200);
  assert.equal(noPrice.body.snapshot.items.find((row: { name: string }) => row.name === '未知价格衬衫').price, null);
});

test('invalid purchase prices are rejected on create, update and the entire batch', async () => {
  const draft = { name: '校验衬衫', category: '上衣', color: '灰色' };
  const existing = await db.wardrobeItem.findFirstOrThrow();
  for (const price of [-1, 1.234, '99', 21474836.48, {}, true]) {
    assert.equal((await json('/api/items', { method: 'POST', body: JSON.stringify({ ...draft, price }) })).status, 400);
    assert.equal((await json(`/api/items/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ price }) })).status, 400);
    const before = await db.wardrobeItem.count();
    const batch = await json('/api/items/batch', { method: 'POST', body: JSON.stringify({ items: [draft, { ...draft, price }] }) });
    assert.equal(batch.status, 400);
    assert.equal(await db.wardrobeItem.count(), before);
  }
  const before = await db.wardrobeItem.count();
  const invalidName = await json('/api/items/batch', { method: 'POST', body: JSON.stringify({ items: [draft, { ...draft, name: '   ' }] }) });
  assert.equal(invalidName.status, 400);
  assert.equal(await db.wardrobeItem.count(), before);
});

test('batch intake persists mixed optional prices and photos without creating expenses', async () => {
  const before = await db.wardrobeItem.count();
  const expenses = await db.expense.count();
  const cover = 'data:image/jpeg;base64,aaaa';
  const rows = [
    { name: '批量价格上衣', category: '上衣', color: '蓝色', price: 29.9, cover, season: '夏', occasion: '休闲' },
    { name: '批量无价裤子', category: '裤装', color: '黑色' },
    { name: '批量零价外套', category: '外套', color: '白色', price: 0 },
  ];
  const saved = await json('/api/items/batch', { method: 'POST', body: JSON.stringify({ items: rows }) });
  assert.equal(saved.status, 200);
  assert.equal(await db.wardrobeItem.count(), before + 3);
  const snapshot = (await json('/api/snapshot')).body;
  const byName = (name: string) => snapshot.items.find((row: { name: string }) => row.name === name);
  assert.equal(byName(rows[0].name).price, 29.9);
  assert.equal(byName(rows[0].name).cover, cover);
  assert.equal(byName(rows[0].name).season, '夏');
  assert.equal(byName(rows[1].name).price, null);
  assert.equal(byName(rows[2].name).price, 0);
  assert.equal(await db.expense.count(), expenses);
});

test('order drafts retain explicit item prices and never treat totals as clothes', () => {
  const rows = draftsFromOrder('白色衬衫 ¥199.90\n深蓝裤子 ￥0\n黑色乐福鞋\n合计 ¥199.90');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].price, 199.9);
  assert.equal(rows[0].name, '白色衬衫');
  assert.equal(rows[1].price, 0);
  assert.equal(rows[2].price, null);
});
