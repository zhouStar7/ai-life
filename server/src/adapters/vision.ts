import { extractJson } from '../json.js';
import { complete, type ModelConfig } from './model.js';

export const CATEGORIES = ['上衣', '裤装', '裙装', '外套', '鞋包'] as const;
export type WardrobeCategory = (typeof CATEGORIES)[number];

export type ClothingDraft = {
  name: string;
  category: WardrobeCategory;
  season: string;
  color: string;
  occasion: string;
};

const PROMPT = '看这张衣服照片，只返回 JSON：{"name":"","category":"上衣","color":"","season":"四季","style":""}。category 只能是上衣、裤装、裙装、外套、鞋包。color 用中文颜色。style 是风格，例如通勤、休闲、正式、运动、约会。';

export function clothingFromModel(content: string): ClothingDraft | null {
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const category = typeof row.category === 'string' && CATEGORIES.includes(row.category as WardrobeCategory)
    ? row.category as WardrobeCategory
    : null;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const color = typeof row.color === 'string' ? row.color.trim() : '';
  if (!category || !name || !color) return null;
  const style = typeof row.style === 'string' && row.style.trim()
    ? row.style.trim()
    : typeof row.occasion === 'string' ? row.occasion.trim() : '';
  return {
    name,
    category,
    color,
    season: typeof row.season === 'string' && row.season.trim() ? row.season.trim() : '四季',
    occasion: style || '通勤',
  };
}

export async function recognizeClothing(config: ModelConfig, image: string) {
  const content = await complete(config, [
    { role: 'system', content: PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '识别这一件衣服的分类、颜色和风格。' },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ]);
  return clothingFromModel(content);
}
