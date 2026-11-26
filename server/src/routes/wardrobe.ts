import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { suggestOutfit } from '../adapters/outfit.js';
import { recognizeClothing } from '../adapters/vision.js';
import { storePhoto, photoValue } from '../photos.js';
import { todayIso } from '../calendar.js';
import { uid } from '../ids.js';
import { toCents } from '../money.js';
import { memberOf } from '../auth.js';
import { readMutationSnapshot, readSnapshot } from '../snapshot.js';
import { blankDraft, draftsFromOrder } from '../wardrobePlan.js';

const CATEGORIES = ['上衣', '裤装', '裙装', '外套', '鞋包'];
type ItemBody = { name?: string; category?: string; color?: string; season?: string; occasion?: string; cover?: unknown; price?: unknown };

function validPrice(value: unknown) {
  if (value === undefined || value === null) return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 21_474_836.47
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

async function itemData(db: PrismaClient, body: ItemBody) {
  return {
    name: String(body.name).trim(),
    category: body.category,
    season: body.season || '四季',
    color: String(body.color).trim(),
    occasion: body.occasion || '通勤',
    cover: await storePhoto(db, body.cover),
    priceCents: body.price == null ? null : toCents(body.price as number),
  };
}

function validItem(body: ItemBody | null) {
  return Boolean(body && typeof body.name === 'string' && body.name.trim() && body.category && CATEGORIES.includes(body.category)
    && typeof body.color === 'string' && body.color.trim() && validPrice(body.price));
}

async function currentSuggestion(db: PrismaClient, memberId: string, avoid: string[] = []) {
  const [state, session, items, profile] = await Promise.all([
    db.memberState.findUniqueOrThrow({ where: { memberId } }),
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
    db.wardrobeItem.findMany({ where: { memberId } }),
    db.profile.findUniqueOrThrow({ where: { id: 'local' } }),
  ]);
  return suggestOutfit(
    profile.modelBase ? { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName } : null,
    items,
    state.suggestionIndex,
    session.weatherOn,
    session.weatherLabel,
    avoid,
  );
}

export function registerWardrobe(app: Hono, db: PrismaClient) {
  app.get('/api/items/:id/cover', async (c) => {
    const item = await db.wardrobeItem.findFirst({ where: { id: c.req.param('id'), memberId: memberOf(c) } });
    if (!item) return c.notFound();
    const data = await photoValue(db, item, false);
    const match = data.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/);
    if (!match) return c.notFound();
    // The URL carries the immutable photo hash, so browser caching also keeps
    // wardrobe thumbnails available while the local API is temporarily down.
    c.header('cache-control', 'private, max-age=31536000, immutable');
    c.header('etag', `"${item.cover}"`);
    if (c.req.header('if-none-match') === `"${item.cover}"`) return c.body(null, 304);
    c.header('content-type', match[1]);
    c.header('x-content-type-options', 'nosniff');
    return c.body(new Uint8Array(Buffer.from(match[2], 'base64')));
  });
  app.post('/api/wardrobe/recognize', async (c) => {
    const body = await c.req.json();
    const image = typeof body.image === 'string' ? body.image : '';
    if (!image.startsWith('data:image/')) return c.json({ error: 'invalid' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'model_unavailable' }, 503);
    try {
      const draft = await recognizeClothing(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        image,
      );
      if (!draft) return c.json({ error: 'unreadable' }, 422);
      return c.json(draft);
    } catch {
      return c.json({ error: 'model_unavailable' }, 503);
    }
  });

  app.get('/api/items', async (c) => {
    const snap = await readSnapshot(db, memberOf(c));
    return c.json(snap.items);
  });

  app.post('/api/items', async (c) => {
    const body = await c.req.json();
    if (!validItem(body)) return c.json({ error: 'invalid' }, 400);
    const data = await itemData(db, body);
    await db.wardrobeItem.create({
      data: { id: uid('w'), memberId: memberOf(c), ...data, category: data.category!, wears: 0, createdAt: todayIso() },
    });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/items/batch', async (c) => {
    const body = await c.req.json();
    const items: ItemBody[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0 || items.some((item) => !validItem(item))) return c.json({ error: 'invalid' }, 400);
    const memberId = memberOf(c);
    const prepared = await Promise.all(items.map(item => itemData(db, item)));
    await db.$transaction(prepared.map((data) => {
      return db.wardrobeItem.create({
        data: { id: uid('w'), memberId, ...data, category: data.category!, wears: 0, createdAt: todayIso() },
      });
    }));
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.patch('/api/items/:id', async (c) => {
    const body = await c.req.json();
    if (body.category && !CATEGORIES.includes(body.category)) return c.json({ error: 'invalid' }, 400);
    if (!validPrice(body.price)
      || (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim()))
      || (body.color !== undefined && (typeof body.color !== 'string' || !body.color.trim()))) return c.json({ error: 'invalid' }, 400);
    const owned = await db.wardrobeItem.findFirst({ where: { id: c.req.param('id'), memberId: memberOf(c) } });
    if (!owned) return c.json({ error: 'missing' }, 404);
    await db.wardrobeItem.update({
      where: { id: owned.id },
      data: {
        name: body.name,
        category: body.category,
        season: body.season,
        color: body.color,
        occasion: body.occasion,
        ...(Object.prototype.hasOwnProperty.call(body, 'cover') ? { cover: body.cover === await photoValue(db, owned, true) ? owned.cover : await storePhoto(db, body.cover) } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'price') ? { priceCents: body.price == null ? null : toCents(body.price) } : {}),
      },
    });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.delete('/api/items/:id', async (c) => {
    const owned = await db.wardrobeItem.findFirst({ where: { id: c.req.param('id'), memberId: memberOf(c) } });
    if (!owned) return c.json({ error: 'missing' }, 404);
    await db.wardrobeItem.delete({ where: { id: owned.id } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/outfits', async (c) => {
    const body = await c.req.json();
    const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) return c.json({ error: 'empty' }, 400);
    const memberId = memberOf(c);
    const outfits = await db.outfit.findMany({ where: { memberId } });
    const joined = itemIds.join();
    if (outfits.some((outfit) => JSON.parse(outfit.itemIds).join() === joined)) {
      return c.json({ snapshot: await readMutationSnapshot(db, c), duplicate: true });
    }
    await db.outfit.create({
      data: { id: uid('o'), memberId, name: body.name || `今日推荐 ${outfits.length + 1}`, itemIds: JSON.stringify(itemIds), favorite: false },
    });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/outfits/:id/favorite', async (c) => {
    const outfit = await db.outfit.findFirst({ where: { id: c.req.param('id'), memberId: memberOf(c) } });
    if (!outfit) return c.json({ error: 'missing' }, 404);
    const body = await c.req.json().catch(() => ({}));
    await db.outfit.update({ where: { id: outfit.id }, data: { favorite: typeof body.favorite === 'boolean' ? body.favorite : !outfit.favorite } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/outfits/:id/apply', async (c) => {
    const memberId = memberOf(c);
    const outfit = await db.outfit.findFirst({ where: { id: c.req.param('id'), memberId } });
    if (!outfit) return c.json({ error: 'missing' }, 404);
    const ids = JSON.parse(outfit.itemIds) as string[];
    await db.wardrobeItem.updateMany({ where: { id: { in: ids }, memberId }, data: { wears: { increment: 1 } } });
    await db.memberState.update({ where: { memberId }, data: { activeOutfitId: outfit.id } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/wardrobe/drafts', async (c) => {
    const body = await c.req.json();
    if (typeof body.text === 'string') return c.json({ drafts: draftsFromOrder(body.text) });
    const image = typeof body.image === 'string' ? body.image : '';
    if (!image.startsWith('data:image/')) return c.json({ error: 'invalid' }, 400);
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ drafts: [blankDraft()], manual: true });
    try {
      const draft = await recognizeClothing(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        image,
      );
      if (!draft) return c.json({ error: 'unreadable' }, 422);
      return c.json({ drafts: [draft], manual: false });
    } catch {
      return c.json({ drafts: [blankDraft()], manual: true });
    }
  });

  app.get('/api/wardrobe/suggestion', async (c) => {
    return c.json(await currentSuggestion(db, memberOf(c)));
  });

  app.post('/api/wardrobe/suggestion/refresh', async (c) => {
    const body = await c.req.json().catch(() => ({} as { avoid?: unknown }));
    const avoid = Array.isArray(body.avoid) ? body.avoid.filter((id: unknown): id is string => typeof id === 'string') : [];
    const memberId = memberOf(c);
    const state = await db.memberState.findUniqueOrThrow({ where: { memberId } });
    await db.memberState.update({
      where: { memberId },
      data: { suggestionIndex: state.suggestionIndex + 1, outfitAdopted: false },
    });
    return c.json({ snapshot: await readSnapshot(db, memberId), suggestion: await currentSuggestion(db, memberId, avoid) });
  });

  app.post('/api/session/weather', async (c) => {
    const memberId = memberOf(c);
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    await db.sessionState.update({
      where: { id: 'local' },
      data: { weatherOn: !session.weatherOn, weatherLabel: session.weatherOn ? '天气未知' : '22°C 多云' },
    });
    await db.memberState.update({ where: { memberId }, data: { suggestionIndex: 0, outfitAdopted: false } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });

  app.post('/api/session/tips', async (c) => {
    const body = await c.req.json();
    const memberId = memberOf(c);
    const state = await db.memberState.findUniqueOrThrow({ where: { memberId } });
    const tips = JSON.parse(state.adoptedTips) as string[];
    if (body.id && !tips.includes(body.id)) tips.push(String(body.id));
    await db.memberState.update({ where: { memberId }, data: { adoptedTips: JSON.stringify(tips) } });
    return c.json({ snapshot: await readMutationSnapshot(db, c) });
  });
}
