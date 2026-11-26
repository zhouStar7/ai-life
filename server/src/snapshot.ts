import type { PrismaClient } from '@prisma/client';
import type { Context } from 'hono';
import { DEFAULT_HA_BASE } from './adapters/home-assistant.js';
import { currentMonth, recentMonths, shiftMonth, todayIso } from './calendar.js';
import { memberOf } from './auth.js';
import { readSceneBook } from './homeLink.js';
import { readJson } from './ids.js';
import { fromCents } from './money.js';
import { photoValue } from './photos.js';
import { requestContext } from './requestContext.js';
import { tripStatus } from '../../shared/trips.js';

async function wardrobe(db: PrismaClient, memberId: string, compact: boolean) {
  const [items, outfits, state] = await Promise.all([
    db.wardrobeItem.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } }),
    db.outfit.findMany({ where: { memberId } }), db.memberState.findUniqueOrThrow({ where: { memberId } }),
  ]);
  return {
    items: await Promise.all(items.map(async ({ priceCents, ...item }) => ({ ...item, cover: await photoValue(db, item, compact), price: priceCents == null ? null : fromCents(priceCents) }))),
    outfits: outfits.map(outfit => ({ ...outfit, itemIds: readJson<string[]>(outfit.itemIds, []) })),
    suggestionIndex: state.suggestionIndex, outfitAdopted: state.outfitAdopted, activeOutfitId: state.activeOutfitId,
  };
}
async function diet(db: PrismaClient, memberId: string) {
  const [meals, recipes, target] = await Promise.all([
    db.meal.findMany({ where: { memberId } }), db.recipe.findMany({ where: { memberId } }),
    db.nutritionTarget.findUniqueOrThrow({ where: { memberId } }),
  ]);
  return { meals, recipes: recipes.map(recipe => ({ ...recipe, tags: readJson<string[]>(recipe.tags, []) })),
    targets: { kcal: target.kcal, protein: target.protein, carb: target.carb, fat: target.fat } };
}
async function home(db: PrismaClient) {
  const [devices, alerts, session, profile] = await Promise.all([db.device.findMany(), db.alert.findMany(),
    db.sessionState.findUniqueOrThrow({ where: { id: 'local' } }), db.profile.findUniqueOrThrow({ where: { id: 'local' } })]);
  const liveHome = session.haConnected && Boolean(profile.haToken);
  const visible = liveHome && devices.some(d => d.source === 'ha') ? devices.filter(d => d.source === 'ha') : devices.filter(d => d.source !== 'ha');
  return {
    devices: visible.map(d => ({ id: d.id, name: d.name, room: d.room, kind: d.kind, on: d.on,
      paramLabel: d.paramLabel ?? undefined, paramValue: d.paramValue ?? undefined, offline: d.offline || undefined })),
    alerts, activeScene: session.activeScene, weatherOn: session.weatherOn, weatherLabel: session.weatherLabel,
    home: { configured: Boolean(profile.haToken), baseUrl: profile.haBase || DEFAULT_HA_BASE, connected: liveHome,
      sceneCatalog: readSceneBook(session.haScenes).catalog, sceneBindings: readSceneBook(session.haScenes).bindings },
  };
}
async function travel(db: PrismaClient, memberId: string) {
  const [trips, templates, state] = await Promise.all([db.trip.findMany({ where: { memberId } }),
    db.packingTemplate.findMany({ where: { memberId }, orderBy: { name: 'asc' } }), db.memberState.findUniqueOrThrow({ where: { memberId } })]);
  return {
    trips: trips.map(trip => ({
      ...trip,
      status: tripStatus(trip, todayIso()),
      tickets: readJson<{ label: string; status: string }[]>(trip.tickets, []),
      timeline: readJson<{ time: string; title: string; detail: string }[]>(trip.timeline, []),
      packing: readJson<{ id: string; text: string; done: boolean }[]>(trip.packing, []),
    })),
    packingTemplates: templates.map(t => ({ id: t.id, name: t.name, items: readJson<string[]>(t.items, []) })),
    activeTripId: state.activeTripId,
  };
}
export async function spendingSummary(db: PrismaClient, memberId: string, month: string) {
  const months = recentMonths(month, 6);
  const groups = await db.expense.groupBy({ by: ['date', 'tag'], where: { memberId, date: { gte: `${months[0]}-01`, lt: `${shiftMonth(month, 1)}-01` } }, _sum: { amount: true } });
  return summarizeSpending(groups.map(g => ({ date: g.date, tag: g.tag, amount: fromCents(g._sum.amount ?? 0) })), month);
}
async function finance(db: PrismaClient, memberId: string, compact: boolean) {
  const [expenses, budget, summary] = await Promise.all([
    compact ? Promise.resolve([]) : db.expense.findMany({ where: { memberId }, orderBy: { date: 'desc' } }),
    db.budget.findUniqueOrThrow({ where: { memberId } }), spendingSummary(db, memberId, currentMonth()),
  ]);
  return { expenses: expenses.map(({ fingerprint: _fingerprint, ...e }) => ({ ...e, amount: fromCents(e.amount) })),
    spending: summary, budgets: { total: budget.total, 衣: budget.cloth, 食: budget.food, 住: budget.home, 行: budget.trip } };
}
async function settings(db: PrismaClient, memberId: string) {
  const [notice, profile, state, member] = await Promise.all([db.notice.findUniqueOrThrow({ where: { memberId } }),
    db.profile.findUniqueOrThrow({ where: { id: 'local' } }), db.memberState.findUniqueOrThrow({ where: { memberId } }), db.member.findUniqueOrThrow({ where: { id: memberId } })]);
  return { notices: { outfit: notice.outfit, budget: notice.budget, device: notice.device },
    model: { configured: Boolean(profile.modelBase), baseUrl: profile.modelBase, model: profile.modelName },
    adoptedTips: readJson<string[]>(state.adoptedTips, []), member: { id: member.id, username: member.username, name: member.name } };
}
export async function readSnapshot(db: PrismaClient, memberId: string, compact = false) {
  const [w, d, h, t, f, s] = await Promise.all([wardrobe(db, memberId, compact), diet(db, memberId), home(db), travel(db, memberId), finance(db, memberId, compact), settings(db, memberId)]);
  return { ...w, ...d, ...h, ...t, ...f, ...s };
}
export function readClientSnapshot(db: PrismaClient, memberId: string) {
  return readSnapshot(db, memberId, requestContext.getStore()?.compact ?? false);
}
export async function readMutationSnapshot(db: PrismaClient, c: Context) {
  const memberId = memberOf(c);
  if (!requestContext.getStore()?.compact) return readSnapshot(db, memberId);
  const path = c.req.path;
  if (/^\/api\/(items|outfits)(\/|$)/.test(path)) return { partial: true, ...await wardrobe(db, memberId, true) };
  if (/^\/api\/(meals|recipes|nutrition-target)(\/|$)/.test(path)) return { partial: true, ...await diet(db, memberId) };
  if (/^\/api\/(expenses|bills\/import|budgets)(\/|$)/.test(path) || /\/trips\/[^/]+\/expenses$/.test(path)) return { partial: true, ...await finance(db, memberId, true) };
  if (/^\/api\/(notices|model)(\/|$)/.test(path)) return { partial: true, ...await settings(db, memberId) };
  if (/^\/api\/(devices|scenes|home|alerts)(\/|$)/.test(path)) return { partial: true, ...await home(db), ...await settings(db, memberId) };
  if (/^\/api\/trips/.test(path) && !/\/(chain|meal|adopt-prep)$/.test(path)) return { partial: true, ...await travel(db, memberId) };
  return readClientSnapshot(db, memberId);
}
export function summarizeSpending(expenses: { date: string; amount: number; tag: string }[], month: string) {
  const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((total, item) => total + item.amount, 0) * 100) / 100;
  const rows = expenses.filter(e => e.date.startsWith(month));
  const byTag = (tag: string) => sum(rows.filter(e => e.tag === tag));
  return { month, monthTotal: sum(rows), byTag: { 衣: byTag('衣'), 食: byTag('食'), 住: byTag('住'), 行: byTag('行') },
    trend: recentMonths(month, 6).map(m => ({ label: `${Number(m.slice(5))}月`, month: m, amount: sum(expenses.filter(e => e.date.startsWith(m))) })) };
}
export type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
