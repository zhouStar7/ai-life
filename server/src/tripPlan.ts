export type WardrobePick = {
  id: string;
  name: string;
  category: string;
  season: string;
  occasion: string;
};

export type MealPick = {
  slot: string;
  name: string;
  time: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
};

const COLD_CITIES = ['哈尔滨', '长春', '沈阳'];
const HOT_CITIES = ['广州', '深圳', '三亚', '海口'];

export function destinationOf(title: string, details: string[]) {
  const known = ['北京', '上海', '杭州', '广州', '深圳', '成都', '哈尔滨', '长春', '沈阳', '三亚', '海口'];
  const text = [title, ...details].join(' ');
  return known.find((city) => text.includes(city)) ?? '';
}

export function pickTravelOutfit(items: WardrobePick[], destination: string, weatherLabel: string, weatherOn: boolean) {
  const temp = weatherOn ? Number(weatherLabel.match(/-?\d+/)?.[0]) : null;
  const rainy = weatherOn && /雨/.test(weatherLabel);
  const cold = weatherOn && (rainy || COLD_CITIES.some((city) => destination.includes(city)) || (temp !== null && temp <= 16));
  const hot = weatherOn && !rainy && (HOT_CITIES.some((city) => destination.includes(city)) || (temp !== null && temp >= 28));
  const top = find(items, '上衣', ['通勤', '外出']) ?? find(items, '上衣');
  const bottom = find(items, '裤装') ?? (!cold ? find(items, '裙装') : undefined);
  const shoes = find(items, '鞋包', cold || !hot ? ['通勤', '外出'] : ['运动', '日常', '通勤']) ?? find(items, '鞋包');
  const coat = cold ? find(items, '外套') : undefined;
  const picked = unique([coat, top, bottom, shoes]);
  const place = destination || '这次出行';
  const reason = weatherOn
    ? `${place}，${weatherLabel}，从当前衣橱按目的地和天气选了这几件。`
    : `${place}，没拿到天气，按通勤场合从当前衣橱里选。`;
  return {
    title: picked.length > 0 ? picked.map((item) => item.name).join(' · ') : '衣橱里还没有能配的单品',
    reason,
    itemIds: picked.map((item) => item.id),
  };
}

export function suggestTripMeal(recipes: Array<Omit<MealPick, 'time'> & { time?: string }>, eaten: string[]): MealPick {
  const owned = new Set(eaten);
  const fresh = recipes.filter((recipe) => !owned.has(recipe.name));
  const pool = fresh.length > 0 ? fresh : recipes;
  const light = pool.filter((recipe) => recipe.kcal <= 550);
  const picked = light.find((recipe) => recipe.slot === '午餐')
    ?? light.slice().sort((a, b) => b.protein - a.protein)[0]
    ?? pool[0];
  return { ...picked, time: picked.time || '12:30' };
}

export function mealReason(meal: MealPick, destination: string) {
  const place = destination || '途中';
  return `${place}可以吃「${meal.name}」，确认后记进今天的${meal.slot}。`;
}

function find(items: WardrobePick[], category: string, occasions?: string[]) {
  const rows = items.filter((item) => item.category === category);
  if (!occasions) return rows[0];
  return rows.find((item) => occasions.includes(item.occasion)) ?? rows[0];
}

function unique(items: Array<WardrobePick | undefined>) {
  const seen = new Set<string>();
  return items.filter((item): item is WardrobePick => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
