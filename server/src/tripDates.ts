import type { PrismaClient } from '@prisma/client';
import { inferTripDates, type TripDates } from '../../shared/trips.js';
import { readJson } from './ids.js';
import { isLocalDate, localDate } from './localDate.js';

export function parseTripDates(start: unknown, end: unknown): Required<TripDates> | undefined {
  if (start != null && start !== '' && !isLocalDate(start)) return;
  if (end != null && end !== '' && !isLocalDate(end)) return;
  const startDate = isLocalDate(start) ? start : isLocalDate(end) ? end : null;
  const endDate = isLocalDate(end) ? end : startDate;
  if (startDate && endDate && endDate < startDate) return;
  return { startDate, endDate };
}

export async function migrateTripDates(db: PrismaClient) {
  const today = localDate();
  const trips = await db.trip.findMany({ where: { startDate: null, endDate: null }, select: { id: true, dateLabel: true, timeline: true } });
  for (const trip of trips) {
    const nodes = readJson<unknown>(trip.timeline, []);
    const times = Array.isArray(nodes) ? nodes.flatMap(node => typeof node?.time === 'string' ? [node.time] : []) : [];
    const dates = inferTripDates(trip.dateLabel, times, today);
    if (dates.startDate) await db.trip.updateMany({ where: { id: trip.id, startDate: null, endDate: null }, data: dates });
  }
}
