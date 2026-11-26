import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openSession } from './auth.js';
import { ensureMemberData } from './members.js';
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

test('duplicate check uses category, name and normalized color', () => {
  const hits = similarItems(SEED_ITEMS, { name: '牛津衬衫', color: '黑色', category: '上衣' });
  assert.deepEqual(hits.map((item) => item.id), ['w1']);
  const styled = similarItems(SEED_ITEMS, { name: '新乐福', color: '黑', category: '鞋包' });
  assert.equal(similarItems(SEED_ITEMS, { name: '黑裤', color: '黑', category: '裤装' }).length, 0);
  assert.deepEqual(styled.map((item) => item.id), ['w5']);
  const different = similarItems(SEED_ITEMS, { name: '亚麻衬衫', color: '白色', category: '上衣' }, 'w1');
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
  assert.equal(drafts[0].price, undefined);
  assert.equal(drafts[1].price, 899);
  assert.equal(draftsFromOrder('黑色外套 ￥1,299.90')[0].price, 1299.9);
  assert.equal(draftsFromOrder('黑色外套 ¥19.999')[0].price, undefined);
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

test('similarity hints allow all ten synthetic garments to be saved and read back', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    name: `试穿外套 ${index + 1}`, category: '外套', color: '米色', occasion: '通勤', season: '春秋',
  }));
  assert.ok(similarItems(SEED_ITEMS, items[0]).length > 0);
  const saved = await json('/api/items/batch', { method: 'POST', body: JSON.stringify({ items }) });
  assert.equal(saved.status, 200);
  const { body } = await json('/api/snapshot');
  const garments = body.items.filter((item: { name: string }) => item.name.startsWith('试穿外套 '));
  assert.deepEqual(garments.map((item: { name: string }) => item.name).sort(), items.map(item => item.name).sort());
});

test('wardrobe price and photo persist privately without creating an expense', async () => {
  const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4hQAAAAASUVORK5CYII=';
  const name = '成员通过照片录入的黑色上衣';
  for (const id of ['local', 'wardrobe-peer']) {
    await db.member.create({ data: { id, username: id, name: id, passwordHash: '', createdAt: '2026-01-01' } });
    await ensureMemberData(db, id);
  }
  const owner = `ailife=${await openSession(db, 'local')}`;
  const peer = `ailife=${await openSession(db, 'wardrobe-peer')}`;
  const app = createApp(db, { auth: true });
  const write = (path: string, body: unknown, cookie = owner, method = 'POST') => app.request(path, {
    method, headers: { cookie, 'content-type': 'application/json', 'idempotency-key': `wardrobe-test-${crypto.randomUUID()}` },
    body: JSON.stringify(body),
  });
  const expenseCount = await db.expense.count();
  const created = await write('/api/items/batch', {
    createdAt: '2026-05-07', items: [{ name, category: '上衣', color: '黑色', cover, price: 109.99 }],
  });
  assert.equal(created.status, 200);
  const { snapshot } = await created.json();
  const item = snapshot.items.find((row: { name: string }) => row.name === name);
  assert.ok(item);
  assert.equal(item.price, 109.99);
  assert.equal(item.createdAt, '2026-05-07');
  assert.equal(item.priceCents, undefined);
  assert.equal(item.memberId, undefined);
  assert.equal(await db.expense.count(), expenseCount);
  assert.equal((await db.wardrobeItem.findUniqueOrThrow({ where: { id: item.id } })).priceCents, 10999n);
  assert.match(item.cover, /^\/api\/items\/[^/]+\/cover\?v=/);

  const expense = await write('/api/expenses', { tag: '衣', date: item.createdAt, amount: item.price, merchant: name });
  assert.equal(expense.status, 200);
  const recorded = await db.expense.findFirstOrThrow({ where: { merchant: name } });
  assert.equal(recorded.date, '2026-05-07');
  assert.equal(recorded.amountCents, 10999n);

  const image = await app.request(item.cover, { headers: { cookie: owner } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), cover.split(',')[1]);
  assert.equal((await app.request(item.cover)).status, 401);
  assert.equal((await app.request(item.cover, { headers: { cookie: peer } })).status, 404);
  assert.equal((await write(`/api/items/${item.id}`, { price: 2 }, peer, 'PATCH')).status, 404);
  assert.equal((await write('/api/outfits', { itemIds: [item.id] }, peer)).status, 400);
  assert.equal((await write('/api/wardrobe/suggestion/adopt', { itemIds: [item.id] }, peer)).status, 400);

  const edited = await write(`/api/items/${item.id}`, { price: null, cover: item.cover }, owner, 'PATCH');
  assert.equal(edited.status, 200);
  const editedItem = (await edited.json()).snapshot.items.find((row: { id: string }) => row.id === item.id);
  assert.equal(editedItem.price, null);
  assert.equal(editedItem.cover, item.cover);
  assert.equal((await write(`/api/items/${item.id}`, { cover: '' }, owner, 'PATCH')).status, 200);
  assert.equal((await app.request(item.cover, { headers: { cookie: owner } })).status, 404);
  assert.equal(await db.wardrobePhoto.count(), 0);
});

test('configured model uses closet IDs and falls back when no valid choice is returned', async () => {
  const mock = new Hono();
  let modelAnswer = { itemIds: ['missing', 'w1', 'w1', 'w5'], reason: '选择两件衣橱单品' };
  let requestText = '';
  mock.post('/v1/chat/completions', async (c) => {
    requestText = await c.req.text();
    return c.json({ choices: [{ message: { content: JSON.stringify(modelAnswer) } }] });
  });
  const provider = serve({ fetch: mock.fetch, port: 0, hostname: '127.0.0.1' });
  try {
    if (!provider.listening) await new Promise<void>((resolve) => provider.once('listening', resolve));
    const address = provider.address();
    assert.ok(address && typeof address !== 'string');
    await db.profile.update({ where: { id: 'local' }, data: { modelBase: `http://127.0.0.1:${address.port}/v1` } });
    const { body } = await json('/api/wardrobe/suggestion');
    assert.equal(body.source, 'model');
    assert.deepEqual(body.itemIds, ['w1', 'w5']);
    assert.match(requestText, /w1/);
    assert.equal(requestText.includes('data:image/'), false);
    assert.equal((await json('/api/wardrobe/suggestion?avoid=w1&avoid=w5')).body.source, 'rules');
    modelAnswer = { itemIds: ['unknown'], reason: '' };
    const fallback = await json('/api/wardrobe/suggestion');
    assert.equal(fallback.body.source, 'rules');
    assert.ok(fallback.body.itemIds.length);
    const before = await db.wardrobeItem.findMany({ where: { id: { in: body.itemIds } }, orderBy: { id: 'asc' } });
    const payload = { method: 'POST', body: JSON.stringify({ itemIds: body.itemIds }) };
    assert.equal((await json('/api/wardrobe/suggestion/adopt', payload)).body.adopted, true);
    assert.equal((await json('/api/wardrobe/suggestion/adopt', payload)).body.adopted, false);
    const updated = await db.wardrobeItem.findMany({ where: { id: { in: body.itemIds } }, orderBy: { id: 'asc' } });
    assert.deepEqual(updated.map((item) => item.wears), before.map((item) => item.wears + 1));
  } finally {
    provider.close();
    await db.profile.update({ where: { id: 'local' }, data: { modelBase: '' } });
  }
});
