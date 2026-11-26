import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readJson } from '../ids.js';
import { applyNamedScene, bindScene, syncHome, toggleDevice } from '../homeLink.js';
import { SEED_DEVICES } from '../seedData.js';
import { memberOf } from '../auth.js';
import { readMutationSnapshot, readSnapshot } from '../snapshot.js';

const SCENES = ['回家', '离家', '睡眠', '影院'];

export function registerHome(app: Hono, db: PrismaClient) {
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
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/home/sync', async (c) => {
    const error = await syncHome(db);
    return c.json({ snapshot: await readMutationSnapshot(db, c), ...(error ? { error } : {}) });
  });

  app.post('/api/devices/:id/toggle', async (c) => {
    const error = await toggleDevice(db, c.req.param('id'));
    return c.json({ snapshot: await readMutationSnapshot(db, c), ...(error ? { error } : {}) });
  });

  app.delete('/api/devices/:id', async (c) => {
    await db.device.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/home/scenes/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({} as { target?: unknown }));
    const target = typeof body.target === 'string' ? body.target : '';
    const error = await bindScene(db, name, target);
    if (error) return c.json({ error }, 400);
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/scenes/:name', async (c) => {
    const name = c.req.param('name');
    if (!SCENES.includes(name)) return c.json({ error: 'invalid' }, 400);
    const scene = await applyNamedScene(db, name);
    return c.json({ snapshot: await readMutationSnapshot(db, c), scene });
  });

  app.post('/api/alerts/:id/handle', async (c) => {
    const id = c.req.param('id');
    await db.alert.update({ where: { id }, data: { handled: true } });
    if (id === 'a-filter') {
      const memberId = memberOf(c);
      const state = await db.memberState.findUniqueOrThrow({ where: { memberId } });
      const tips = readJson<string[]>(state.adoptedTips, []);
      if (!tips.includes('filter')) tips.push('filter');
      await db.memberState.update({ where: { memberId }, data: { adoptedTips: JSON.stringify(tips) } });
    }
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });
}
