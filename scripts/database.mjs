import { randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const usage = `Usage:
  node scripts/database.mjs backup <source-db> <new-backup>
  node scripts/database.mjs restore <backup-db> <target-db> [--replace]
Stop services using the target before restoring. An existing target requires --replace
and a verified rollback copy is retained beside it. Backups contain private data.`;

class CliError extends Error {}

async function entry(path) {
  return lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}

async function copyDatabase(source, destination) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, destination);
  } finally {
    db.close();
  }
}

// Inspect the completed copy, so counts and integrity describe the same snapshot
// even when the source database receives more commits during an online backup.
function validateSnapshot(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE');
    const check = db.prepare('PRAGMA integrity_check(1)').get();
    if (check.integrity_check !== 'ok') throw new CliError('SQLite integrity check failed.');
    const counts = {};
    for (const table of ['Expense', 'WardrobeItem', 'Trip']) {
      if (!db.prepare("SELECT 1 FROM pragma_table_list WHERE schema='main' AND name=? AND type='table'").get(table)) {
        throw new CliError('The database is missing an expected AI Life table.');
      }
      counts[table] = db.prepare(`SELECT count(*) AS n FROM main."${table}"`).get().n;
    }
    return counts;
  } finally {
    db.close();
  }
}

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(usage);
  const [action, input, output, flag] = args;
  const replace = action === 'restore' && flag === '--replace';
  if (!['backup', 'restore'].includes(action) || !input || !output || args.length !== (replace ? 4 : 3)) {
    throw new CliError(usage);
  }
  const source = resolve(input);
  const target = resolve(output);
  if (/(?:-wal|-shm|-journal)$/i.test(target)) throw new CliError('Choose a database path outside SQLite sidecars.');
  const original = await stat(source);
  if (!original.isFile()) throw new CliError('Source must be a database file.');
  const existing = await entry(target);
  if (existing) {
    if (!replace) throw new CliError('Destination already exists. Choose a new path or use restore with --replace.');
    if (!existing.isFile() || existing.nlink !== 1 || (original.dev === existing.dev && original.ino === existing.ino)) {
      throw new CliError('Choose a separate regular database file as the target.');
    }
  } else {
    for (const suffix of ['-wal', '-shm', '-journal']) {
      if (await entry(target + suffix)) throw new CliError('Destination has SQLite sidecars. Choose a clean path.');
    }
  }

  const parent = dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(parent, '.ai-life-db-'));
  try {
    const staged = join(temporary, 'snapshot.db');
    await copyDatabase(source, staged);
    const counts = validateSnapshot(staged);
    if (existing) {
      const previous = join(temporary, 'previous.db');
      await copyDatabase(target, previous);
      validateSnapshot(previous);
      const rollback = `${target}.rollback-${randomUUID()}.db`;
      await link(previous, rollback);
      console.log(`Rollback copy: ${JSON.stringify(rollback)}`);
      await chmod(target, 0o600);
      // SQLite updates the existing destination transactionally, including WAL
      // bookkeeping. Renaming a file over a WAL database can replay stale pages.
      await copyDatabase(staged, target);
    } else {
      // Publish only a complete snapshot, without overwriting concurrent output.
      await link(staged, target);
    }
    console.log(`${action === 'backup' ? 'Backup' : 'Restore'} complete. ${JSON.stringify(counts)}`);
  } finally {
    // This directory is returned by mkdtemp above, in the destination directory.
    if (dirname(temporary) === parent && temporary.startsWith(join(parent, '.ai-life-db-'))) {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

process.umask(0o077);
main(process.argv.slice(2)).catch((error) => {
  // SQLite errors may embed schema or record contents. Keep diagnostics private.
  console.error(error instanceof CliError ? error.message : 'Database operation failed. Check file paths, permissions, free space and database locks.');
  process.exitCode = 1;
});
