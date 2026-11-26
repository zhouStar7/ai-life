import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Prisma, type PrismaClient } from '@prisma/client';
import { accountOwnerId, isAccountOwner, PasswordBusyError, sessionFromRequest } from './auth.js';
import { mutations } from './mutations.js';
import { contextualDb, requestContext } from './requestContext.js';
import { registerAuth } from './routes/auth.js';
import { registerAgent } from './routes/agent.js';
import { registerDiet } from './routes/diet.js';
import { registerQuickMeal } from './routes/quickMeal.js';
import { registerHome } from './routes/home.js';
import { registerSearch } from './routes/search.js';
import { registerSettings } from './routes/settings.js';
import { registerSnapshot } from './routes/snapshot.js';
import { registerSpending } from './routes/spending.js';
import { registerTravel } from './routes/travel.js';
import { registerWardrobe } from './routes/wardrobe.js';

const publicAuth = new Set([
  'GET /api/auth/session', 'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout',
]);

function ownerOnly(method: string, path: string) {
  return (method === 'PUT' && (path === '/api/model' || path === '/api/home'))
    || (method === 'POST' && (path === '/api/model/check' || path === '/api/devices/bind-sample' || /^\/api\/home\/scenes\/[^/]+$/.test(path)))
    || (method === 'DELETE' && /^\/api\/devices\/[^/]+$/.test(path));
}

export function createApp(rawDb: PrismaClient, options: { auth?: boolean; demo?: boolean; shortcutToken?: string } = {}) {
  const db = contextualDb(rawDb);
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof PasswordBusyError) {
      c.header('Retry-After', '1');
      return c.json({ error: 'busy' }, 429);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return c.json({ error: 'missing' }, 404);
    }
    console.error(error);
    return c.json({ error: 'server' }, 500);
  });
  app.get('/api/health', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'no-store' }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const { method, path } = c.req;
    if (!options.auth || publicAuth.has(`${method} ${path}`)) {
      return requestContext.run({ memberId: 'local' }, next);
    }
    if (method === 'POST' && path === '/api/shortcuts/meal-drafts') {
      return requestContext.run({ memberId: await accountOwnerId(rawDb) }, next);
    }
    const session = await sessionFromRequest(rawDb, c);
    const expected = c.req.header('x-account-session');
    if (!session || (expected && expected !== session.hint)) return c.json({ error: 'unauthorized' }, 401);
    const memberId = session.member.id;
    const managesShortcutDraft = /^\/api\/meals\/shortcut-drafts(?:\/[^/]+)?$/.test(path);
    if ((managesShortcutDraft || ownerOnly(method, path)) && !await isAccountOwner(rawDb, memberId)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    return requestContext.run({ memberId }, next);
  });
  app.use('/api/*', mutations(rawDb));
  registerAuth(app, rawDb, options.auth === true);
  registerSnapshot(app, db);
  registerWardrobe(app, db);
  registerDiet(app, db);
  registerQuickMeal(app, db, options.shortcutToken);
  registerHome(app, db);
  registerTravel(app, db);
  registerSpending(app, db);
  registerSearch(app, db);
  registerSettings(app, db);
  registerAgent(app, db, options.demo === true);
  return app;
}
