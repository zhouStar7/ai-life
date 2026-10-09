import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './adapters/bills.js';
import { clothingFromModel } from './adapters/vision.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ai-life-p2-'));
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

const CSV = `微信支付账单明细
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2026-09-18 12:01:00,商户消费,优衣库,衬衫,支出,199.00,零钱,支付成功,,,秋季衬衫
2026-09-18 12:20:00,商户消费,美团外卖,牛肉面,支出,36.00,零钱,支付成功,,,午餐
2026-09-18 18:00:00,商户消费,国家电网,电费,支出,128.00,零钱,支付成功,,,
2026-09-18 19:00:00,商户消费,滴滴出行,打车,支出,42.00,零钱,支付成功,,,
2026-09-18 20:00:00,转账,公司,工资,收入,8000.00,零钱,已存入,,,
2026-09-18 21:00:00,商户消费,未知小店,杂项,支出,15.00,零钱,支付成功,,,
`;

test('style from the model lands on occasion, and a bad category is dropped', () => {
  const draft = clothingFromModel('{"name":"藏青大衣","category":"外套","color":"藏青","season":"冬","style":"正式"}');
  assert.equal(draft?.occasion, '正式');
  assert.equal(draft?.color, '藏青');
  assert.equal(draft?.category, '外套');
  assert.equal(clothingFromModel('{"name":"帽子","category":"帽子","color":"黑"}'), null);
});

test('csv keeps the four spend tags and drops income', () => {
  const rows = parseCsv(CSV);
  assert.deepEqual(rows.map((row) => row.tag), ['衣', '食', '住', '行', null]);
  assert.equal(rows[0].amount, 199);
  assert.equal(rows[0].date, '2026-09-18');
  assert.equal(parseCsv('日期,商户,金额,备注\n2026-09-03,面包店,12,早餐')[0].tag, '食');
});

test('photo recognition needs a model, then confirm writes category color and style', async () => {
  const missing = await json('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,aaaa' }) });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error, 'model_unavailable');
  const bad = await json('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image: 'not-an-image' }) });
  assert.equal(bad.status, 400);

  await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://model.local/v1', model: 'local', apiKey: 'secret' }) });
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('chat/completions')) {
      const payload = JSON.parse(String(init?.body));
      const asked = JSON.stringify(payload.messages);
      const content = asked.includes('衣服')
        ? '{"name":"藏青大衣","category":"外套","color":"藏青","season":"冬","style":"正式"}'
        : '{"rows":[]}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  };
  try {
    const recognized = await json('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,aaaa' }) });
    assert.equal(recognized.status, 200);
    assert.equal(recognized.body.category, '外套');
    assert.equal(recognized.body.color, '藏青');
    assert.equal(recognized.body.occasion, '正式');
    const saved = await json('/api/items', { method: 'POST', body: JSON.stringify(recognized.body) });
    assert.equal(saved.status, 200);
    assert.ok(saved.body.snapshot.items.some((item: { name: string; occasion: string }) => item.name === '藏青大衣' && item.occasion === '正式'));

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"name":"帽子","category":"帽子","color":"黑"}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return original(input, init);
    };
    const unreadable = await json('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,bbbb' }) });
    assert.equal(unreadable.status, 422);
    assert.equal(unreadable.body.error, 'unreadable');
  } finally {
    globalThis.fetch = original;
  }
});

test('csv import updates the month split that feeds the donut and budget', async () => {
  const before = await json('/api/spending/summary');
  const preview = await json('/api/bills/preview', { method: 'POST', body: JSON.stringify({ csv: CSV }) });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.rows.length, 5);
  const imported = await json('/api/bills/import', { method: 'POST', body: JSON.stringify({ rows: preview.body.rows }) });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, 4);
  const snap = imported.body.snapshot;
  assert.equal(snap.spending.byTag.衣, before.body.byTag.衣 + 199);
  assert.equal(snap.spending.byTag.食, before.body.byTag.食 + 36);
  assert.equal(snap.spending.byTag.住, before.body.byTag.住 + 128);
  assert.equal(snap.spending.byTag.行, before.body.byTag.行 + 42);
  assert.equal(snap.spending.monthTotal, before.body.monthTotal + 199 + 36 + 128 + 42);
  assert.equal(snap.expenses.filter((item: { merchant: string }) => item.merchant === '公司').length, 0);
  assert.equal(snap.expenses.filter((item: { merchant: string }) => item.merchant === '未知小店').length, 0);
  const budgets = await json('/api/budgets');
  assert.equal(snap.budgets.total, budgets.body.total);
  assert.equal(snap.spending.trend.at(-1).amount, snap.spending.monthTotal);
});

test('bill screenshot uses the model and skips income', async () => {
  const blocked = await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: '', model: '', apiKey: '' }) });
  assert.equal(blocked.body.snapshot.model.configured, false);
  const unavailable = await json('/api/bills/preview', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,cccc' }) });
  assert.equal(unavailable.status, 503);

  await json('/api/model', { method: 'PUT', body: JSON.stringify({ baseUrl: 'http://model.local/v1', model: 'local', apiKey: 'secret' }) });
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"rows":[{"date":"2026-09-21","merchant":"星巴克","amount":38,"note":"美式","tag":"食","direction":"支出"},{"date":"2026-09-21","merchant":"工资","amount":8000,"note":"","tag":"食","direction":"收入"}]}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  };
  try {
    const preview = await json('/api/bills/preview', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,cccc' }) });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.rows.length, 1);
    assert.equal(preview.body.rows[0].merchant, '星巴克');
    assert.equal(preview.body.rows[0].tag, '食');
    const imported = await json('/api/bills/import', { method: 'POST', body: JSON.stringify({ rows: preview.body.rows }) });
    assert.equal(imported.body.imported, 1);
    assert.ok(imported.body.snapshot.expenses.some((item: { merchant: string; amount: number }) => item.merchant === '星巴克' && item.amount === 38));
  } finally {
    globalThis.fetch = original;
  }
});
