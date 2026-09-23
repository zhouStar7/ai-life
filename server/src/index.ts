import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(dataDir, 'ai-life.sqlite')}`;
}

const db = new PrismaClient();
await seedIfEmpty(db);
const port = Number(process.env.PORT || 8787);
const hostname = process.env.HOST || '127.0.0.1';
serve({ fetch: createApp(db).fetch, port, hostname }, () => {
  console.log(`ai-life api http://${hostname}:${port}`);
});
