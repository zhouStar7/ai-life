// Run in web/ with `npm run build && node --test tests/save-recovery.test.mjs`.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import test from 'node:test';

const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => path && existsSync(path));
const snapshot = {
  items: [], outfits: [], meals: [], recipes: [], devices: [], alerts: [], activeTripId: 't1', trips: [{ id: 't1', title: '测试行程', tickets: [], timeline: [], packing: [{ id: 'p1', text: '便携水杯', done: true }] }], expenses: [], adoptedTips: [],
  targets: { kcal: 1800, protein: 80, fat: 30, carb: 150 }, budgets: { total: 100, 衣: 25, 食: 25, 住: 25, 行: 25 }, notices: {},
  model: { baseUrl: '', model: '', configured: false }, suggestionIndex: 0, weatherOn: false,
};

test('personal writes retain fields, reconcile before retry, survive reload, and display cached data offline', { skip: !chrome && 'Set CHROME_BIN to a Chromium executable' }, async (t) => {
  const dist = resolve(import.meta.dirname, '../dist');
  const index = await readFile(join(dist, 'index.html'), 'utf8');
  let phase = 'write';
  const writes = [];
  const requests = [];
  const keys = [];
  const cacheSession = 'a'.repeat(64);
  const server = createServer(async (req, res) => {
    if (req.url === '/api/auth/session') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `ailife-context=${cacheSession}; Path=/` });
      return res.end(JSON.stringify({ demo: false, member: { id: 'local', username: 'tester', name: '测试', isOwner: true }, needsSetup: false, cacheSession }));
    }
    if (req.url === '/api/snapshot') {
      requests.push('read');
      res.writeHead(phase === 'cached' ? 503 : 200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(snapshot));
    }
    if (req.url === '/api/items') {
      const body = [];
      for await (const bytes of req) body.push(bytes);
      writes.push(JSON.parse(Buffer.concat(body)));
      keys.push(req.headers['idempotency-key']);
      requests.push('write');
      if (writes.length === 2) {
        // Send response headers first so Chrome observes a lost response body.
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1024' });
        res.write('{"snapshot":', () => res.destroy());
        return;
      }
      if (writes.length === 3) snapshot.items.push({ ...writes.at(-1), id: 'item1', wears: 0 });
      res.writeHead(writes.length === 1 ? 422 : 200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(writes.length === 1 ? { detail: '颜色需要确认' } : { snapshot }));
    }
    if (req.url.startsWith('/assets/') && /^\/assets\/[\w.-]+$/.test(req.url)) {
      res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'text/javascript' });
      return res.end(await readFile(join(dist, req.url)));
    }
    if (req.url !== '/wardrobe') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(index);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(`http://127.0.0.1:${server.address().port}/wardrobe`);
  await page.getByText('正在连接本地服务…').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '添加单品' }).first().click();
  const dialog = page.getByRole('dialog');
  const inputs = dialog.locator('input[required]');
  await inputs.nth(0).fill('断线测试夹克');
  await inputs.nth(1).fill('绿色');
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await save.click();
  await dialog.getByText(/颜色需要确认/).waitFor();
  await save.click();
  await dialog.getByText(/结果待确认/).waitFor();
  assert.equal(await inputs.nth(0).inputValue(), '断线测试夹克');
  assert.equal(await inputs.nth(1).inputValue(), '绿色');
  await save.click();
  await dialog.getByRole('button', { name: '重新连接并刷新记录' }).click();
  await dialog.getByText(/已刷新记录/).waitFor();
  assert.equal(await page.locator('.item-grid').count(), 0);
  await save.click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.item-grid').getByText('断线测试夹克').waitFor();
  phase = 'readback';
  await page.reload();
  await page.locator('.item-grid').getByText('断线测试夹克').waitFor();
  phase = 'cached';
  await page.reload();
  await page.getByRole('heading', { name: '离线打包清单' }).waitFor();
  await page.getByText('便携水杯', { exact: true }).waitFor();
  assert.equal(await page.getByText('断线测试夹克').count(), 0);
  assert.deepEqual(writes[0], writes[2]);
  assert.match(keys[0], /^[a-f0-9]{32}$/);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
  assert.deepEqual(requests.slice(requests.indexOf('write')), ['write', 'write', 'read', 'write', 'read', 'read']);
});
