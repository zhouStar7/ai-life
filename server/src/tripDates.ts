import type { PrismaClient } from '@prisma/client';
import { inferTripDates } from '../../shared/trips.js';
import { todayIso } from './calendar.js';
import { readJson } from './ids.js';
export async function migrateTripDates(db: PrismaClient) {
  const trips = await db.trip.findMany({ where: { startDate: null, endDate: null } });
  for (const trip of trips) {
    const dates = inferTripDates(trip.dateLabel, readJson<{ time: string }[]>(trip.timeline, []).map(n => n.time), todayIso());
    if (dates.startDate) await db.trip.update({ where: { id: trip.id }, data: dates });
  }
}
