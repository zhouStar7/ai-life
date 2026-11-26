import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const script = fileURLToPath(new URL('./database.mjs', import.meta.url));
const privateValue = 'synthetic-private-profile-field';

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(privateValue), 'CLI disclosed fixture contents');
  return result;
}

function temporaryDirectory(t) {
  const root = tmpdir();
  const dir = mkdtempSync(join(root, 'ai-life-db-test-'));
  t.after(() => {
    assert.equal(dirname(dir), root);
    assert.ok(dir.startsWith(join(root, 'ai-life-db-test-')));
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function createFixture(path, count) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE Profile(modelKey TEXT)');
  db.prepare('INSERT INTO Profile VALUES (?)').run(privateValue);
  for (const table of ['Expense', 'WardrobeItem', 'Trip']) {
    db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY)`);
    for (let i = 0; i < count; i++) db.exec(`INSERT INTO ${table} DEFAULT VALUES`);
  }
  return db;
}

function checkFixture(path, count) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.ok(db.prepare('SELECT modelKey FROM Profile').get().modelKey === privateValue);
    for (const table of ['Expense', 'WardrobeItem', 'Trip']) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, count);
    }
  } finally {
    db.close();
  }
}

test('online WAL backup, new restore, replacement and rollback preserve committed rows', (t) => {
  const dir = temporaryDirectory(t);
  const source = join(dir, 'old.db');
  const backup = join(dir, 'backup.db');
  const target = join(dir, 'personal.db');
  const writer = createFixture(source, 3);
  try {
    writer.exec('BEGIN; INSERT INTO Expense DEFAULT VALUES');
    const result = run('backup', source, backup);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"Expense":3,"WardrobeItem":3,"Trip":3/);
  } finally {
    writer.close();
  }
  checkFixture(backup, 3);
  assert.equal(statSync(backup).mode & 0o777, 0o600);
  assert.equal(run('backup', source, backup).status, 1);
  assert.equal(run('restore', backup, target).status, 0);
  checkFixture(target, 3);

  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode=WAL; DELETE FROM Expense; DELETE FROM WardrobeItem; DELETE FROM Trip');
  db.close();
  assert.equal(run('restore', backup, target).status, 1);
  checkFixture(target, 0);
  const replace = run('restore', backup, target, '--replace');
  assert.equal(replace.status, 0, replace.stderr);
  checkFixture(target, 3);
  const rollback = join(dir, readdirSync(dir).find((f) => f.startsWith('personal.db.rollback-')));
  checkFixture(rollback, 0);
  assert.equal(statSync(rollback).mode & 0o777, 0o600);
  assert.equal(run('restore', rollback, target, '--replace').status, 0);
  checkFixture(target, 0);
});

test('a blocked replacement keeps the old database and its rollback copy', (t) => {
  const dir = temporaryDirectory(t);
  const source = join(dir, 'source.db');
  const target = join(dir, 'target.db');
  createFixture(source, 3).close();
  const writer = createFixture(target, 1);
  try {
    writer.exec('BEGIN IMMEDIATE');
    assert.equal(run('restore', source, target, '--replace').status, 1);
    const rollback = readdirSync(dir).find((file) => file.startsWith('target.db.rollback-'));
    assert.ok(rollback);
    checkFixture(join(dir, rollback), 1);
  } finally {
    writer.close();
  }
  checkFixture(target, 1);
});

test('invalid sources, conflicting paths and stale sidecars leave existing files intact', (t) => {
  const dir = temporaryDirectory(t);
  const target = join(dir, 'existing.db');
  const corrupt = join(dir, 'invalid.db');
  const fresh = join(dir, 'fresh.db');
  createFixture(target, 2).close();
  writeFileSync(corrupt, privateValue);
  assert.equal(run('restore', corrupt, target, '--replace').status, 1);
  assert.equal(run('restore', target, target, '--replace').status, 1);
  assert.equal(run('backup', join(dir, 'missing.db'), fresh).status, 1);
  assert.equal(run('restore', target, fresh + '-wal').status, 1);
  writeFileSync(fresh + '-wal', 'orphaned fixture');
  assert.equal(run('restore', target, fresh).status, 1);
  assert.equal(readFileSync(fresh + '-wal', 'utf8'), 'orphaned fixture');
  assert.deepEqual(readdirSync(dir).sort(), ['existing.db', 'fresh.db-wal', 'invalid.db']);
  checkFixture(target, 2);
});
