import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const trip = { id: 't', title: '回归行程', status: '即将开始', transport: '高铁', dateLabel: '周末', timeline: [], tickets: [{ label: '私密票号' }], packing: [{ id: 'p', text: '充电器', done: true }] };
const snapshot = { trips: [trip], activeTripId: 't', items: [], outfits: [], meals: [], recipes: [], devices: [], alerts: [], expenses: [], adoptedTips: [], budgets: { total: 0, 衣: 0, 食: 0, 住: 0, 行: 0 }, targets: { kcal: 2000, protein: 80 }, model: { model: '', baseUrl: '', configured: false }, notices: {} };
const accounts = {
  owner: { id: 'local', username: 'owner', name: '测试账号', isOwner: true },
  second: { id: 'second', username: 'second', name: '第二账号', isOwner: false },
};
const hints = { owner: 'a'.repeat(64), second: 'b'.repeat(64) };

test('production PWA serves a read-only packing list on a disconnected phone viewport', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'ai-life-pwa-'));
  await build({ root, build: { outDir }, logLevel: 'error' });
  const server = await preview({ root, build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [{
    name: 'synthetic-api', configurePreviewServer(server) {
      server.middlewares.use('/api', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        const active = req.headers.cookie?.match(/(?:^|;\s*)test-account=(owner|second)(?:;|$)/)?.[1];
        const sendSession = (account) => {
          res.setHeader('Set-Cookie', [`test-account=${account}; Path=/; HttpOnly`, `ailife-context=${hints[account]}; Path=/`]);
          res.end(JSON.stringify({ demo: false, member: accounts[account], needsSetup: false, cacheSession: hints[account] }));
        };
        if (req.url === '/auth/login') return sendSession('second');
        if (req.url === '/auth/logout') {
          res.setHeader('Set-Cookie', ['test-account=; Path=/; Max-Age=0', 'ailife-context=; Path=/; Max-Age=0']);
          return res.end(JSON.stringify({ ok: true }));
        }
        if (!active) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'unauthorized' }));
        }
        if (req.url === '/auth/session') return sendSession(active);
        const activeSnapshot = active === 'owner' ? snapshot : {
          ...snapshot, trips: [{ ...trip, title: '另一份行程', packing: [{ id: 'p', text: '护照', done: false }] }],
        };
        const responses = { '/snapshot': activeSnapshot, '/meals/shortcut-drafts': { drafts: [] }, '/weather/cities': { cities: [] } };
        res.end(JSON.stringify(responses[req.url] ?? {}));
      });
    },
  }] });
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome' });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'test-account', value: 'owner', url: origin, httpOnly: true }]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fits = () => page.evaluate(() => [document.documentElement, ...document.querySelectorAll('.viewport,.modal')].every(e => e.scrollWidth <= e.clientWidth + 1));
  await page.goto(origin);
  await page.getByRole('heading', { name: '今日概览' }).waitFor();
  assert.ok(await fits(), 'overview fits the viewport');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.goto(`${origin}/diet`);
  await page.getByTestId('add-meal').click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await fits(), 'diet entry fits the viewport');
  await page.goto(`${origin}/travel`);
  await page.getByRole('heading', { name: '行李清单' }).waitFor();
  assert.ok(await fits(), 'packing fits the viewport');
  await page.goto(`${origin}/settings`);
  await page.locator('.packing-cache time').waitFor();
  const data = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find(name => name.startsWith('ai-life-shell-')));
    const keys = (await cache.keys()).map(r => new URL(r.url).pathname);
    const manifest = await (await cache.match('/manifest.webmanifest')).json();
    const records = await new Promise((resolve, reject) => {
      const open = indexedDB.open('ai-life');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const query = open.result.transaction('snapshot').objectStore('snapshot').getAll();
        query.onsuccess = () => { open.result.close(); resolve(query.result); };
      };
    });
    return { keys, manifest, records };
  });
  assert.ok(data.keys.every(key => !key.startsWith('/api/')));
  for (const icon of data.manifest.icons) assert.ok(data.keys.includes(icon.src));
  assert.deepEqual(data.records, [{ savedAt: data.records[0].savedAt, trip: { title: trip.title, packing: [{ text: '充电器', done: true }] } }]);
  await context.setOffline(true);
  await page.goto(`${origin}/travel`);
  await page.getByRole('heading', { name: '离线打包清单' }).waitFor();
  await page.getByText('充电器', { exact: true }).waitFor();
  assert.equal(await page.locator('input,textarea,[role="checkbox"]').count(), 0);
  await page.getByRole('button', { name: '清除离线缓存' }).click();
  await page.getByText('本机暂无离线缓存。').waitFor();
  await page.reload();
  await page.getByText('本机暂无离线缓存。').waitFor();
  await context.setOffline(false);
  await page.getByRole('button', { name: '重新连接' }).click();
  await page.getByRole('heading', { name: '行李清单' }).waitFor();
  await page.goto(`${origin}/settings`);
  await page.locator('.packing-cache time').waitFor();
  await context.setOffline(true);
  await page.goto(`${origin}/travel`);
  await page.getByText('充电器', { exact: true }).waitFor();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('heading', { name: '登录' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '登录' }).waitFor();
  assert.equal(await page.getByText('充电器', { exact: true }).count(), 0);
  await context.setOffline(false);
  await page.getByLabel('用户名').fill('second');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByText('护照', { exact: true }).waitFor();
  await page.goto(`${origin}/settings`);
  await page.locator('.packing-cache time').waitFor();
  await context.setOffline(true);
  await page.goto(`${origin}/travel`);
  await page.getByText('护照', { exact: true }).waitFor();
  assert.equal(await page.getByText('充电器', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});
