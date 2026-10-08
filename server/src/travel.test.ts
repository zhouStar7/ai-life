import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { draftFromModel, parseItinerary } from './adapters/itinerary.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';
import { pickTravelOutfit } from './tripPlan.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-travel-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('npx prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'pipe',
});

const STATES = [
  { entity_id: 'light.living', state: 'on', attributes: { friendly_name: '客厅主灯', brightness: 200 } },
  { entity_id: 'climate.living', state: 'cool', attributes: { friendly_name: '客厅空调', current_temperature: 24 } },
  { entity_id: 'media_player.tv', state: 'off', attributes: { friendly_name: '客厅电视' } },
];

const calls: { url: string; body: string }[] = [];
const ha = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();
  calls.push({ url: req.url || '', body });
  if (req.url === '/api/states') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(STATES));
    return;
  }
  if (req.url === '/chat/completions') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: '成都行程',
        transport: '高铁',
        dateLabel: '10月2日 – 10月4日',
        destination: '成都',
        tickets: [{ label: 'G123', status: '已出票' }, { label: '成都宾馆', status: '已确认' }],
        timeline: [
          { time: '10-02 09:00', title: '出发', detail: '上海虹桥' },
          { time: '10-02 18:00', title: '抵达', detail: '成都东' },
          { time: '10月2日', title: '入住', detail: '成都宾馆' },
        ],
        packing: ['身份证', '充电器'],
      }) } }],
    }));
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end('[]');
});
await new Promise<void>((resolve) => ha.listen(0, '127.0.0.1', () => resolve()));
const haAddress = ha.address();
if (!haAddress || typeof haAddress === 'string') throw new Error('ha');
const haBase = `http://127.0.0.1:${haAddress.port}`;

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
  ha.close();
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

test('looser notes still become a timeline and nonsense stays empty', () => {
  const flight = parseItinerary('已出票 CA1501，9月28日 08:30 从上海虹桥起飞，10:40 抵达北京首都。北京国贸酒店，9月28日入住，9月30日离店。');
  assert.equal(flight?.transport, '飞机');
  assert.equal(flight?.title, '北京行程');
  assert.ok(flight?.timeline.some((node) => node.title === '抵达' && node.detail.includes('北京')));
  assert.ok(flight?.timeline.some((node) => node.title === '入住'));
  const train = parseItinerary('车次 G7321，9月20日 08:12 从上海虹桥开，09:28 到杭州东');
  assert.equal(train?.transport, '高铁');
  assert.equal(train?.title, '杭州行程');
  const hotel = parseItinerary('预订杭州西湖酒店，9月20日入住，9月22日退房');
  assert.equal(hotel?.transport, '其他');
  assert.ok(hotel?.timeline.some((node) => node.title === '离店'));
  assert.equal(parseItinerary('今天随便写一句'), null);
});

test('a saved model fills a draft when the rules cannot, and the person still confirms by importing', async () => {
  const blocked = await json('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text: '下周三去成都，晚上住一晚，车次没按固定格式写' }) });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error, 'unreadable');
  await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: haBase, model: 'local', apiKey: 'model-secret' }) });
  const parsed = await json('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text: '下周三去成都，晚上住一晚' }) });
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.draft.source, 'model');
  assert.equal(parsed.body.draft.transport, '高铁');
  assert.ok(parsed.body.draft.timeline.some((node: { title: string }) => node.title === '入住'));
  assert.equal(JSON.stringify(parsed.body).includes('model-secret'), false);
  const saved = await json('/api/trips/import', { method: 'POST', body: JSON.stringify({ draft: parsed.body.draft }) });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.snapshot.trips.some((trip: { title: string }) => trip.title === '成都行程'));
  assert.equal(draftFromModel('{"timeline":[]}'), null);
});

test('cold cities pick a coat from the current wardrobe', () => {
  const outfit = pickTravelOutfit([
    { id: 'w1', name: '白色牛津衬衫', category: '上衣', season: '春夏', occasion: '通勤' },
    { id: 'w2', name: '深蓝直筒牛仔裤', category: '裤装', season: '四季', occasion: '日常' },
    { id: 'w3', name: '米色风衣', category: '外套', season: '春秋', occasion: '外出' },
    { id: 'w5', name: '黑色乐福鞋', category: '鞋包', season: '四季', occasion: '通勤' },
  ], '哈尔滨', '22°C 多云', true);
  assert.ok(outfit.itemIds.includes('w3'));
  assert.ok(outfit.itemIds.includes('w1'));
  assert.match(outfit.reason, /哈尔滨/);
});

test('chaining a connected trip turns devices off and offers a meal without a same-name scene', async () => {
  await json('/api/home', { method: 'PUT', body: JSON.stringify({ baseUrl: haBase, token: 'mock-token' }) });
  calls.length = 0;
  const synced = await json('/api/home/sync', { method: 'POST' });
  assert.equal(synced.body.snapshot.home.connected, true);
  calls.length = 0;
  const chained = await json('/api/trips/t-bj/chain', { method: 'POST' });
  assert.equal(chained.status, 200);
  assert.equal(chained.body.chain.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url.includes('/api/services/scene/')), false);
  assert.equal(calls.some((call) => call.url === '/api/services/light/turn_off' && call.body.includes('light.living')), true);
  assert.equal(calls.some((call) => call.url === '/api/services/climate/turn_off' && call.body.includes('climate.living')), true);
  assert.equal(chained.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.living').on, false);
  assert.ok(chained.body.chain.outfit.itemIds.includes('w1'));
  assert.equal(chained.body.chain.meal.name, '鸡胸肉沙拉');
  assert.equal(JSON.stringify(chained.body).includes('mock-token'), false);
  const adopted = await json('/api/trips/t-bj/meal', { method: 'POST', body: JSON.stringify({ name: '鸡胸肉沙拉' }) });
  assert.equal(adopted.body.snapshot.meals.filter((meal: { name: string }) => meal.name === '鸡胸肉沙拉').length, 1);
  const again = await json('/api/trips/t-bj/meal', { method: 'POST', body: JSON.stringify({ name: '鸡胸肉沙拉' }) });
  assert.equal(again.body.snapshot.meals.filter((meal: { name: string }) => meal.name === '鸡胸肉沙拉').length, 1);
});

test('packing lines become a template and ticket costs stay on the trip', async () => {
  const added = await json('/api/trips/t-bj/packing', { method: 'POST', body: JSON.stringify({ text: '转换插头' }) });
  assert.ok(added.body.snapshot.trips.find((trip: { id: string }) => trip.id === 't-bj').packing.some((item: { text: string }) => item.text === '转换插头'));
  const saved = await json('/api/packing-templates', { method: 'POST', body: JSON.stringify({ tripId: 't-bj', name: '出差行李' }) });
  const template = saved.body.snapshot.packingTemplates.find((item: { name: string }) => item.name === '出差行李');
  assert.ok(template.items.includes('转换插头'));
  const created = await json('/api/trips', { method: 'POST', body: JSON.stringify({ title: '哈尔滨周末', transport: '飞机', dateLabel: '10月2日' }) });
  const trip = created.body.snapshot.trips.find((item: { title: string }) => item.title === '哈尔滨周末');
  const applied = await json(`/api/trips/${trip.id}/packing-template`, { method: 'POST', body: JSON.stringify({ templateId: template.id }) });
  assert.ok(applied.body.snapshot.trips.find((item: { id: string }) => item.id === trip.id).packing.some((item: { text: string }) => item.text === '转换插头'));
  const billed = await json(`/api/trips/${trip.id}/expenses`, { method: 'POST', body: JSON.stringify({ amount: 860, merchant: '南航', kind: '票务' }) });
  const row = billed.body.snapshot.expenses.find((item: { merchant: string }) => item.merchant === '南航');
  assert.equal(row.tripId, trip.id);
  assert.equal(row.tag, '行');
  assert.equal(row.note, '票务');
  const beijing = billed.body.snapshot.expenses.filter((item: { tripId?: string }) => item.tripId === 't-bj');
  assert.equal(beijing.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0), 1680 + 980);
  assert.equal(JSON.stringify(billed.body).includes('mock-token'), false);
  assert.equal(JSON.stringify(billed.body).includes('model-secret'), false);
});
