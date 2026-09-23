import type { PrismaClient } from '@prisma/client';
import type { Hono } from 'hono';
import { readJson, uid } from '../ids.js';
import { nextDevice } from '../scenes.js';
import { readSnapshot } from '../snapshot.js';

export function registerTravel(app: Hono, db: PrismaClient) {
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
    const devices = await db.device.findMany();
    for (const device of devices) {
      const next = nextDevice(device, '离家');
      await db.device.update({ where: { id: device.id }, data: { on: next.on, paramValue: next.paramValue } });
    }
    const session = await db.sessionState.findUniqueOrThrow({ where: { id: 'local' } });
    const tips = readJson<string[]>(session.adoptedTips, []);
    if (!tips.includes('prep')) tips.push('prep');
    await db.sessionState.update({ where: { id: 'local' }, data: { activeScene: '离家', adoptedTips: JSON.stringify(tips) } });
    return c.json({ snapshot: await readSnapshot(db) });
  });
}
