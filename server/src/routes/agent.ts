import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { complete } from '../adapters/model.js';
import { readJson } from '../ids.js';
import { adopt } from '../agent/adopt.js';
import { parseActions } from '../agent/actions.js';
import { buildContext, contextText } from '../agent/context.js';
import { planFromModel } from '../agent/planner.js';

export function registerAgent(app: Hono, db: PrismaClient) {
  app.post('/api/agent/arrange', async (c) => {
    const body = await c.req.json();
    const text = String(body.text ?? '').trim();
    if (!text) return c.json({ error: 'empty' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const tips = readJson<string[]>(session.adoptedTips, []);
    try {
      const summary = contextText(await buildContext(db));
      const content = await complete(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        [
          {
            role: 'system',
            content: '你是生活管家。只返回 JSON：{"title":"","lines":[""],"href":"/","actions":[]}。actions 只能是 adopt_outfit、add_meal、apply_scene、append_packing、add_expense、handle_alert。标签只能是衣食住行。若用户说降温下雨并去技术交流会，actions 必须同时包含穿搭、一条午餐、离家、北京行程行李和一笔「行」支出。',
          },
          { role: 'user', content: `${summary}\n\n用户说：${text}` },
        ],
      );
      return c.json(planFromModel(text, content, tips));
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.post('/api/agent/adopt', async (c) => {
    const body = await c.req.json();
    const actions = parseActions(body.actions);
    const snapshot = await adopt(db, typeof body.key === 'string' ? body.key : undefined, actions);
    return c.json({ snapshot });
  });
}
