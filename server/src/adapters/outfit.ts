import { extractJson } from '../json.js';
import { planOutfit, type ClosetItem } from '../wardrobePlan.js';
import { complete, type ModelConfig } from './model.js';

export type OutfitSuggestion = {
  title: string;
  reason: string;
  itemIds: string[];
  unworn: string[];
  source: 'model' | 'rules';
};

const PROMPT = '你是穿搭助手。只从给出的单品 id 里选一套今天能穿的，只返回 JSON：{"itemIds":[""],"reason":""}。一套尽量有一件上衣、一件裤装或裙装、一件鞋包。气温低于 18 度，或天气里有雨、冷、降温时，加上外套。优先穿过次数少的。reason 用一两句中文，写上天气，并点名穿过不超过 4 次的单品。';

export function outfitFromModel(content: string, items: ClosetItem[]) {
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const rawIds = Array.isArray(row.itemIds) ? row.itemIds.filter((id): id is string => typeof id === 'string') : [];
  const known = new Map(items.map((item) => [item.id, item]));
  const picked: ClosetItem[] = [];
  const seen = new Set<string>();
  for (const id of rawIds) {
    const item = known.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    picked.push(item);
  }
  if (picked.length === 0) return null;
  const unworn = picked.filter((item) => item.wears <= 4);
  const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
  return {
    title: picked.map((item) => item.name).join(' · '),
    reason: reason || (unworn.length > 0 ? `久未穿着：${unworn.map((item) => item.name).join('、')}` : '按当前衣橱配的一套'),
    itemIds: picked.map((item) => item.id),
    unworn: unworn.map((item) => item.name),
  };
}

export async function suggestOutfit(
  config: ModelConfig | null,
  items: ClosetItem[],
  index: number,
  weatherOn: boolean,
  weatherLabel: string,
  avoid: string[] = [],
): Promise<OutfitSuggestion> {
  const rules: OutfitSuggestion = { ...planOutfit(items, index, weatherOn, weatherLabel), source: 'rules' };
  if (!config?.baseUrl || items.length === 0) return rules;
  try {
    const content = await complete(config, [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          weatherOn ? `天气：${weatherLabel}` : '天气：没有天气，按通勤场合来配',
          avoid.length > 0 ? `不要重复这套：${avoid.join('、')}` : `换一换序号：${index}`,
          items.map((item) => `${item.id} ${item.name} ${item.category} ${item.season} ${item.color} ${item.occasion} 穿过${item.wears}次`).join('\n'),
        ].join('\n'),
      },
    ]);
    const parsed = outfitFromModel(content, items);
    if (!parsed || sameIds(parsed.itemIds, avoid)) return rules;
    return { ...parsed, source: 'model' };
  } catch {
    return rules;
  }
}

function sameIds(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return false;
  return [...left].sort().join() === [...right].sort().join();
}
