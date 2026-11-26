import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { configureDatabase } from './databaseEnvironment.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const mode = configureDatabase();
const db = new PrismaClient();
await seedIfEmpty(db, mode);
const port = Number(process.env.PORT || 8787);
const hostname = process.env.HOST || '127.0.0.1';
const app = createApp(db, { shortcutToken: mode === 'personal' ? process.env.AI_LIFE_SHORTCUT_TOKEN : undefined });
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`ai-life api http://${hostname}:${port}`);
});
