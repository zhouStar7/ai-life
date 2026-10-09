import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlerts, mapDevices } from './adapters/home-assistant.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';
import { serviceCalls } from './scenes.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-home-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.sqlite')}`;
execSync('npx prisma db push --skip-generate', {
  cwd: path.join(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'pipe',
});

const STATES = [
  { entity_id: 'light.study', state: 'on', attributes: { friendly_name: '客厅灯', brightness: 255 } },
  { entity_id: 'light.spare', state: 'on', attributes: { friendly_name: '备用灯' } },
  { entity_id: 'light.dead', state: 'unavailable', attributes: { friendly_name: '过道灯' } },
  { entity_id: 'climate.bed', state: 'heat', attributes: { friendly_name: '卧室空调', current_temperature: 26 } },
  { entity_id: 'media_player.speaker', state: 'playing', attributes: { friendly_name: '音箱' } },
  { entity_id: 'scene.movie', state: 'unknown', attributes: { friendly_name: '看电影' } },
  { entity_id: 'sensor.battery', state: '12', attributes: { friendly_name: '门磁电池电量', device_class: 'battery', unit_of_measurement: '%' } },
  { entity_id: 'sensor.energy', state: '3', attributes: { friendly_name: '空调日电量', device_class: 'energy', unit_of_measurement: 'kWh' } },
  { entity_id: 'sensor.filter', state: '8', attributes: { friendly_name: '示例滤芯', device_class: 'filter', unit_of_measurement: '%' } },
];

const AREAS = `light.study||书房
light.spare||
light.dead||玄关
climate.bed||卧室
media_player.speaker||客厅
`;

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
  if (req.url === '/api/template') {
    res.setHeader('content-type', 'text/plain');
    res.end(AREAS);
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

test('areas replace name guesses and empty areas stay unzoned', () => {
  const areas = { 'light.study': '书房', 'light.spare': '' };
  const devices = mapDevices([
    { entity_id: 'light.study', state: 'on', attributes: { friendly_name: '客厅灯' } },
    { entity_id: 'light.spare', state: 'on', attributes: { friendly_name: '备用灯' } },
  ], areas);
  assert.equal(devices.find((device) => device.id === 'light.study')?.room, '书房');
  assert.equal(devices.find((device) => device.id === 'light.spare')?.room, '未分区');
  assert.equal(mapDevices([{ entity_id: 'light.study', state: 'on', attributes: { friendly_name: '客厅灯' } }])[0].room, '客厅');
});

test('alerts come from offline devices, low battery and consumables', () => {
  const devices = mapDevices(STATES);
  const alerts = deriveAlerts(STATES, devices);
  assert.ok(alerts.some((alert) => alert.id === 'ha-offline-light.dead' && alert.title === '过道灯离线'));
  assert.ok(alerts.some((alert) => alert.id === 'ha-battery-sensor.battery' && alert.title.includes('12%')));
  assert.ok(alerts.some((alert) => alert.id === 'ha-consumable-sensor.filter'));
  assert.equal(alerts.some((alert) => alert.title.includes('日电量')), false);
  assert.equal(alerts.some((alert) => alert.id === 'a-filter'), false);
});

test('away and sleep move connected devices when no scene shares the name', async () => {
  await json('/api/home', { method: 'PUT', body: JSON.stringify({ baseUrl: haBase, token: 'mock-token' }) });
  calls.length = 0;
  const synced = await json('/api/home/sync', { method: 'POST' });
  assert.equal(synced.body.error, undefined);
  assert.equal(synced.body.snapshot.home.connected, true);
  assert.equal(synced.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.study').room, '书房');
  assert.equal(synced.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.spare').room, '未分区');
  assert.equal(synced.body.snapshot.alerts.some((item: { id: string }) => item.id === 'a-filter'), false);
  assert.ok(synced.body.snapshot.alerts.some((item: { id: string }) => item.id === 'ha-offline-light.dead'));
  assert.ok(synced.body.snapshot.alerts.some((item: { id: string }) => item.id === 'ha-battery-sensor.battery'));
  assert.ok(synced.body.snapshot.alerts.some((item: { id: string }) => item.id === 'ha-consumable-sensor.filter'));
  assert.deepEqual(synced.body.snapshot.home.sceneCatalog, [{ id: 'scene.movie', name: '看电影' }]);
  assert.equal(synced.body.snapshot.home.sceneBindings.离家, undefined);
  assert.equal(JSON.stringify(synced.body).includes('mock-token'), false);

  calls.length = 0;
  const away = await json('/api/scenes/离家', { method: 'POST' });
  assert.equal(away.body.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url.includes('/api/services/scene/')), false);
  assert.equal(calls.some((call) => call.url === '/api/services/light/turn_off' && call.body.includes('light.study')), true);
  assert.equal(calls.some((call) => call.url === '/api/services/light/turn_off' && call.body.includes('light.spare')), true);
  assert.equal(calls.some((call) => call.url === '/api/services/climate/turn_off' && call.body.includes('climate.bed')), true);
  assert.equal(calls.some((call) => call.url === '/api/services/media_player/turn_off' && call.body.includes('media_player.speaker')), true);
  assert.equal(calls.some((call) => call.body.includes('light.dead')), false);
  assert.equal(away.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.study').on, false);
  assert.equal(away.body.snapshot.devices.find((item: { id: string }) => item.id === 'light.dead').offline, true);

  calls.length = 0;
  const sleep = await json('/api/scenes/睡眠', { method: 'POST' });
  assert.equal(sleep.body.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url.includes('/api/services/scene/')), false);
  assert.equal(calls.some((call) => call.url === '/api/services/climate/turn_on' && call.body.includes('climate.bed')), true);
  assert.equal(calls.some((call) => call.url === '/api/services/climate/set_temperature' && call.body.includes('26')), true);
  assert.equal(sleep.body.snapshot.devices.find((item: { id: string }) => item.id === 'climate.bed').on, true);
  assert.equal(sleep.body.snapshot.devices.find((item: { id: string }) => item.id === 'climate.bed').paramValue, '26°C');
});

test('a scene binding calls that scene and device actions stay available', async () => {
  const rejected = await json('/api/home/scenes/回家', { method: 'POST', body: JSON.stringify({ target: 'scene.missing' }) });
  assert.equal(rejected.status, 400);
  const bound = await json('/api/home/scenes/回家', { method: 'POST', body: JSON.stringify({ target: 'scene.movie' }) });
  assert.equal(bound.body.snapshot.home.sceneBindings.回家, 'scene.movie');
  const devices = await json('/api/home/scenes/影院', { method: 'POST', body: JSON.stringify({ target: 'devices' }) });
  assert.equal(devices.body.snapshot.home.sceneBindings.影院, 'devices');

  calls.length = 0;
  const home = await json('/api/scenes/回家', { method: 'POST' });
  assert.equal(home.body.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url === '/api/services/scene/turn_on' && call.body.includes('scene.movie')), true);
  assert.equal(calls.some((call) => !call.url.includes('/scene/')), false);

  calls.length = 0;
  const cinema = await json('/api/scenes/影院', { method: 'POST' });
  assert.equal(cinema.body.scene.via, 'home-assistant');
  assert.equal(calls.some((call) => call.url.includes('/api/services/scene/')), false);
});

test('handled alerts stay handled and the example filter stays gone', async () => {
  const handled = await json('/api/alerts/ha-consumable-sensor.filter/handle', { method: 'POST' });
  assert.equal(handled.body.snapshot.alerts.find((item: { id: string }) => item.id === 'ha-consumable-sensor.filter').handled, true);
  const again = await json('/api/home/sync', { method: 'POST' });
  assert.equal(again.body.snapshot.alerts.find((item: { id: string }) => item.id === 'ha-consumable-sensor.filter').handled, true);
  assert.equal(again.body.snapshot.alerts.some((item: { id: string }) => item.id === 'a-filter'), false);
  for (const alert of again.body.snapshot.alerts.filter((item: { handled: boolean }) => !item.handled)) {
    const done = await json(`/api/alerts/${encodeURIComponent(alert.id)}/handle`, { method: 'POST' });
    assert.equal(done.body.snapshot.alerts.find((item: { id: string }) => item.id === alert.id).handled, true);
  }
  const final = await json('/api/snapshot');
  assert.equal(final.body.alerts.some((item: { handled: boolean }) => !item.handled), false);
  assert.equal(JSON.stringify(final.body).includes('mock-token'), false);
});

test('service calls follow the scene diff', () => {
  const light = { id: 'light.study', name: '客厅灯', room: '书房', kind: '灯', on: true, paramLabel: '亮度', paramValue: '70%', offline: false };
  assert.deepEqual(serviceCalls(light, { ...light, on: false }), [{ domain: 'light', service: 'turn_off' }]);
  const curtain = { id: 'cover.curtain', name: '窗帘', room: '客厅', kind: '窗帘', on: true, paramLabel: '开合', paramValue: '40%', offline: false };
  assert.deepEqual(serviceCalls(curtain, { ...curtain, paramValue: '闭合' }), [{ domain: 'cover', service: 'close_cover' }]);
});
