import type { Prisma, PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { suggestOutfit } from '../adapters/outfit.js';
import { recognizeClothing } from '../adapters/vision.js';
import { readJson, uid } from '../ids.js';
import { isLocalDate, localDate } from '../localDate.js';
import { yuanToCents } from '../money.js';
import { coverUrl, photoData, readPhoto, removeUnusedPhoto, storePhoto } from '../photos.js';
import { currentMemberId } from '../requestContext.js';
import { readSnapshot } from '../snapshot.js';
import { blankDraft, draftsFromOrder } from '../wardrobePlan.js';

const CATEGORIES = ['上衣', '裤装', '裙装', '外套', '鞋包'];
type ItemBody = { name: string; category: string; color: string; season?: string; occasion?: string; cover?: string; price?: unknown };

function validItemFields(body: Partial<ItemBody>) {
  return typeof body === 'object' && !Array.isArray(body)
    && (body.name === undefined || (typeof body.name === 'string' && Boolean(body.name.trim())))
    && (body.category === undefined || CATEGORIES.includes(body.category))
    && (body.color === undefined || (typeof body.color === 'string' && Boolean(body.color.trim())))
    && (body.season === undefined || typeof body.season === 'string')
    && (body.occasion === undefined || typeof body.occasion === 'string')
    && (body.price == null || yuanToCents(body.price) !== null);
}

function validItem(body: Partial<ItemBody> | null): body is ItemBody {
  return Boolean(body && body.name && body.category && body.color && validItemFields(body)
    && (body.cover === undefined || body.cover === '' || photoData(body.cover)));
}

async function createItem(db: Prisma.TransactionClient, body: ItemBody, createdAt: string) {
  await db.wardrobeItem.create({ data: {
    id: uid('w'), name: body.name.trim(), category: body.category, color: body.color.trim(),
    season: body.season?.trim() || '四季', occasion: body.occasion?.trim() || '通勤',
    cover: body.cover ? await storePhoto(db, body.cover) : '', priceCents: yuanToCents(body.price), wears: 0, createdAt,
  } });
}

function readItemIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) return [];
  return [...new Set(value)];
}

async function closetHasIds(db: Prisma.TransactionClient, ids: string[]) {
  return (await db.wardrobeItem.count({ where: { id: { in: ids } } })) === ids.length;
}

export function registerWardrobe(app: Hono, db: PrismaClient) {
  app.get('/api/items/:id/cover', async (c) => {
    const item = await db.wardrobeItem.findUnique({ where: { id: c.req.param('id') }, select: { cover: true } });
    const image = item && await readPhoto(db, item.cover);
    c.header('Cache-Control', 'private, no-store');
    if (!image) return c.notFound();
    c.header('Content-Type', image[1]);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(Buffer.from(image[2], 'base64')));
  });

  app.post('/api/wardrobe/recognize', async (c) => {
    const body = await c.req.json();
    const image = body?.image;
    if (!photoData(image)) return c.json({ error: 'invalid' }, 400);
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
    const snap = await readSnapshot(db);
    return c.json(snap.items);
  });

  app.post('/api/items', async (c) => {
    const body = await c.req.json();
    if (!validItem(body)) return c.json({ error: 'invalid' }, 400);
    const { createdAt } = body as ItemBody & { createdAt?: unknown };
    await db.$transaction((tx) => createItem(tx, body, isLocalDate(createdAt) ? createdAt : localDate()));
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/items/batch', async (c) => {
    const body = await c.req.json();
    const items: ItemBody[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0 || items.some((item) => !validItem(item))) return c.json({ error: 'invalid' }, 400);
    const createdAt = isLocalDate(body.createdAt) ? body.createdAt : localDate();
    await db.$transaction(async (tx) => {
      for (const item of items) await createItem(tx, item, createdAt);
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.patch('/api/items/:id', async (c) => {
    const body: Partial<ItemBody> = await c.req.json();
    if (!body || !validItemFields(body)) return c.json({ error: 'invalid' }, 400);
    const id = c.req.param('id');
    const status = await db.$transaction(async (tx) => {
      const item = await tx.wardrobeItem.findUnique({ where: { id }, select: { cover: true } });
      if (!item) return 404;
      let cover = item.cover;
      if (body.cover !== undefined && body.cover !== coverUrl(id, cover)) {
        if (body.cover !== '' && !photoData(body.cover)) return 400;
        cover = body.cover ? await storePhoto(tx, body.cover) : '';
      }
      await tx.wardrobeItem.update({ where: { id }, data: {
        name: body.name?.trim(), category: body.category, season: body.season, color: body.color?.trim(), occasion: body.occasion,
        cover, priceCents: body.price === undefined ? undefined : yuanToCents(body.price),
      } });
      if (cover !== item.cover) await removeUnusedPhoto(tx, item.cover);
      return null;
    });
    if (status) return c.json({ error: status === 404 ? 'missing' : 'invalid' }, status);
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/items/:id', async (c) => {
    const id = c.req.param('id');
    const removed = await db.$transaction(async (tx) => {
      const item = await tx.wardrobeItem.findUnique({ where: { id }, select: { cover: true } });
      if (!item) return false;
      await tx.wardrobeItem.delete({ where: { id } });
      await removeUnusedPhoto(tx, item.cover);
      return true;
    });
    if (!removed) return c.json({ error: 'missing' }, 404);
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/outfits', async (c) => {
    const body = await c.req.json();
    const itemIds = readItemIds(body?.itemIds);
    if (itemIds.length === 0) return c.json({ error: 'empty' }, 400);
    const duplicate = await db.$transaction(async (tx) => {
      if (!await closetHasIds(tx, itemIds)) return null;
      const outfits = await tx.outfit.findMany();
      const joined = itemIds.join();
      if (outfits.some((outfit) => readJson<string[]>(outfit.itemIds, []).join() === joined)) return true;
      await tx.outfit.create({
        data: { id: uid('o'), name: body.name || `今日推荐 ${outfits.length + 1}`, itemIds: JSON.stringify(itemIds), favorite: false },
      });
      return false;
    });
    if (duplicate === null) return c.json({ error: 'invalid' }, 400);
    return c.json({ snapshot: await readSnapshot(db), duplicate });
  });

  app.post('/api/outfits/:id/favorite', async (c) => {
    const outfit = await db.outfit.findUnique({ where: { id: c.req.param('id') } });
    if (!outfit) return c.json({ error: 'missing' }, 404);
    await db.outfit.update({ where: { id: outfit.id }, data: { favorite: !outfit.favorite } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/outfits/:id/apply', async (c) => {
    const id = c.req.param('id');
    const applied = await db.$transaction(async (tx) => {
      const outfit = await tx.outfit.findUnique({ where: { id } });
      if (!outfit) return false;
      const ids = readJson<string[]>(outfit.itemIds, []);
      await tx.wardrobeItem.updateMany({ where: { id: { in: ids } }, data: { wears: { increment: 1 } } });
      await tx.memberState.update({ where: { memberId: currentMemberId() }, data: { activeOutfitId: id } });
      return true;
    });
    if (!applied) return c.json({ error: 'missing' }, 404);
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/wardrobe/drafts', async (c) => {
    const body = await c.req.json();
    if (typeof body?.text === 'string') return c.json({ drafts: draftsFromOrder(body.text) });
    const image = body?.image;
    if (!photoData(image)) return c.json({ error: 'invalid' }, 400);
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
    const [state, session, items, profile] = await Promise.all([
      db.memberState.findUniqueOrThrow({ where: { memberId: currentMemberId() } }),
      db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }),
      db.wardrobeItem.findMany({ select: { id: true, name: true, category: true, color: true, season: true, occasion: true, wears: true } }),
      db.profile.findUniqueOrThrow({ where: { id: 'local' } }),
    ]);
    const config = profile.modelBase ? { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName } : null;
    c.header('Cache-Control', 'private, no-store');
    return c.json(await suggestOutfit(config, items, state.suggestionIndex, session.weatherOn, session.weatherLabel, c.req.queries('avoid') ?? []));
  });

  app.post('/api/wardrobe/suggestion/refresh', async (c) => {
    await db.memberState.update({
      where: { memberId: currentMemberId() },
      data: { suggestionIndex: { increment: 1 }, outfitAdopted: false },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/wardrobe/suggestion/adopt', async (c) => {
    const body = await c.req.json();
    const itemIds = readItemIds(body?.itemIds);
    if (itemIds.length === 0) return c.json({ error: 'empty' }, 400);
    const memberId = currentMemberId();
    const adopted = await db.$transaction(async (tx) => {
      if (!await closetHasIds(tx, itemIds)) return null;
      const state = await tx.memberState.findUniqueOrThrow({ where: { memberId } });
      if (state.outfitAdopted) return false;
      const tips = new Set(readJson<string[]>(state.adoptedTips, []));
      await tx.wardrobeItem.updateMany({ where: { id: { in: itemIds } }, data: { wears: { increment: 1 } } });
      await tx.memberState.update({ where: { memberId }, data: { outfitAdopted: true, adoptedTips: JSON.stringify([...tips.add('outfit')]) } });
      return true;
    });
    if (adopted === null) return c.json({ error: 'invalid' }, 400);
    return c.json({ snapshot: await readSnapshot(db), adopted });
  });

  app.post('/api/session/weather', async (c) => {
    await db.$transaction(async (tx) => {
      const session = await tx.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
      await tx.sessionState.update({ where: { id: 'local' }, data: {
        weatherOn: !session.weatherOn && Boolean(session.weatherLabel && session.weatherLabel !== '天气未知'),
      } });
      await tx.memberState.update({ where: { memberId: currentMemberId() }, data: { suggestionIndex: 0, outfitAdopted: false } });
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/session/tips', async (c) => {
    const body = await c.req.json();
    const memberId = currentMemberId();
    const state = await db.memberState.findUniqueOrThrow({ where: { memberId } });
    const tips = readJson<string[]>(state.adoptedTips, []);
    if (body.id && !tips.includes(body.id)) tips.push(String(body.id));
    await db.memberState.update({ where: { memberId }, data: { adoptedTips: JSON.stringify(tips) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
