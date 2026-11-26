import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { DEFAULT_HA_BASE } from '../adapters/home-assistant.js';
import { checkCapability, discoverModels } from '../adapters/model.js';
import { modelEndpoint } from '../../../shared/modelEndpoint.js';
import { readWeather, weatherCities } from '../adapters/weather.js';
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
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : current.modelBase;
    try { if (baseUrl) modelEndpoint(baseUrl); } catch { return c.json({ error: '请输入不含凭据和查询参数的 HTTP(S) 接口地址' }, 400); }
    await db.profile.update({
      where: { id: 'local' },
      data: {
        modelBase: baseUrl,
        modelName: typeof body.model === 'string' ? body.model.trim() : current.modelName,
        modelKey: baseUrl && typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : baseUrl === current.modelBase ? current.modelKey : '',
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/model/check', async (c) => {
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    const raw = await c.req.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return c.json({ error: 'invalid' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'invalid' }, 400);
    const capability = body.capability ?? 'text';
    if (!['list', 'text', 'image'].includes(capability)) return c.json({ error: 'invalid' }, 400);
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : profile.modelBase;
    try { modelEndpoint(baseUrl); } catch { return c.json({ error: '请填写有效的模型接口地址' }, 400); }
    const model = typeof body.model === 'string' ? body.model.trim() : profile.modelName;
    const apiKey = typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : baseUrl === profile.modelBase ? profile.modelKey : '';
    const config = { baseUrl, model, apiKey };
    try {
      if (capability === 'list') return c.json({ models: await discoverModels(config) });
      if (!model) return c.json({ error: '请选择或填写模型名称' }, 400);
      await checkCapability(config, capability);
      return c.json({ model, capability });
    } catch (error) {
      const detail = error instanceof Error && error.name === 'TimeoutError' ? '连接超时，请检查服务后重试' : '未收到预期的测试结果，请检查接口地址、凭据和模型能力';
      return c.json({ error: detail }, 502);
    }
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

  app.get('/api/weather/cities', (c) => c.json({ cities: weatherCities }));
  app.post('/api/weather/refresh', async (c) => {
    const previous = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const body = await c.req.json().catch(() => ({}));
    const city = body.city ?? previous.weatherCity;
    if (!weatherCities.includes(city) && !(city === '' && process.env.WEATHER_URL)) {
      return c.json({ error: '请选择天气城市' }, 400);
    }
    const weather = await readWeather(process.env.WEATHER_URL, city);
    const sameCity = previous.weatherCity === city && previous.weatherSource === weather.weatherSource;
    await db.sessionState.update({
      where: { id: 'local' },
      data: { ...weather, weatherCity: city, weatherUpdatedAt: weather.weatherUpdatedAt || (sameCity ? previous.weatherUpdatedAt : '') },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
