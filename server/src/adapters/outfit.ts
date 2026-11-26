import { extractJson } from '../json.js';
import { planOutfit, type ClosetItem } from '../wardrobePlan.js';
import { complete, type ModelConfig } from './model.js';

const PROMPT = '你是穿搭助手。只从给出的单品 id 里选一套今天能穿的，只返回 JSON：{"itemIds":[""],"reason":""}。一套尽量有一件上衣、一件裤装或裙装、一件鞋包。气温低于 18 度，或天气里有雨、冷、降温时，加上外套。优先穿过次数少的。reason 用一两句中文，点名穿过不超过 4 次的单品。';

export function outfitFromModel(content: string, items: ClosetItem[]) {
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { itemIds, reason } = parsed as Record<string, unknown>;
  if (!Array.isArray(itemIds)) return null;
  const known = new Map(items.map((item) => [item.id, item]));
  const picked = [...new Set(itemIds)].map((id) => known.get(id)).filter((item): item is ClosetItem => Boolean(item));
  if (picked.length === 0) return null;
  const unworn = picked.filter((item) => item.wears <= 4).map((item) => item.name);
  return {
    title: picked.map((item) => item.name).join(' · '),
    reason: (typeof reason === 'string' && reason.trim().slice(0, 300)) || (unworn.length ? `久未穿着：${unworn.join('、')}` : '按当前衣橱配的一套'),
    itemIds: picked.map((item) => item.id),
    unworn,
  };
}

export async function suggestOutfit(config: ModelConfig | null, items: ClosetItem[], index: number, weatherOn: boolean, weatherLabel: string, avoid: string[] = []) {
  const rules = { ...planOutfit(items, index, weatherOn, weatherLabel), source: 'rules' as const };
  if (!config?.baseUrl || items.length === 0) return rules;
  const avoidIds = new Set(items.filter((item) => avoid.includes(item.id)).map((item) => item.id));
  try {
    const content = await complete(config, [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          weatherOn ? `天气：${weatherLabel}` : '天气：没有天气，按通勤场合来配',
          avoidIds.size ? `不要重复这套：${[...avoidIds].join('、')}` : `换一换序号：${index}`,
          ...items.map(({ id, name, category, season, color, occasion, wears }) => `${id} ${name} ${category} ${season} ${color} ${occasion} 穿过${wears}次`),
        ].join('\n'),
      },
    ]);
    const parsed = outfitFromModel(content, items);
    if (!parsed || (parsed.itemIds.length === avoidIds.size && parsed.itemIds.every((id) => avoidIds.has(id)))) return rules;
    return { ...parsed, source: 'model' as const };
  } catch {
    return rules;
  }
}
