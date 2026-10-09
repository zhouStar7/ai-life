import { CROSS_ACTIONS, parseActions, ROUTES, type Action } from './actions.js';
import { intentHref, intentKey, routeIntent, type Intent } from './router.js';

export type ArrangeResult = {
  key: string;
  title: string;
  lines: string[];
  href: string;
  actions: Action[];
  adopted: boolean;
};

const DEFAULT_LINES: Record<Intent, string[]> = {
  cross: [
    '衣：米色风衣、白衬衫、牛仔裤，适合下雨降温。',
    '食：午餐换成鸡胸温蔬藜麦，把蛋白质补上。',
    '住：出发前切换离家，灯和空调关掉。',
    '行：北京差旅的行李加上防风风衣和保暖内胆。',
    '支：记一笔差旅 ¥2,400，归到「行」。',
  ],
  outfit: ['按今天的天气和场合给一套可以穿的。'],
  meal: ['蛋白质还差的话，补一份鸡胸肉沙拉。'],
  home: ['滤芯提醒可以先记下，出门切到离家。'],
  travel: ['出发前沿用今天的穿搭，并切到离家。'],
  spend: ['支出按衣食住行分开看。'],
};

export function fallbackPlan(text: string, adoptedTips: string[]): ArrangeResult {
  const intent = routeIntent(text);
  const key = intentKey(intent);
  const actions = intent === 'cross' ? CROSS_ACTIONS : [];
  return {
    key,
    title: intent === 'cross' ? '衣食住行支已经串在一起' : '今天可以这样安排',
    lines: DEFAULT_LINES[intent],
    href: intentHref(intent),
    actions,
    adopted: adoptedTips.includes(key),
  };
}

export function planFromModel(text: string, content: string, adoptedTips: string[]): ArrangeResult {
  const intent = routeIntent(text);
  const parsed = extract(content);
  const modelActions = parseActions(parsed?.actions);
  const actions = intent === 'cross'
    ? (coversCross(modelActions) ? modelActions : CROSS_ACTIONS)
    : modelActions;
  const href = typeof parsed?.href === 'string' && ROUTES.includes(parsed.href) ? parsed.href : intentHref(intent);
  const lines = Array.isArray(parsed?.lines) ? parsed.lines.filter((line): line is string => typeof line === 'string' && line.trim().length > 0) : [];
  const key = intentKey(intent);
  return {
    key,
    title: typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '衣食住行支已经串在一起',
    lines: lines.length > 0 ? lines : DEFAULT_LINES[intent],
    href,
    actions,
    adopted: adoptedTips.includes(key),
  };
}

function coversCross(actions: Action[]) {
  const types = new Set(actions.map((action) => action.type));
  return types.has('adopt_outfit') && types.has('add_meal') && types.has('apply_scene') && types.has('append_packing') && types.has('add_expense');
}

function extract(content: string): { title?: string; lines?: unknown; href?: string; actions?: unknown } | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as { title?: string; lines?: unknown; href?: string; actions?: unknown };
  } catch {
    return null;
  }
}
