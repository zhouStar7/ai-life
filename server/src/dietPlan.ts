export const DIET_TODAY = '2026-09-22';

export type MealSlotName = '早餐' | '午餐' | '晚餐' | '加餐';

export type MealDraft = {
  slot: MealSlotName;
  name: string;
  time: string;
  date: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  note: string;
};

type Nutrition = { kcal: number; protein: number; carb: number; fat: number };

type Food = Nutrition & { name: string; keys: string[] };

type RecipeLike = Nutrition & { id?: string; name: string; slot?: string; tags?: string[] };

type MealLike = Nutrition & { date?: string | null };

const PORTIONS: Food[] = [
  { name: '燕麦酸奶碗', keys: ['燕麦酸奶碗', '燕麦碗'], kcal: 360, protein: 18, carb: 52, fat: 12 },
  { name: '希腊酸奶', keys: ['希腊酸奶'], kcal: 140, protein: 10, carb: 45, fat: 12 },
  { name: '鸡胸肉沙拉', keys: ['鸡胸肉沙拉', '鸡胸沙拉'], kcal: 420, protein: 42, carb: 18, fat: 16 },
  { name: '番茄牛腩面', keys: ['番茄牛腩面'], kcal: 680, protein: 32, carb: 78, fat: 22 },
  { name: '清炒时蔬', keys: ['清炒时蔬'], kcal: 210, protein: 8, carb: 22, fat: 9 },
  { name: '牛肉面', keys: ['牛肉面'], kcal: 550, protein: 24, carb: 70, fat: 16 },
  { name: '盖浇饭', keys: ['盖浇饭'], kcal: 650, protein: 25, carb: 80, fat: 20 },
  { name: '炒饭', keys: ['炒饭'], kcal: 550, protein: 15, carb: 75, fat: 18 },
  { name: '美式咖啡', keys: ['美式咖啡', '美式'], kcal: 5, protein: 0, carb: 1, fat: 0 },
  { name: '拿铁', keys: ['拿铁'], kcal: 180, protein: 8, carb: 14, fat: 9 },
  { name: '米饭', keys: ['米饭', '白饭'], kcal: 230, protein: 4, carb: 50, fat: 1 },
  { name: '面条', keys: ['面条', '拉面'], kcal: 400, protein: 12, carb: 70, fat: 6 },
  { name: '饺子', keys: ['饺子'], kcal: 450, protein: 18, carb: 50, fat: 18 },
  { name: '汉堡', keys: ['汉堡'], kcal: 520, protein: 25, carb: 45, fat: 26 },
  { name: '包子', keys: ['包子'], kcal: 220, protein: 8, carb: 30, fat: 7 },
  { name: '馒头', keys: ['馒头'], kcal: 220, protein: 7, carb: 45, fat: 1 },
  { name: '鸡蛋', keys: ['鸡蛋', '水煮蛋'], kcal: 80, protein: 7, carb: 1, fat: 5 },
  { name: '牛奶', keys: ['牛奶'], kcal: 150, protein: 8, carb: 12, fat: 8 },
  { name: '豆浆', keys: ['豆浆'], kcal: 80, protein: 6, carb: 8, fat: 3 },
  { name: '酸奶', keys: ['酸奶'], kcal: 120, protein: 8, carb: 14, fat: 4 },
  { name: '鸡胸', keys: ['鸡胸肉', '鸡胸'], kcal: 165, protein: 31, carb: 0, fat: 4 },
  { name: '苹果', keys: ['苹果'], kcal: 80, protein: 0, carb: 21, fat: 0 },
  { name: '香蕉', keys: ['香蕉'], kcal: 90, protein: 1, carb: 23, fat: 0 },
  { name: '面包', keys: ['面包'], kcal: 80, protein: 3, carb: 14, fat: 1 },
  { name: '咖啡', keys: ['咖啡'], kcal: 15, protein: 0, carb: 2, fat: 0 },
  { name: '白粥', keys: ['白粥', '粥'], kcal: 150, protein: 4, carb: 28, fat: 2 },
  { name: '时蔬', keys: ['时蔬'], kcal: 210, protein: 8, carb: 22, fat: 9 },
];

const COUNTS: Record<string, number> = {
  半: 0.5,
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function slotOf(text: string): { slot: MealSlotName; time: string } {
  if (/早餐|早上|清晨|早晨/.test(text)) return { slot: '早餐', time: '08:00' };
  if (/午餐|中午|午饭/.test(text)) return { slot: '午餐', time: '12:30' };
  if (/晚餐|晚上|晚饭/.test(text)) return { slot: '晚餐', time: '18:30' };
  if (/加餐|零食|下午茶|夜宵|下午/.test(text)) return { slot: '加餐', time: '16:00' };
  return { slot: '午餐', time: '12:30' };
}

function quantityBefore(text: string, index: number) {
  const window = text.slice(Math.max(0, index - 6), index);
  const matched = window.match(/(\d+(?:\.\d+)?|半|十|[一二两三四五六七八九])[碗份个杯盘根片顿只]*$/);
  if (!matched) return 1;
  const token = matched[1];
  if (/^\d/.test(token)) return Number(token) || 1;
  return COUNTS[token] ?? 1;
}

function formatQty(qty: number) {
  if (qty === 1) return '';
  if (qty === 0.5) return '半';
  if (qty === 2) return '两';
  return String(qty);
}

function round(value: number) {
  return Math.round(value);
}

export function estimateMeal(text: string, recipes: RecipeLike[] = []): MealDraft {
  const raw = text.trim();
  const when = slotOf(raw);
  const foods: Food[] = [
    ...recipes
      .filter((recipe) => recipe.name.trim())
      .map((recipe) => ({
        name: recipe.name,
        keys: [recipe.name],
        kcal: recipe.kcal,
        protein: recipe.protein,
        carb: recipe.carb,
        fat: recipe.fat,
      })),
    ...PORTIONS,
  ].sort((left, right) => longest(right) - longest(left));
  const taken = new Array<boolean>(raw.length).fill(false);
  const hits: Array<Nutrition & { name: string; qty: number }> = [];

  for (const food of foods) {
    const keys = [...food.keys].sort((left, right) => right.length - left.length);
    for (const key of keys) {
      if (!key) continue;
      let from = 0;
      while (from < raw.length) {
        const at = raw.indexOf(key, from);
        if (at < 0) break;
        const end = at + key.length;
        const overlap = taken.slice(at, end).some(Boolean);
        if (!overlap) {
          for (let index = at; index < end; index += 1) taken[index] = true;
          const qty = quantityBefore(raw, at);
          hits.push({
            name: food.name,
            qty,
            kcal: food.kcal * qty,
            protein: food.protein * qty,
            carb: food.carb * qty,
            fat: food.fat * qty,
          });
        }
        from = end;
      }
    }
  }

  if (hits.length === 0) {
    return {
      ...when,
      name: raw || '未命名',
      date: DIET_TODAY,
      kcal: 450,
      protein: 18,
      carb: 50,
      fat: 15,
      note: '没对上常见食物，按一份家常菜估，确认前可以改。',
    };
  }

  return {
    ...when,
    name: raw,
    date: DIET_TODAY,
    kcal: round(hits.reduce((sum, hit) => sum + hit.kcal, 0)),
    protein: round(hits.reduce((sum, hit) => sum + hit.protein, 0)),
    carb: round(hits.reduce((sum, hit) => sum + hit.carb, 0)),
    fat: round(hits.reduce((sum, hit) => sum + hit.fat, 0)),
    note: `按常见份量估算：${hits.map((hit) => `${formatQty(hit.qty)}${hit.name}`).join('、')}。确认前可以改。`,
  };
}

function longest(food: Food) {
  return food.keys.reduce((max, key) => Math.max(max, key.length), 0);
}

export function pickRecipe<T extends RecipeLike>(recipes: T[], meals: MealLike[], targets: { kcal: number; protein: number }): T | null {
  if (recipes.length === 0 || (targets.kcal <= 0 && targets.protein <= 0)) return null;
  const eatenKcal = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const eatenProtein = meals.reduce((sum, meal) => sum + meal.protein, 0);
  const kcalGap = targets.kcal > 0 ? targets.kcal - eatenKcal : null;
  const proteinGap = targets.protein > 0 ? targets.protein - eatenProtein : null;
  const kcalOpen = kcalGap === null || kcalGap > 0;
  const proteinOpen = proteinGap === null || proteinGap > 0;
  if (!kcalOpen && !proteinOpen) return null;

  let best: T | null = null;
  let bestScore = -Infinity;
  let bestOver = Infinity;
  let bestProtein = -1;
  for (const recipe of recipes) {
    const proteinHelp = proteinGap === null ? 0 : Math.min(recipe.protein, Math.max(proteinGap, 0));
    const room = kcalGap === null ? recipe.kcal : Math.max(kcalGap, 0);
    const over = kcalGap === null ? 0 : Math.max(0, recipe.kcal - room);
    const score = proteinHelp * 100 + Math.min(recipe.kcal, room) - over * 2;
    const better = score > bestScore || (score === bestScore && (over < bestOver || (over === bestOver && recipe.protein > bestProtein)));
    if (!better) continue;
    best = recipe;
    bestScore = score;
    bestOver = over;
    bestProtein = recipe.protein;
  }
  return best;
}

export function weekFromMeals(meals: MealLike[]) {
  const [year, month, day] = DIET_TODAY.split('-').map(Number);
  const end = new Date(year, month - 1, day);
  const days: { date: string; label: string; kcal: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const current = new Date(end);
    current.setDate(end.getDate() - offset);
    const date = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    const kcal = meals.reduce((sum, meal) => sum + ((meal.date || DIET_TODAY) === date ? meal.kcal : 0), 0);
    days.push({ date, label: String(current.getDate()), kcal });
  }
  return days;
}

export function mealDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : DIET_TODAY;
}

export function recipeTags(value: unknown) {
  const source = Array.isArray(value) ? value.map((tag) => String(tag)) : String(value ?? '').split(/[,，、\s]+/);
  return source.map((tag) => tag.trim()).filter(Boolean);
}
