import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDevices, mapScenes } from './adapters/home-assistant.js';
import { parseItinerary } from './adapters/itinerary.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-p3-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('npx prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'pipe',
});

const calls: { url: string; auth: string; body: string }[] = [];
const ha = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  calls.push({ url: req.url || '', auth: req.headers.authorization || '', body: Buffer.concat(chunks).toString() });
  if (req.url === '/api/states') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([
      { entity_id: 'light.living', state: 'on', attributes: { friendly_name: '客厅主灯', brightness: 178 } },
      { entity_id: 'climate.bedroom', state: 'heat', attributes: { friendly_name: '卧室空调', current_temperature: 26 } },
      { entity_id: 'media_player.tv', state: 'off', attributes: { friendly_name: '客厅电视' } },
      { entity_id: 'cover.curtain', state: 'open', attributes: { friendly_name: '客厅窗帘', current_position: 40 } },
      { entity_id: 'scene.away', state: 'unknown', attributes: { friendly_name: '离家' } },
      { entity_id: 'sensor.temp', state: '22', attributes: { friendly_name: '温度' } },
    ]));
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

const SMS = '【航旅纵横】已出票：9月28日 CA1501 上海虹桥T2 08:30 起飞，10:40 抵达北京首都T3。北京国贸酒店 9月28日入住，9月30日离店，已确认。';
const MAIL = `航班 MU5101
出发：2026-09-28 08:30 上海虹桥
到达：2026-09-28 10:40 北京首都
酒店：北京国贸酒店
入住：9月28日
离店：9月30日
`;

test('states map onto light climate player and cover, and only named scenes', () => {
  const devices = mapDevices([
    { entity_id: 'light.living', state: 'on', attributes: { friendly_name: '客厅主灯', brightness: 255 } },
    { entity_id: 'sensor.temp', state: '22', attributes: { friendly_name: '温度' } },
  ]);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].kind, '灯');
  assert.equal(devices[0].paramValue, '100%');
  assert.deepEqual(mapScenes([
    { entity_id: 'scene.away', state: 'unknown', attributes: { friendly_name: '离家' } },
    { entity_id: 'scene.movie', state: 'unknown', attributes: { friendly_name: '看电影' } },
  ]), { 离家: 'scene.away' });
});

test('sms and mail become a timeline and a packing list', () => {
  const sms = parseItinerary(SMS);
  assert.equal(sms?.title, '北京行程');
  assert.equal(sms?.transport, '飞机');
  assert.ok(sms?.timeline.some((node) => node.title === '出发' && node.detail === '上海虹桥T2'));
  assert.ok(sms?.timeline.some((node) => node.title === '入住'));
  assert.ok(sms?.packing.includes('登机证件'));
  assert.ok(sms?.packing.includes('身份证'));
  const mail = parseItinerary(MAIL);
  assert.equal(mail?.tickets[0].label, 'MU5101');
  assert.ok(mail?.timeline.some((node) => node.title === '离店'));
  assert.equal(parseItinerary('今天随便写一句'), null);
});

test('parsed trip can be saved', async () => {
  const parsed = await json('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text: SMS }) });
  assert.equal(parsed.status, 200);
  const saved = await json('/api/trips/import', { method: 'POST', body: JSON.stringify({ draft: parsed.body.draft }) });
  assert.equal(saved.status, 200);
  const trip = saved.body.snapshot.trips.find((item: { title: string }) => item.title === '北京行程');
  assert.ok(trip.timeline.some((node: { title: string }) => node.title === '抵达'));
  assert.ok(trip.packing.some((item: { text: string }) => item.text === '登机证件'));
});

test('chain updates outfit, local away scene and travel budget without calling the house', async () => {
  const before = await json('/api/snapshot');
  const wears = before.body.items.find((item: { id: string }) => item.id === 'w1').wears;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url.includes('192.168.0.111'), false);
    return original(input, init);
  };
  try {
    const chained = await json('/api/trips/t-bj/chain', { method: 'POST' });
    assert.equal(chained.status, 200);
    assert.equal(chained.body.chain.scene.name, '离家');
    assert.equal(chained.body.chain.scene.via, 'local');
    assert.equal(chained.body.chain.budget.spent, before.body.spending.byTag.行);
    assert.equal(chained.body.chain.budget.remain, before.body.budgets.行 - before.body.spending.byTag.行);
    assert.equal(chained.body.snapshot.activeScene, '离家');
    assert.equal(chained.body.snapshot.items.find((item: { id: string }) => item.id === 'w1').wears, wears + 1);
    assert.equal(chained.body.snapshot.devices.find((item: { id: string }) => item.id === 'd1').on, false);
    assert.equal(chained.body.snapshot.home.connected, false);
    assert.equal(chained.body.snapshot.home.token, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test('without a token the house stays on demo data and the token is never returned', async () => {
  const synced = await json('/api/home/sync', { method: 'POST' });
  assert.equal(synced.body.error, 'home_unconfigured');
  assert.equal(synced.body.snapshot.home.connected, false);
  assert.equal(synced.body.snapshot.home.baseUrl, 'http://192.168.0.111:8123');
  assert.ok(synced.body.snapshot.devices.some((item: { id: string }) => item.id === 'd1'));
  const saved = await json('/api/home', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://192.168.0.111:8123', token: 'secret-token' }) });
  assert.equal(saved.body.snapshot.home.configured, true);
  assert.equal(saved.body.snapshot.home.connected, false);
  assert.equal(JSON.stringify(saved.body).includes('secret-token'), false);
});

test('a reachable assistant replaces cards and a missing scene is not called', async () => {
  calls.length = 0;
  await json('/api/home', { method: 'PUT', body: JSON.stringify({ baseUrl: haBase, token: 'test-token' }) });
  const synced = await json('/api/home/sync', { method: 'POST' });
  assert.equal(synced.body.error, undefined);
  assert.equal(synced.body.snapshot.home.connected, true);
  const ids = synced.body.snapshot.devices.map((item: { id: string }) => item.id);
  assert.deepEqual(ids.sort(), ['climate.bedroom', 'cover.curtain', 'light.living', 'media_player.tv']);
  assert.equal(synced.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.living').kind, '灯');
  assert.equal(calls.some((call) => call.url === '/api/states' && call.auth === 'Bearer test-token'), true);

  calls.length = 0;
  const toggled = await json('/api/devices/light.living/toggle', { method: 'POST' });
  assert.equal(toggled.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.living').on, false);
  assert.equal(calls.some((call) => call.url === '/api/services/light/turn_off'), true);

  calls.length = 0;
  const away = await json('/api/scenes/离家', { method: 'POST' });
  assert.equal(away.body.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url === '/api/services/scene/turn_on' && call.body.includes('scene.away')), true);

  calls.length = 0;
  const cinema = await json('/api/scenes/影院', { method: 'POST' });
  assert.equal(cinema.body.scene.via, 'local');
  assert.equal(calls.some((call) => call.url.includes('/api/services/scene/')), false);
});

test('an unreachable assistant is marked disconnected and demo devices remain', async () => {
  await json('/api/home', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://127.0.0.1:9', token: 'another-token' }) });
  const synced = await json('/api/home/sync', { method: 'POST' });
  assert.equal(synced.body.error, 'home_unavailable');
  assert.equal(synced.body.snapshot.home.connected, false);
  assert.ok(synced.body.snapshot.devices.some((item: { id: string }) => item.id === 'd1'));
  assert.equal(JSON.stringify(synced.body).includes('another-token'), false);
});
