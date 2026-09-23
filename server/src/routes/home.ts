import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readJson } from '../ids.js';
import { nextDevice } from '../scenes.js';
import { SEED_DEVICES } from '../seedData.js';
import { readSnapshot } from '../snapshot.js';

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
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/devices/:id/toggle', async (c) => {
    const device = await db.device.findUnique({ where: { id: c.req.param('id') } });
    if (!device || device.offline) return c.json({ snapshot: await readSnapshot(db) });
    await db.device.update({ where: { id: device.id }, data: { on: !device.on } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/devices/:id', async (c) => {
    await db.device.delete({ where: { id: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/scenes/:name', async (c) => {
    const name = c.req.param('name');
    if (!SCENES.includes(name)) return c.json({ error: 'invalid' }, 400);
    const devices = await db.device.findMany();
    for (const device of devices) {
      const next = nextDevice(device, name);
      await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
    }
    await db.sessionState.update({ where: { id: 'local' }, data: { activeScene: name } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/alerts/:id/handle', async (c) => {
    const id = c.req.param('id');
    await db.alert.update({ where: { id }, data: { handled: true } });
    if (id === 'a-filter') {
      const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
      const tips = readJson<string[]>(session.adoptedTips, []);
      if (!tips.includes('filter')) tips.push('filter');
      await db.sessionState.update({ where: { id: 'local' }, data: { adoptedTips: JSON.stringify(tips) } });
    }
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
