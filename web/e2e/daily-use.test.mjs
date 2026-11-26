import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:1117';
test('personal workspace daily use in Chrome', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-life-browser-'));
  const shortcutToken = randomBytes(32).toString('base64url');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: new URL('../../', import.meta.url), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, DATABASE_URL: `file:${join(dir, 'browser.sqlite')}`,
      AI_LIFE_SHORTCUT_TOKEN: shortcutToken, TZ: 'Asia/Shanghai',
    },
  });
  const stopped = once(child, 'exit');
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGTERM');
    await stopped;
  });
  const deadline = Date.now() + 60000;
  // Wait for this launcher before contacting a port another instance may already own.
  while (!log.includes('Local:') || !await fetch(origin).then((r) => r.ok, () => false)) {
    assert.equal(child.exitCode, null, log);
    assert.ok(Date.now() < deadline, log);
    await delay(100);
  }
  const browser = await chromium.launch({ channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, timezoneId: 'Asia/Shanghai' });
  page.setDefaultTimeout(8000);
  const snapshot = async () => (await fetch(`${origin}/api/snapshot`)).json();
  await t.test('a failed meal write preserves input and a retry persists once', async () => {
    await page.goto(`${origin}/diet`);
    await page.getByTestId('add-meal').click();
    const editor = page.getByRole('dialog', { name: '确认餐次' });
    const mealName = editor.getByLabel('吃了什么', { exact: true });
    await mealName.fill('自动回归青菜面');
    const path = '**/api/meals';
    await page.route(path, (route) => route.abort());
    const submit = editor.getByRole('button', { name: '确认入账' });
    await Promise.all([page.waitForEvent('requestfailed', (req) => req.url().endsWith('/api/meals')), submit.click()]);
    assert.equal(await mealName.inputValue(), '自动回归青菜面');
    assert.equal((await snapshot()).meals.length, 0);
    await page.unroute(path);
    await editor.getByRole('button', { name: '重新连接并刷新记录' }).click();
    await editor.getByText(/已刷新记录/).waitFor();
    await submit.click();
    await submit.waitFor({ state: 'detached' });
    await page.reload();
    await page.getByText('午餐 · 自动回归青菜面', { exact: true }).waitFor();
    assert.equal((await snapshot()).meals.length, 1);
  });
  await t.test('a shortcut queues one editable draft and the browser explicitly saves it', async () => {
    const url = `${origin}/api/shortcuts/meal-drafts`;
    const headers = {
      'content-type': 'application/json', authorization: `Bearer ${shortcutToken}`,
      'idempotency-key': 'shortcut-smoke-001',
    };
    const body = JSON.stringify({ text: '午餐一碗牛肉面', date: '2026-01-31' });
    const submitDraft = () => fetch(url, { method: 'POST', headers, body });
    assert.equal((await fetch(url, { method: 'POST', body })).status, 401);
    const first = await submitDraft();
    assert.equal(first.status, 200);
    const draft = await first.json();
    assert.deepEqual(await (await submitDraft()).json(), draft);
    assert.equal((await snapshot()).meals.length, 1);

    await page.goto(`${origin}/diet`);
    await page.getByRole('button', { name: '核对餐次' }).click();
    const editor = page.getByRole('dialog', { name: '确认餐次' });
    await editor.getByLabel('吃了什么', { exact: true }).fill('快捷指令牛肉面');
    await editor.getByRole('button', { name: '确认入账' }).click();
    await page.getByText('午餐 · 快捷指令牛肉面', { exact: true }).waitFor();
    const saved = (await snapshot()).meals.filter((meal) => meal.name === '快捷指令牛肉面');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].date, '2026-01-31');
    assert.deepEqual(await (await submitDraft()).json(), { id: draft.id, status: 'saved' });
  });
  await t.test('a CSV preserves the transaction date and cents', async () => {
    await page.goto(`${origin}/spending?month=2026-01`);
    const csv = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号\n2026-01-31 12:20:00,商户消费,面馆,午餐,支出,12.34,零钱,支付成功,SMOKE01';
    const receipt = page.getByRole('dialog', { name: '导入回执' });
    async function importFile() {
      await page.getByTestId('import-bills').click();
      await page.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.getByTestId('confirm-import').click();
    }
    await importFile();
    await receipt.getByText(/新增 1 笔/).waitFor();
    await receipt.getByRole('button', { name: '完成' }).click();
    await importFile();
    await receipt.getByText(/新增 0 笔/).waitFor();
    await receipt.getByText(/重复 1 笔/).waitFor();
    await page.reload();
    await page.getByText('面馆', { exact: true }).first().waitFor();
    const [row] = (await snapshot()).expenses;
    assert.equal(row.amount, 12.34);
    assert.equal(row.date, '2026-01-31');
  });
  await t.test('a train message is previewed before saving a packing list', async () => {
    await page.goto(`${origin}/travel`);
    await page.getByRole('button', { name: '粘贴行程' }).first().click();
    await page.locator('textarea').fill('【铁路12306】您已购2026年12月2日08:00上海虹桥至北京南G12次列车车票。');
    await page.getByRole('button', { name: '生成', exact: true }).click();
    assert.equal((await snapshot()).trips.length, 0);
    await page.getByRole('button', { name: '写入行程' }).click();
    await page.getByRole('heading', { name: '行李清单' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: '行李清单' }).waitFor();
    const [trip] = (await snapshot()).trips;
    assert.ok(trip.timeline.length && trip.packing.length);
  });
});
