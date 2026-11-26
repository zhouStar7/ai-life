import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openReadOnly } from './queries.js';

const cwd = fileURLToPath(new URL('.', import.meta.url));

test('external SDK host discovers and calls exactly the three read-only tools', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ai-life-mcp-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'fixture.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE SessionState(id, weatherOn, weatherLabel);
    INSERT INTO SessionState VALUES ('local', 1, '10°C 雨');
    CREATE TABLE MemberState(memberId, suggestionIndex, activeTripId);
    INSERT INTO MemberState VALUES ('local', 0, 'trip'), ('other', 0, 'other-trip');
    CREATE TABLE WardrobeItem(id, memberId DEFAULT 'local', name, category, season, color, occasion, wears);
    INSERT INTO WardrobeItem (id,name,category,season,color,occasion,wears) VALUES ('shirt','衬衫','上衣','四季','白','通勤',1), ('pants','长裤','裤装','四季','黑','通勤',3), ('shoes','靴','鞋包','秋冬','黑','通勤',2), ('coat','风衣','外套','秋冬','蓝','通勤',0);
    INSERT INTO WardrobeItem VALUES ('other-shirt','other','hidden-sentinel','上衣','四季','白','通勤',0);
    CREATE TABLE Trip(id, memberId, title, packing, tickets);
    INSERT INTO Trip VALUES ('trip','local','杭州出差','[{"id":"p1","text":"充电器","done":true,"private":"hidden-sentinel"}]','hidden-sentinel'), ('other-trip','other','hidden-sentinel','[]','');
    CREATE TABLE Budget(memberId, totalCents, clothCents, foodCents, homeCents, tripCents);
    INSERT INTO Budget VALUES ('local', 100000, 10000, 20000, 30000, 40000), ('other', 5000, 1000, 1000, 1000, 2000);
    CREATE TABLE Expense(memberId, date, tag, amountCents, merchant);
    INSERT INTO Expense VALUES ('local','2026-09-02','食',1234,'hidden-sentinel'), ('local','2026-08-01','行',500,'hidden-sentinel'), ('other','2026-09-02','食',5000,'hidden-sentinel');
    CREATE TABLE Profile(modelKey, haToken);
    INSERT INTO Profile VALUES ('hidden-sentinel', 'hidden-sentinel');
  `);
  db.close();
  const before = readFileSync(filename);
  const readOnly = openReadOnly(filename);
  assert.throws(() => readOnly.exec('UPDATE Budget SET totalCents = 0'), /readonly/i);
  readOnly.close();
  const missing = path.join(directory, 'missing.sqlite');
  assert.throws(() => openReadOnly(missing));
  assert.equal(existsSync(missing), false);

  const host = new Client({ name: 'external-test-host', version: '1.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(cwd, 'start.mjs')], cwd: directory, env: { AI_LIFE_MCP_DB: filename, AI_LIFE_MODE: 'demo' }, stderr: 'pipe' });
  await host.connect(transport);
  try {
    const { tools } = await host.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['budget_summary', 'outfit_suggestion', 'packing_list']);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint && !tool.annotations.destructiveHint));
    async function call(name: string, args = {}) {
      const response = await host.callTool({ name, arguments: args });
      assert.ok(!response.isError);
      assert.doesNotMatch(JSON.stringify(response), /hidden-sentinel/);
      const [content] = response.content as { type: string; text: string }[];
      assert.equal(content.type, 'text');
      return JSON.parse(content.text);
    }
    assert.deepEqual((await call('outfit_suggestion')).itemIds, ['shirt','pants','shoes','coat']);
    assert.deepEqual(await call('packing_list'), { tripId: 'trip', title: '杭州出差', items: [{ text: '充电器', done: true }] });
    const summary = await call('budget_summary');
    assert.equal(summary.month, '2026-09');
    assert.equal(summary.byTag.食, 12.34);
    assert.equal(summary.remaining, 987.66);
    assert.equal((await call('budget_summary', { month: '2026-08' })).monthTotal, 5);
    for (const [name, args] of [['packing_list', { tripId: 'unknown' }], ['packing_list', { tripId: 'other-trip' }], ['budget_summary', { month: '2026-13' }], ['outfit_suggestion', { adopt: true }], ['update_budget', {}]] as const) {
      const response = await host.callTool({ name, arguments: args });
      assert.equal(response.isError, true);
    }
  } finally {
    await host.close();
  }
  assert.deepEqual(readFileSync(filename), before);
});
