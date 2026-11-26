import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { configureDatabase } from './databaseEnvironment.js';
import { secureLegacyCredentials } from './auth.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const mode = configureDatabase();
const db = new PrismaClient();
await seedIfEmpty(db, mode);
if (mode === 'personal' && await secureLegacyCredentials(db, process.env.AI_LIFE_LEGACY_PASSWORD) === 'required') {
  console.warn('The legacy owner password requires replacement. Set AI_LIFE_LEGACY_PASSWORD and restart the personal server.');
}
const port = Number(process.env.PORT || 8787);
const hostname = process.env.HOST || '127.0.0.1';
const app = createApp(db, {
  auth: mode === 'personal',
  demo: mode === 'demo',
  shortcutToken: mode === 'personal' ? process.env.AI_LIFE_SHORTCUT_TOKEN : undefined,
});
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`ai-life api http://${hostname}:${port}`);
});
