import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { complete } from '../adapters/model.js';
import { readJson } from '../ids.js';
import { adopt } from '../agent/adopt.js';
import { crossActions, parseActions } from '../agent/actions.js';
import { buildContext, contextText } from '../agent/context.js';
import { planFromModel } from '../agent/planner.js';
import { currentMemberId } from '../requestContext.js';

export function registerAgent(app: Hono, db: PrismaClient, demo = false) {
  app.post('/api/agent/arrange', async (c) => {
    const body = await c.req.json();
    const text = String(body.text ?? '').trim();
    if (!text) return c.json({ error: 'empty' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    const state = await db.memberState.findUniqueOrThrow({ where: { memberId: currentMemberId() } });
    const tips = readJson<string[]>(state.adoptedTips, []);
    try {
      const summary = contextText(await buildContext(db));
      const content = await complete(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        [
          {
            role: 'system',
            content: '你是生活管家。只返回 JSON：{"title":"","lines":[""],"href":"/","actions":[]}。可用动作有 adopt_outfit、add_meal、apply_scene、append_packing、add_expense、handle_alert。支出标签为衣食住行。只引用已知的记录 ID，只有用户提供金额时才建议记账。家居场景需要去家居页单独确认。',
          },
          { role: 'user', content: `${summary}\n\n用户说：${text}` },
        ],
      );
      return c.json(planFromModel(text, content, tips, demo));
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.post('/api/agent/adopt', async (c) => {
    const body = await c.req.json();
    if (body.actions !== undefined && !Array.isArray(body.actions)) return c.json({ error: 'invalid_actions' }, 400);
    const key = typeof body.key === 'string' ? body.key : undefined;
    const actions = body.actions === undefined
      ? demo && key === 'cross' ? crossActions() : undefined
      : parseActions(body.actions);
    return c.json(await adopt(db, key, actions, demo));
  });
}
