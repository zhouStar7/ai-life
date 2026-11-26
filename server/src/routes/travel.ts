import { isMonth } from '../../../shared/spending.js';
import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { complete } from '../adapters/model.js';
import { draftFromModel, ITINERARY_MODEL_PROMPT, parseItinerary, type ItineraryDraft } from '../adapters/itinerary.js';
import { readJson, uid } from '../ids.js';
import { readSnapshot } from '../snapshot.js';
import { localDate } from '../localDate.js';
import { centsToYuan, yuanToCents } from '../money.js';
import { createHash } from 'node:crypto';
import { destinationOf, mealReason, pickTravelOutfit, suggestTripMeal } from '../tripPlan.js';

function packingItems(lines: string[]) {
  return lines.map((text) => ({ id: uid('p'), text, done: false }));
}

function importId(key: string) {
  return `trip-${createHash('sha256').update(key).digest('hex')}`;
}

async function previewTrip(db: PrismaClient, draft: ItineraryDraft, text: string, source: 'rules' | 'model') {
  const id = importId(text.normalize('NFKC').replace(/\s+/g, ' ').trim());
  const existingTrip = await db.trip.findUnique({ where: { id }, select: { id: true, title: true } });
  return { draft: { ...draft, source, importId: id, existingTrip } };
}

export function registerTravel(app: Hono, db: PrismaClient) {
  app.post('/api/trips/parse', async (c) => {
    const body = await c.req.json();
    const text = String(body.text ?? '');
    const ruled = parseItinerary(text);
    if (ruled) return c.json(await previewTrip(db, ruled, text, 'rules'));
    const profile = await db.profile.findUniqueOrThrow({ where: { id: 'local' } });
    if (!profile.modelBase) return c.json({ error: 'unreadable' }, 422);
    try {
      const content = await complete(
        { baseUrl: profile.modelBase, apiKey: profile.modelKey, model: profile.modelName },
        [
          { role: 'system', content: ITINERARY_MODEL_PROMPT },
          { role: 'user', content: text },
        ],
      );
      const drafted = draftFromModel(content);
      if (!drafted) return c.json({ error: 'unreadable' }, 422);
      return c.json(await previewTrip(db, drafted, text, 'model'));
    } catch {
      return c.json({ error: 'unreadable' }, 422);
    }
  });

  app.post('/api/trips/import', async (c) => {
    const body = await c.req.json();
    const draft = body.draft as ItineraryDraft | undefined;
    if (!draft || typeof draft.title !== 'string' || !draft.title.trim() || !Array.isArray(draft.timeline) || !draft.timeline.length
      || !draft.timeline.every(node => node && [node.time, node.title, node.detail].every(value => typeof value === 'string' && value.trim()))
      || !Array.isArray(draft.tickets) || !draft.tickets.every(ticket => ticket && typeof ticket.label === 'string' && typeof ticket.status === 'string')
      || !Array.isArray(draft.packing) || !draft.packing.every(text => typeof text === 'string')) return c.json({ error: 'invalid' }, 400);
    const id = typeof body.draft.importId === 'string' && /^trip-[a-f0-9]{64}$/.test(body.draft.importId)
      ? body.draft.importId : importId(JSON.stringify([draft.dateLabel, draft.tickets, draft.timeline]));
    const duplicate = await db.$transaction(async tx => {
      const exists = await tx.trip.findUnique({ where: { id }, select: { id: true } });
      if (!exists) await tx.trip.create({ data: {
        id, title: draft.title.trim(), status: '即将开始', transport: draft.transport || '其他', dateLabel: draft.dateLabel || '日期待定',
        tickets: JSON.stringify(draft.tickets), timeline: JSON.stringify(draft.timeline), packing: JSON.stringify(packingItems(draft.packing.map(text => text.trim()).filter(Boolean))),
      } });
      await tx.sessionState.update({ where: { id: 'local' }, data: { activeTripId: id } });
      return Boolean(exists);
    });
    return c.json({ snapshot: await readSnapshot(db), duplicate });
  });

  app.post('/api/trips/:id/chain', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const items = await db.wardrobeItem.findMany();
    const timeline = readJson<{ detail: string }[]>(trip.timeline, []);
    const destination = destinationOf(trip.title, timeline.map((node) => node.detail));
    const outfit = pickTravelOutfit(items, destination, session.weatherLabel, session.weatherOn);
    const packing = readJson<{ text: string }[]>(trip.packing, []).map((item) => item.text);
    const confirmation = prepKey(trip.id, outfit.itemIds, packing);
    const scene = { name: '离家', via: session.haConnected ? 'home-assistant' : 'local' };
    const date = localDate();
    const meals = await db.meal.findMany({ where: { date } });
    const recipes = await db.recipe.findMany();
    const meal = suggestTripMeal(recipes.map((recipe) => ({
      slot: recipe.slot,
      name: recipe.name,
      kcal: recipe.kcal,
      protein: recipe.protein,
      carb: recipe.carb,
      fat: recipe.fat,
    })), meals.map((item) => item.name));
    const month = c.req.query('month');
    if (month !== undefined && !isMonth(month)) return c.json({ error: 'invalid' }, 400);
    const snapshot = await readSnapshot(db, month);
    const tripSpend = await db.expense.aggregate({ where: { tripId: trip.id, tag: '行' }, _sum: { amountCents: true } });
    return c.json({
      snapshot,
      chain: {
        trip: { id: trip.id, title: trip.title },
        outfit, packing, confirmation,
        scene,
        meal: { ...meal, reason: mealReason(meal, destination) },
        budget: {
          month: snapshot.spending.month,
          spent: snapshot.spending.byTag.行,
          budget: snapshot.budgets.行,
          remain: Math.round((snapshot.budgets.行 - snapshot.spending.byTag.行) * 100) / 100,
          trip: centsToYuan(tripSpend._sum.amountCents ?? 0n),
        },
      },
    });
  });

  app.post('/api/trips/:id/meal', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    const body = await c.req.json().catch(() => ({} as { name?: unknown }));
    const recipes = await db.recipe.findMany();
    const date = localDate();
    const meals = await db.meal.findMany({ where: { date } });
    const suggested = suggestTripMeal(recipes.map((recipe) => ({
      slot: recipe.slot,
      name: recipe.name,
      kcal: recipe.kcal,
      protein: recipe.protein,
      carb: recipe.carb,
      fat: recipe.fat,
    })), meals.map((item) => item.name));
    const recipe = recipes.find((item) => item.name === (typeof body.name === 'string' ? body.name.trim() : ''))
      ?? recipes.find((item) => item.name === suggested.name);
    if (!recipe) return c.json({ error: 'missing' }, 404);
    const exists = await db.meal.findFirst({ where: { name: recipe.name, date } });
    if (!exists) {
      await db.meal.create({
        data: {
          id: uid('m'),
          slot: recipe.slot,
          name: recipe.name,
          time: '12:30',
          date,
          kcal: recipe.kcal,
          protein: recipe.protein,
          carb: recipe.carb,
          fat: recipe.fat,
        },
      });
    }
    return c.json({ snapshot: await readSnapshot(db), meal: { name: recipe.name, slot: recipe.slot } });
  });

  app.post('/api/trips', async (c) => {
    const body = await c.req.json();
    if (!body.title) return c.json({ error: 'invalid' }, 400);
    const id = uid('trip');
    await db.trip.create({
      data: {
        id,
        title: String(body.title).trim(),
        status: body.status === '进行中' ? '进行中' : '即将开始',
        transport: body.transport || '高铁',
        dateLabel: body.dateLabel || '日期待定',
        tickets: '[]',
        timeline: JSON.stringify([{ time: '待定', title: '出发', detail: '时间补上之后会出现在这里' }]),
        packing: JSON.stringify(['身份证', '充电器', '换洗衣物'].map((text) => ({ id: uid('p'), text, done: false }))),
        prepAdopted: false,
      },
    });
    await db.sessionState.update({ where: { id: 'local' }, data: { activeTripId: id } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.delete('/api/trips/:id', async (c) => {
    const id = c.req.param('id');
    await db.trip.delete({ where: { id } });
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    if (session.activeTripId === id) {
      const remaining = await db.trip.findFirst();
      await db.sessionState.update({ where: { id: 'local' }, data: { activeTripId: remaining?.id ?? '' } });
    }
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/select', async (c) => {
    await db.sessionState.update({ where: { id: 'local' }, data: { activeTripId: c.req.param('id') } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/packing', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    const body = await c.req.json().catch(() => ({} as { text?: unknown }));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return c.json({ error: 'invalid' }, 400);
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    if (!packing.some((item) => item.text === text)) packing.push({ id: uid('p'), text, done: false });
    await db.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(packing) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.patch('/api/trips/:id/packing/:packId', async c => {
    const body = await c.req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return c.json({ error: 'invalid' }, 400);
    const changed = await db.$transaction(async tx => {
      const trip = await tx.trip.findUnique({ where: { id: c.req.param('id') } });
      if (!trip) return false;
      const items = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
      const item = items.find(item => item.id === c.req.param('packId'));
      if (!item) return false;
      item.text = text;
      await tx.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(items) } });
      return true;
    });
    if (!changed) return c.json({ error: 'missing' }, 404);
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/packing-templates', async (c) => {
    const body = await c.req.json().catch(() => ({} as { name?: unknown; tripId?: unknown }));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const trip = typeof body.tripId === 'string' ? await db.trip.findUnique({ where: { id: body.tripId } }) : null;
    if (!name || !trip) return c.json({ error: 'invalid' }, 400);
    const packing = readJson<{ text: string }[]>(trip.packing, []);
    const items = [...new Set(packing.map((item) => item.text).filter(Boolean))];
    if (items.length === 0) return c.json({ error: 'invalid' }, 400);
    await db.packingTemplate.create({ data: { id: uid('pack'), name, items: JSON.stringify(items) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/packing-template', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    const body = await c.req.json().catch(() => ({} as { templateId?: unknown }));
    const template = typeof body.templateId === 'string'
      ? await db.packingTemplate.findUnique({ where: { id: body.templateId } })
      : null;
    if (!trip || !template) return c.json({ error: 'missing' }, 404);
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    const owned = new Set(packing.map((item) => item.text));
    for (const text of readJson<string[]>(template.items, [])) {
      if (!owned.has(text)) packing.push({ id: uid('p'), text, done: false });
    }
    await db.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(packing) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/expenses', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    const body = await c.req.json().catch(() => ({} as { amount?: unknown; merchant?: unknown; kind?: unknown }));
    const amountCents = yuanToCents(body.amount);
    const kind = body.kind === '食宿' ? '食宿' : body.kind === '票务' ? '票务' : '';
    const merchant = typeof body.merchant === 'string' ? body.merchant.trim() : '';
    if (!kind || !merchant || !amountCents) return c.json({ error: 'invalid' }, 400);
    await db.expense.create({
      data: {
        id: uid('e'),
        tag: '行',
        amountCents,
        date: localDate(),
        merchant,
        note: kind,
        tripId: trip.id,
      },
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/packing/:itemId', async (c) => {
    const trip = await db.trip.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    const next = packing.map((item) => (item.id === c.req.param('itemId') ? { ...item, done: !item.done } : item));
    await db.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(next) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/adopt-prep', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    if (trip.prepAdopted) return c.json({ snapshot: await readSnapshot(db) });
    const body = await c.req.json().catch(() => ({}));
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const timeline = readJson<{ detail: string }[]>(trip.timeline, []);
    const destination = destinationOf(trip.title, timeline.map((node) => node.detail));
    const outfit = pickTravelOutfit(await db.wardrobeItem.findMany(), destination, session.weatherLabel, session.weatherOn);
    const packing = readJson<{ text: string }[]>(trip.packing, []).map((item) => item.text);
    if (body.confirmation !== prepKey(trip.id, outfit.itemIds, packing)) return c.json({ error: '请重新预览准备包' }, 409);
    await db.$transaction(async (tx) => {
      const claimed = await tx.trip.updateMany({ where: { id: trip.id, prepAdopted: false }, data: { prepAdopted: true } });
      if (!claimed.count) return;
      await tx.wardrobeItem.updateMany({ where: { id: { in: outfit.itemIds } }, data: { wears: { increment: 1 } } });
      const current = await tx.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
      const tips = new Set(readJson<string[]>(current.adoptedTips, []));
      tips.add('prep');
      await tx.sessionState.update({ where: { id: 'local' }, data: { adoptedTips: JSON.stringify([...tips]), outfitAdopted: outfit.itemIds.length > 0 || current.outfitAdopted } });
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}

function prepKey(id: string, outfit: string[], packing: string[]) {
  return createHash('sha256').update(JSON.stringify([id, outfit, packing])).digest('hex');
}
