import { Hono } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { registerAgent } from './routes/agent.js';
import { registerDiet } from './routes/diet.js';
import { registerHome } from './routes/home.js';
import { registerSearch } from './routes/search.js';
import { registerSettings } from './routes/settings.js';
import { registerSnapshot } from './routes/snapshot.js';
import { registerSpending } from './routes/spending.js';
import { registerTravel } from './routes/travel.js';
import { registerWardrobe } from './routes/wardrobe.js';

export function createApp(db: PrismaClient) {
  const app = new Hono();
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'server' }, 500);
  });
  registerSnapshot(app, db);
  registerWardrobe(app, db);
  registerDiet(app, db);
  registerHome(app, db);
  registerTravel(app, db);
  registerSpending(app, db);
  registerSearch(app, db);
  registerSettings(app, db);
  registerAgent(app, db);
  return app;
}
