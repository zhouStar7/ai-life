import { Hono } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { contextualDb, requestContext } from './requestContext.js';
import { mutations } from './mutations.js';
import { memberFromRequest } from './auth.js';
import { registerAgent } from './routes/agent.js';
import { registerAuth } from './routes/auth.js';
import { registerDiet } from './routes/diet.js';
import { registerHome } from './routes/home.js';
import { registerSearch } from './routes/search.js';
import { registerSettings } from './routes/settings.js';
import { registerSnapshot } from './routes/snapshot.js';
import { registerSpending } from './routes/spending.js';
import { registerTravel } from './routes/travel.js';
import { registerWardrobe } from './routes/wardrobe.js';

const OPEN = new Set(['POST /api/auth/login', 'POST /api/auth/register', 'POST /api/auth/logout', 'GET /api/auth/session']);

export function createApp(rawDb: PrismaClient) {
  const db = contextualDb(rawDb);
  const app = new Hono();
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'server' }, 500);
  });
  app.use('/api/*', (c, next) => requestContext.run({ compact: c.req.header('x-client-version') === '2' }, next));
  app.use('/api/*', async (c, next) => {
    if (OPEN.has(`${c.req.method} ${c.req.path}`)) return next();
    const member = await memberFromRequest(db, c);
    if (!member) return c.json({ error: 'unauthorized' }, 401);
    const setMemberId = c.set as unknown as (key: 'memberId', value: string) => void;
    setMemberId('memberId', member.id);
    return next();
  });
  app.use('/api/*', mutations(rawDb));
  registerAuth(app, db);
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
