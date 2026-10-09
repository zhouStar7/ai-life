export const TAGS = ['衣', '食', '住', '行'] as const;
export const SLOTS = ['早餐', '午餐', '晚餐', '加餐'] as const;
export const SCENES = ['回家', '离家', '睡眠', '影院'] as const;
export const ROUTES = ['/', '/wardrobe', '/diet', '/home', '/travel', '/spending', '/settings'];

export type Action =
  | { type: 'adopt_outfit'; itemIds: string[] }
  | { type: 'add_meal'; id?: string; slot: string; name: string; time: string; kcal: number; protein: number; carb: number; fat: number }
  | { type: 'apply_scene'; name: string }
  | { type: 'append_packing'; tripId: string; items: string[] }
  | { type: 'add_expense'; id?: string; tag: string; amount: number; date: string; merchant: string; note: string }
  | { type: 'handle_alert'; id: string };

export const CROSS_ACTIONS: Action[] = [
  { type: 'adopt_outfit', itemIds: ['w1', 'w2', 'w3'] },
  { type: 'add_meal', id: 'm-cross', slot: '午餐', name: '鸡胸温蔬藜麦', time: '12:40', kcal: 550, protein: 45, carb: 48, fat: 14 },
  { type: 'apply_scene', name: '离家' },
  { type: 'append_packing', tripId: 't-bj', items: ['防风风衣', '保暖内胆'] },
  { type: 'add_expense', id: 'e-cross', tag: '行', amount: 2400, date: '2026-09-22', merchant: '差旅专账', note: '技术交流会' },
  { type: 'handle_alert', id: 'a-filter' },
];

export function parseActions(value: unknown): Action[] {
  if (!Array.isArray(value)) return [];
  const actions: Action[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (row.type === 'adopt_outfit' && Array.isArray(row.itemIds)) {
      actions.push({ type: 'adopt_outfit', itemIds: row.itemIds.filter((id): id is string => typeof id === 'string') });
    } else if (row.type === 'add_meal' && typeof row.name === 'string' && SLOTS.includes(row.slot as (typeof SLOTS)[number])) {
      actions.push({
        type: 'add_meal',
        id: typeof row.id === 'string' ? row.id : undefined,
        slot: String(row.slot),
        name: row.name,
        time: typeof row.time === 'string' ? row.time : '12:30',
        kcal: Number(row.kcal) || 0,
        protein: Number(row.protein) || 0,
        carb: Number(row.carb) || 0,
        fat: Number(row.fat) || 0,
      });
    } else if (row.type === 'apply_scene' && SCENES.includes(row.name as (typeof SCENES)[number])) {
      actions.push({ type: 'apply_scene', name: String(row.name) });
    } else if (row.type === 'append_packing' && typeof row.tripId === 'string' && Array.isArray(row.items)) {
      actions.push({
        type: 'append_packing',
        tripId: row.tripId,
        items: row.items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
      });
    } else if (row.type === 'add_expense' && TAGS.includes(row.tag as (typeof TAGS)[number]) && Number(row.amount) > 0) {
      actions.push({
        type: 'add_expense',
        id: typeof row.id === 'string' ? row.id : undefined,
        tag: String(row.tag),
        amount: Math.round(Number(row.amount)),
        date: typeof row.date === 'string' ? row.date : '2026-09-22',
        merchant: typeof row.merchant === 'string' ? row.merchant : '手动记账',
        note: typeof row.note === 'string' ? row.note : '',
      });
    } else if (row.type === 'handle_alert' && typeof row.id === 'string') {
      actions.push({ type: 'handle_alert', id: row.id });
    }
  }
  return actions;
}
