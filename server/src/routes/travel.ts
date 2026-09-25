import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { parseItinerary, type ItineraryDraft } from '../adapters/itinerary.js';
import { applyNamedScene } from '../homeLink.js';
import { readJson, uid } from '../ids.js';
import { pickSuggestion } from '../suggestion.js';
import { readSnapshot } from '../snapshot.js';

function packingItems(lines: string[]) {
  return lines.map((text) => ({ id: uid('p'), text, done: false }));
}

async function saveTrip(db: PrismaClient, draft: ItineraryDraft) {
  const id = uid('trip');
  await db.trip.create({
    data: {
      id,
      title: draft.title,
      status: draft.status,
      transport: draft.transport,
      dateLabel: draft.dateLabel,
      tickets: JSON.stringify(draft.tickets),
      timeline: JSON.stringify(draft.timeline),
      packing: JSON.stringify(packingItems(draft.packing)),
      prepAdopted: false,
    },
  });
  await db.sessionState.update({ where: { id: 'local' }, data: { activeTripId: id } });
  return id;
}

export function registerTravel(app: Hono, db: PrismaClient) {
  app.post('/api/trips/parse', async (c) => {
    const body = await c.req.json();
    const draft = parseItinerary(String(body.text ?? ''));
    if (!draft) return c.json({ error: 'unreadable' }, 422);
    return c.json({ draft });
  });

  app.post('/api/trips/import', async (c) => {
    const body = await c.req.json();
    const draft = body.draft as ItineraryDraft | undefined;
    if (!draft?.title || !Array.isArray(draft.timeline) || draft.timeline.length === 0) return c.json({ error: 'invalid' }, 400);
    await saveTrip(db, {
      title: String(draft.title).trim(),
      status: '即将开始',
      transport: draft.transport || '其他',
      dateLabel: draft.dateLabel || '日期待定',
      tickets: Array.isArray(draft.tickets) ? draft.tickets : [],
      timeline: draft.timeline,
      packing: Array.isArray(draft.packing) && draft.packing.length > 0 ? draft.packing : ['身份证', '充电器', '换洗衣物'],
    });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/chain', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip) return c.json({ error: 'missing' }, 404);
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const suggestion = pickSuggestion(session.suggestionIndex, session.weatherOn);
    const ids = suggestion.itemIds.filter((id) => id);
    if (ids.length > 0) {
      await db.wardrobeItem.updateMany({ where: { id: { in: ids } }, data: { wears: { increment: 1 } } });
    }
    await db.sessionState.update({ where: { id: 'local' }, data: { outfitAdopted: true } });
    const scene = await applyNamedScene(db, '离家');
    const snapshot = await readSnapshot(db);
    const names = snapshot.items.filter((item) => suggestion.itemIds.includes(item.id)).map((item) => item.name);
    return c.json({
      snapshot,
      chain: {
        trip: { id: trip.id, title: trip.title },
        outfit: {
          title: names.length > 0 ? names.join(' · ') : suggestion.title,
          reason: suggestion.reason,
          itemIds: suggestion.itemIds,
        },
        scene,
        budget: {
          spent: snapshot.spending.byTag.行,
          budget: snapshot.budgets.行,
          remain: snapshot.budgets.行 - snapshot.spending.byTag.行,
        },
      },
    });
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

  app.post('/api/trips/:id/packing/:itemId', async (c) => {
    const trip = await db.trip.findUniqueOrThrow({ where: { id: c.req.param('id') } });
    const packing = readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []);
    const next = packing.map((item) => (item.id === c.req.param('itemId') ? { ...item, done: !item.done } : item));
    await db.trip.update({ where: { id: trip.id }, data: { packing: JSON.stringify(next) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });

  app.post('/api/trips/:id/adopt-prep', async (c) => {
    const trip = await db.trip.findUnique({ where: { id: c.req.param('id') } });
    if (!trip || trip.prepAdopted) return c.json({ snapshot: await readSnapshot(db) });
    await db.trip.update({ where: { id: trip.id }, data: { prepAdopted: true } });
    await applyNamedScene(db, '离家');
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const tips = readJson<string[]>(session.adoptedTips, []);
    if (!tips.includes('prep')) tips.push('prep');
    await db.sessionState.update({ where: { id: 'local' }, data: { adoptedTips: JSON.stringify(tips) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
