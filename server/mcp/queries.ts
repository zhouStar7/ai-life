import { DatabaseSync } from 'node:sqlite';
import { readJson } from '../src/ids.js';
import { localDate } from '../src/localDate.js';
import { centsToYuan } from '../src/money.js';
import { planOutfit, type ClosetItem } from '../src/wardrobePlan.js';
import { defaultSpendingMonth, spendingSummary } from '../../shared/spending.js';

export function openReadOnly(filename: string) {
  return new DatabaseSync(filename, { readOnly: true });
}

export function outfit(db: DatabaseSync, memberId = 'local') {
  const state = db.prepare(`SELECT member.suggestionIndex, session.weatherOn, session.weatherLabel
    FROM MemberState member JOIN SessionState session ON session.id = 'local'
    WHERE member.memberId = ?`).get(memberId);
  if (!state) throw new Error('Missing session');
  const items = db.prepare(`SELECT id, name, category, season, color, occasion, wears
    FROM WardrobeItem WHERE memberId = ?`).all(memberId);
  return planOutfit(items as ClosetItem[], Number(state.suggestionIndex), Boolean(state.weatherOn), String(state.weatherLabel));
}

export function packing(db: DatabaseSync, tripId?: string, memberId = 'local') {
  const trip = db.prepare(`SELECT id, title, packing FROM Trip
    WHERE memberId = ? AND id = COALESCE(?, (SELECT activeTripId FROM MemberState WHERE memberId = ?))`)
    .get(memberId, tripId ?? null, memberId);
  if (!trip) return null;
  const items = readJson<{ text: string; done: boolean }[]>(String(trip.packing), []);
  return { tripId: trip.id, title: trip.title, items: items.map(({ text, done }) => ({ text: String(text), done: Boolean(done) })) };
}

export function budget(db: DatabaseSync, month = defaultSpendingMonth(localDate(), process.env.AI_LIFE_MODE === 'demo'), memberId = 'local') {
  const limits = db.prepare(`SELECT totalCents, clothCents, foodCents, homeCents, tripCents
    FROM Budget WHERE memberId = ?`);
  limits.setReadBigInts(true);
  const row = limits.get(memberId) as Record<string, bigint> | undefined;
  if (!row) throw new Error('Missing budget');
  const expenses = db.prepare(`SELECT date, tag, amountCents FROM Expense
    WHERE memberId = ? AND date BETWEEN date(?, '-5 months') AND ?`);
  expenses.setReadBigInts(true);
  const rows = expenses.all(memberId, `${month}-01`, `${month}-31`) as { date: string; tag: string; amountCents: bigint }[];
  const summary = spendingSummary(rows, month, expense => expense.amountCents);
  const budgets = { total: centsToYuan(row.totalCents), 衣: centsToYuan(row.clothCents), 食: centsToYuan(row.foodCents), 住: centsToYuan(row.homeCents), 行: centsToYuan(row.tripCents) };
  return { ...summary, budgets, remaining: Math.round((budgets.total - summary.monthTotal) * 100) / 100 };
}
