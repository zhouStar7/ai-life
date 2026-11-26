import type { PrismaClient } from '@prisma/client';
import type { Context, Hono } from 'hono';
import { readJson } from '../ids.js';
import { bindScene, syncHome } from '../homeLink.js';
import { homeActions, type HomeTarget } from '../homeActions.js';
import { SEED_DEVICES } from '../seedData.js';
import { readSnapshot } from '../snapshot.js';
import { currentMemberId } from '../requestContext.js';

const SCENES = ['回家', '离家', '睡眠', '影院'];

export function registerHome(app: Hono, db: PrismaClient) {
  const run = homeActions(db);
  async function control(c: Context, target: HomeTarget) {
    const body = await c.req.json().catch(() => ({}));
    const result = await run(target, body?.confirmation);
    if (result.error) return c.json(result, 409);
    if (result.preview) return c.json(result);
    return c.json({ ...result, snapshot: await readSnapshot(db) });
  }
  app.post('/api/devices/bind-sample', async (c) => {
    const existing = new Set((await db.device.findMany()).map((device) => device.id));
    const missing = SEED_DEVICES.filter((device) => !existing.has(device.id));
    if (missing.length > 0) {
      await db.device.createMany({
        data: missing.map((device) => ({
          ...device,
          paramLabel: device.paramLabel ?? null,
          paramValue: device.paramValue ?? null,
          offline: Boolean(device.offline),
        })),
      });
    }
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/home/sync', async (c) => {
    const error = await syncHome(db);
    return c.json({ snapshot: await readSnapshot(db), ...(error ? { error } : {}) });
  });

  app.post('/api/devices/:id/toggle', async (c) => {
    return control(c, { device: c.req.param('id') });
  });

  app.delete('/api/devices/:id', async (c) => {
    await db.device.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/home/scenes/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({} as { target?: unknown }));
    const target = typeof body.target === 'string' ? body.target : '';
    const error = await bindScene(db, name, target);
    if (error) return c.json({ error }, 400);
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/scenes/:name', async (c) => {
    const name = c.req.param('name');
    if (!SCENES.includes(name)) return c.json({ error: 'invalid' }, 400);
    return control(c, { scene: name });
  });

  app.post('/api/alerts/:id/handle', async (c) => {
    const id = c.req.param('id');
    await db.$transaction(async (tx) => {
      await tx.alert.update({ where: { id }, data: { handled: true } });
      if (id === 'a-filter') {
        const where = { memberId: currentMemberId() };
        const state = await tx.memberState.findUniqueOrThrow({ where });
        const tips = readJson<string[]>(state.adoptedTips, []);
        if (!tips.includes('filter')) {
          await tx.memberState.update({ where, data: { adoptedTips: JSON.stringify([...tips, 'filter']) } });
        }
      }
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
