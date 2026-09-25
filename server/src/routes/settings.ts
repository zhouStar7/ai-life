import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { DEFAULT_HA_BASE } from '../adapters/home-assistant.js';
import { readWeather } from '../adapters/weather.js';
import { readSnapshot } from '../snapshot.js';

export function registerSettings(app: Hono, db: PrismaClient) {
  app.put('/api/notices', async (c) => {
    const body = await c.req.json();
    const current = await db.notice.findUniqueOrThrow({ where: { id: 'local' } });
    await db.notice.update({
      where: { id: 'local' },
      data: {
        outfit: typeof body.outfit === 'boolean' ? body.outfit : current.outfit,
        budget: typeof body.budget === 'boolean' ? body.budget : current.budget,
        device: typeof body.device === 'boolean' ? body.device : current.device,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.put('/api/model', async (c) => {
    const body = await c.req.json();
    const current = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    await db.profile.update({
      where: { id: 'local' },
      data: {
        modelBase: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : current.modelBase,
        modelName: typeof body.model === 'string' ? body.model.trim() : current.modelName,
        modelKey: typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : current.modelKey,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.put('/api/home', async (c) => {
    const body = await c.req.json();
    const current = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    const haBase = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : current.haBase;
    const haToken = typeof body.token === 'string' && body.token ? body.token : current.haToken;
    await db.profile.update({ where: { id: 'local' }, data: { haBase: haBase || DEFAULT_HA_BASE, haToken } });
    if (haBase !== current.haBase || (typeof body.token === 'string' && body.token)) {
      await db.sessionState.update({ where: { id: 'local' }, data: { haConnected: false, haScenes: '{}' } });
    }
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/weather/refresh', async (c) => {
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    const weather = await readWeather(process.env.WEATHER_URL || undefined);
    await db.sessionState.update({
      where: { id: 'local' },
      data: { weatherOn: weather.weatherOn, weatherLabel: weather.weatherLabel },
    });
    return c.json({ snapshot: await readSnapshot(db), profile: profile.name });
  });
}
