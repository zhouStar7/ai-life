import { extractJson } from '../json.js';
import { complete, type ModelConfig } from './model.js';

export const TAGS = ['衣', '食', '住', '行'] as const;
export type SpendTag = (typeof TAGS)[number];

export type BillDraft = {
  tag: SpendTag | null;
  amount: number;
  date: string;
  merchant: string;
  note: string;
};

const RULES: { tag: SpendTag; words: string[] }[] = [
  { tag: '衣', words: ['衣', '鞋', '洗衣', '干洗', '优衣库', '服装', '穿搭', '服饰', '装扮', '皮包', '手袋'] },
  { tag: '住', words: ['电费', '水费', '燃气', '滤芯', '家具', '家电', '房租', '物业', '水电', '国家电网', '自来水', '居家'] },
  { tag: '行', words: ['机票', '高铁', '酒店', '滴滴', '打车', '加油', '铁路', '火车', '地铁', '出租', '航旅', '车票', '交通', '出行', '住宿'] },
  { tag: '食', words: ['餐', '外卖', '美团', '饿了么', '菜', '咖啡', '饭', '食', '超市', '星巴克', '买菜', '餐饮', '美食', '盒马', '面包'] },
];

const HEADER: Record<string, 'date' | 'merchant' | 'note' | 'amount' | 'direction' | 'tag' | 'kind'> = {
  交易时间: 'date',
  日期: 'date',
  date: 'date',
  交易对方: 'merchant',
  商户: 'merchant',
  对方: 'merchant',
  merchant: 'merchant',
  商品: 'note',
  商品说明: 'note',
  备注: 'note',
  note: 'note',
  金额: 'amount',
  '金额(元)': 'amount',
  amount: 'amount',
  '收/支': 'direction',
  收支: 'direction',
  分类: 'tag',
  交易分类: 'kind',
  交易类型: 'kind',
  tag: 'tag',
};

const PROMPT = '读这张账单截图，只返回 JSON：{"rows":[{"date":"2026-09-18","merchant":"","amount":1,"note":"","tag":"食","direction":"支出"}]}。tag 只能是衣、食、住、行。收入和退款不要放进行列。';

export function isTag(value: unknown): value is SpendTag {
  return typeof value === 'string' && (TAGS as readonly string[]).includes(value);
}

export function classifySpend(text: string): SpendTag | null {
  const hay = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((word) => hay.includes(word.toLowerCase()))) return rule.tag;
  }
  return null;
}

export function parseCsv(csv: string): BillDraft[] {
  const table = parseTable(csv);
  const header = findHeader(table);
  if (!header) return [];
  const rows: BillDraft[] = [];
  for (const cells of table.slice(header.index + 1)) {
    const draft = rowFromCells(cells, header.map);
    if (draft) rows.push(draft);
  }
  return rows;
}

export function billsFromModel(content: string): BillDraft[] {
  const parsed = extractJson(content);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : [];
  const rows: BillDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (isIncome(typeof row.direction === 'string' ? row.direction : '')) continue;
    const merchant = typeof row.merchant === 'string' ? row.merchant.trim() : '';
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const amount = normalizeAmount(row.amount);
    if (!merchant || amount <= 0) continue;
    const explicit = typeof row.tag === 'string' ? row.tag.trim() : '';
    rows.push({
      tag: asTag(explicit) ?? classifySpend(`${merchant} ${note}`),
      amount,
      date: normalizeDate(typeof row.date === 'string' ? row.date : ''),
      merchant,
      note: note || '账单导入',
    });
  }
  return rows;
}

export async function recognizeBill(config: ModelConfig, image: string) {
  const content = await complete(config, [
    { role: 'system', content: PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '把截图里的支出整理成衣食住行。' },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ]);
  return billsFromModel(content);
}

function parseTable(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((item) => item)) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((item) => item)) rows.push(row);
  return rows;
}

function findHeader(table: string[][]) {
  for (let index = 0; index < Math.min(table.length, 40); index += 1) {
    const map: Record<number, (typeof HEADER)[string]> = {};
    table[index].forEach((cell, cellIndex) => {
      const key = cell.replace(/\s/g, '');
      const field = HEADER[key] ?? (key.startsWith('金额') ? 'amount' : undefined);
      if (field) map[cellIndex] = field;
    });
    const fields = new Set(Object.values(map));
    if (fields.has('amount') && (fields.has('merchant') || fields.has('note'))) return { index, map };
  }
  return null;
}

function rowFromCells(cells: string[], map: Record<number, (typeof HEADER)[string]>): BillDraft | null {
  const picked: Partial<Record<(typeof HEADER)[string], string>> = {};
  for (const [index, field] of Object.entries(map)) picked[field] = cells[Number(index)] ?? '';
  if (isIncome(picked.direction ?? '')) return null;
  const merchant = (picked.merchant || picked.note || '').trim();
  const note = (picked.note || '').trim();
  const amount = normalizeAmount(picked.amount ?? '');
  if (!merchant || amount <= 0) return null;
  const blob = `${merchant} ${note} ${picked.kind ?? ''} ${picked.tag ?? ''}`;
  return {
    tag: asTag(picked.tag ?? '') ?? classifySpend(blob),
    amount,
    date: normalizeDate(picked.date ?? ''),
    merchant,
    note: note || '账单导入',
  };
}

function asTag(value: string): SpendTag | null {
  return TAGS.includes(value as SpendTag) ? value as SpendTag : null;
}

function isIncome(value: string) {
  const text = value.trim();
  if (!text) return false;
  return text !== '支出';
}

function normalizeAmount(value: unknown) {
  const cleaned = String(value ?? '').replace(/[¥￥,\s+]/g, '');
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount);
}

function normalizeDate(value: string) {
  const match = value.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return '2026-09-22';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}
