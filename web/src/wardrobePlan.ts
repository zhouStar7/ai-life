import type { ClothingDraft, WardrobeCategory, WardrobeItem } from './types';

type ClosetItem = Pick<WardrobeItem, 'id' | 'name' | 'category' | 'season' | 'color' | 'occasion' | 'wears'>;

const LOW_WEAR = 4;
const COLORS = ['藏青色', '藏青', '深蓝色', '深蓝', '米白色', '米色', '白色', '黑色', '灰色', '红色', '蓝色', '绿色', '棕色', '粉色', '卡其', '碎花'];
const STYLES = ['通勤', '休闲', '正式', '运动', '约会'];
const SEASONS = ['春夏', '秋冬', '春秋', '四季', '夏', '冬', '春', '秋'];

export function blankDraft(): ClothingDraft {
  return { name: '', category: '上衣', season: '四季', color: '', occasion: '通勤' };
}

export function planOutfit(items: ClosetItem[], index: number, weatherOn: boolean, weatherLabel: string) {
  const temp = weatherOn ? temperature(weatherLabel) : null;
  const wantCoat = weatherOn && ((temp !== null && temp < 18) || /雨|冷|降温/.test(weatherLabel));
  const tops = ranked(items.filter((item) => item.category === '上衣'), temp, weatherOn);
  const bottoms = ranked(items.filter((item) => item.category === '裤装' || item.category === '裙装'), temp, weatherOn);
  const shoes = ranked(items.filter((item) => item.category === '鞋包'), temp, weatherOn);
  const coats = wantCoat ? ranked(items.filter((item) => item.category === '外套'), temp, weatherOn) : [];
  const combos: ClosetItem[][] = [];
  const coatChoices: Array<ClosetItem | null> = coats.length > 0 ? coats.slice(0, 3) : [null];
  for (const top of tops.slice(0, 4)) {
    for (const bottom of bottoms.slice(0, 4)) {
      for (const shoe of shoes.slice(0, 3)) {
        for (const coat of coatChoices) {
          combos.push([top, bottom, shoe, coat].filter((item): item is ClosetItem => item !== null));
        }
      }
    }
  }
  if (combos.length === 0 && items.length > 0) {
    combos.push([...items].sort(byWear).slice(0, 3));
  }
  combos.sort((a, b) => sumWears(a) - sumWears(b) || idsOf(a).localeCompare(idsOf(b)));
  const picked = combos.length > 0 ? combos[mod(index, combos.length)] : [];
  const unworn = picked.filter((item) => item.wears <= LOW_WEAR);
  const reason = [
    weatherOn ? (weatherLabel.trim() || '按当前天气来配') : '没拿到天气，按当前衣橱来配',
    unworn.length > 0 ? `久未穿着：${unworn.map((item) => item.name).join('、')}` : picked.length > 0 ? '这几件都穿过一阵了' : '衣橱里还没有能搭配的单品',
  ].join('。');
  return {
    title: picked.map((item) => item.name).join(' · '),
    reason,
    itemIds: picked.map((item) => item.id),
  };
}

export function similarItems<T extends { id: string; name: string; color: string; occasion: string }>(
  items: T[],
  draft: { name: string; color: string; occasion: string },
  excludeId?: string,
) {
  const name = draft.name.trim();
  const color = draft.color.trim();
  const style = draft.occasion.trim();
  return items.filter((item) => {
    if (excludeId && item.id === excludeId) return false;
    const closeName = name.length >= 2 && (item.name.includes(name) || name.includes(item.name));
    const sameColorStyle = Boolean(color && style && item.color === color && item.occasion === style);
    return closeName || sameColorStyle;
  });
}

export function draftsFromOrder(text: string): ClothingDraft[] {
  return text
    .split(/\n+/)
    .map((line) => draftFromLine(line.trim()))
    .filter((item): item is ClothingDraft => item !== null);
}

function draftFromLine(line: string): ClothingDraft | null {
  const cleaned = line
    .replace(/^(商品名称|商品|名称)\s*[:：]\s*/, '')
    .replace(/[¥￥]\s*\d+(?:\.\d+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /^(订单|合计|实付|运费|店铺|快递)/.test(cleaned)) return null;
  const category = categoryOf(cleaned);
  if (!category) return null;
  return {
    name: cleaned.slice(0, 40),
    category,
    color: COLORS.find((color) => cleaned.includes(color)) ?? '',
    occasion: STYLES.find((style) => cleaned.includes(style)) ?? '通勤',
    season: SEASONS.find((season) => cleaned.includes(season)) ?? '四季',
  };
}

function categoryOf(text: string): WardrobeCategory | null {
  if (/外套|大衣|风衣|羽绒/.test(text)) return '外套';
  if (/裙/.test(text)) return '裙装';
  if (/裤|牛仔/.test(text)) return '裤装';
  if (/鞋|靴|包/.test(text)) return '鞋包';
  if (/衬衫|上衣|T恤|针织|毛衣|卫衣/.test(text)) return '上衣';
  return null;
}

function ranked(items: ClosetItem[], temp: number | null, weatherOn: boolean) {
  const fit = items.filter((item) => seasonFits(item.season, temp, weatherOn));
  return [...(fit.length > 0 ? fit : items)].sort(byWear);
}

function seasonFits(season: string, temp: number | null, weatherOn: boolean) {
  if (!weatherOn || temp === null || !season || season.includes('四季')) return true;
  if (temp <= 10) return /冬|秋/.test(season);
  if (temp >= 26) return /夏/.test(season);
  return !season.includes('冬') || season.includes('秋');
}

function temperature(label: string) {
  const match = label.match(/(-?\d+)\s*°/);
  return match ? Number(match[1]) : null;
}

function byWear(a: ClosetItem, b: ClosetItem) {
  return a.wears - b.wears || a.id.localeCompare(b.id);
}

function sumWears(items: ClosetItem[]) {
  return items.reduce((sum, item) => sum + item.wears, 0);
}

function idsOf(items: ClosetItem[]) {
  return items.map((item) => item.id).join();
}

function mod(index: number, size: number) {
  return ((index % size) + size) % size;
}
