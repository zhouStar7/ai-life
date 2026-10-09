import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { readWeather } from './adapters/weather.js';
import { seedIfEmpty } from './seed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-'));
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

before(() => undefined);
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

test('snapshot matches the demo seed', async () => {
  const { body } = await json('/api/snapshot');
  assert.equal(body.items.length, 6);
  assert.equal(body.expenses.length, 19);
  assert.equal(body.trips.find((trip: { id: string }) => trip.id === 't-bj').title, '北京差旅');
  assert.equal(body.alerts.find((alert: { id: string }) => alert.id === 'a-filter').title, '净水器滤芯剩余 8%');
  assert.equal(body.model.configured, false);
  assert.equal(body.model.apiKey, undefined);
});

test('writes survive a second read', async () => {
  const created = await json('/api/items', { method: 'POST', body: JSON.stringify({ name: '灰色针织衫', category: '上衣', color: '灰色', season: '冬', occasion: '通勤' }) });
  assert.equal(created.status, 200);
  const again = await json('/api/snapshot');
  assert.ok(again.body.items.some((item: { name: string }) => item.name === '灰色针织衫'));
});

test('arrange without a model stays unavailable', async () => {
  const { status, body } = await json('/api/agent/arrange', { method: 'POST', body: JSON.stringify({ text: '今天上海降温下雨，我要去参加一个技术交流会' }) });
  assert.equal(status, 503);
  assert.equal(body.error, 'model_unavailable');
});

test('model plan adopts outfit, meal, away scene, packing and travel expense once', async () => {
  const saved = await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://model.local/v1', model: 'local', apiKey: 'secret' }) });
  assert.equal(saved.body.snapshot.model.configured, true);
  assert.equal(saved.body.snapshot.model.baseUrl, 'http://model.local/v1');
  assert.equal(saved.body.snapshot.model.apiKey, undefined);

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"title":"模型方案","lines":["穿搭已定","午餐清淡","离家","行李","差旅"],"href":"/","actions":[]}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  };

  try {
    const arranged = await json('/api/agent/arrange', { method: 'POST', body: JSON.stringify({ text: '今天上海降温下雨，我要去参加一个技术交流会' }) });
    assert.equal(arranged.status, 200);
    assert.equal(arranged.body.title, '模型方案');
    assert.equal(arranged.body.key, 'cross');
    assert.equal(arranged.body.actions.length, 6);
    const adopted = await json('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: arranged.body.key, actions: arranged.body.actions }) });
    const snap = adopted.body.snapshot;
    assert.equal(snap.items.find((item: { id: string }) => item.id === 'w3').wears, 7);
    assert.ok(snap.meals.some((meal: { name: string }) => meal.name === '鸡胸温蔬藜麦'));
    assert.equal(snap.activeScene, '离家');
    assert.equal(snap.devices.find((device: { id: string }) => device.id === 'd1').on, false);
    assert.equal(snap.devices.find((device: { id: string }) => device.id === 'd7').offline, true);
    const trip = snap.trips.find((item: { id: string }) => item.id === 't-bj');
    assert.ok(trip.packing.some((item: { text: string }) => item.text === '防风风衣'));
    assert.ok(trip.packing.some((item: { text: string }) => item.text === '保暖内胆'));
    assert.equal(snap.expenses.filter((item: { id: string }) => item.id === 'e-cross').length, 1);
    assert.equal(snap.alerts.find((alert: { id: string }) => alert.id === 'a-filter').handled, true);
    const repeat = await json('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'cross', actions: arranged.body.actions }) });
    assert.equal(repeat.body.snapshot.expenses.filter((item: { id: string }) => item.id === 'e-cross').length, 1);
    assert.equal(repeat.body.snapshot.items.find((item: { id: string }) => item.id === 'w3').wears, 7);
  } finally {
    globalThis.fetch = original;
  }
});

test('weather failure turns the outfit reason back to occasion', async () => {
  const weather = await readWeather('http://127.0.0.1:9/weather');
  assert.equal(weather.weatherOn, false);
});
