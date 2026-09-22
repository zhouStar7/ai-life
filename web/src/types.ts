export const SPEND_TAGS = ['衣', '食', '住', '行'] as const;
export type SpendTag = (typeof SPEND_TAGS)[number];

export const CATEGORIES = ['上衣', '裤装', '裙装', '外套', '鞋包'] as const;
export type WardrobeCategory = (typeof CATEGORIES)[number];

export const MEAL_SLOTS = ['早餐', '午餐', '晚餐', '加餐'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const ROOMS = ['客厅', '卧室', '厨房', '阳台', '玄关'] as const;
export type Room = (typeof ROOMS)[number];

export const SCENES = ['回家', '离家', '睡眠', '影院'] as const;
export type SceneName = (typeof SCENES)[number];

export type AlertLevel = '高' | '中' | '低';
export type TripStatus = '进行中' | '即将开始';

export interface WardrobeItem {
  id: string;
  name: string;
  category: WardrobeCategory;
  season: string;
  color: string;
  occasion: string;
  wears: number;
  createdAt: string;
}

export interface Outfit {
  id: string;
  name: string;
  itemIds: string[];
  favorite: boolean;
}

export interface OutfitSuggestion {
  title: string;
  reason: string;
  itemIds: string[];
  weather: boolean;
}

export interface Meal {
  id: string;
  slot: MealSlot;
  name: string;
  time: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}

export interface Recipe {
  id: string;
  name: string;
  tags: string[];
  slot: MealSlot;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}

export interface NutritionTarget {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}

export interface Device {
  id: string;
  name: string;
  room: Room;
  kind: '灯' | '空调' | '窗帘' | '电视' | '传感器' | '净水' | '家电' | '门锁';
  on: boolean;
  paramLabel?: string;
  paramValue?: string;
  offline?: boolean;
}

export interface HomeAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  handled: boolean;
}

export interface PackItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TripTicket {
  label: string;
  status: string;
}

export interface TripNode {
  time: string;
  title: string;
  detail: string;
}

export interface Trip {
  id: string;
  title: string;
  status: TripStatus;
  transport: string;
  dateLabel: string;
  tickets: TripTicket[];
  timeline: TripNode[];
  packing: PackItem[];
  prepAdopted: boolean;
}

export interface Expense {
  id: string;
  tag: SpendTag;
  amount: number;
  date: string;
  merchant: string;
  note: string;
}

export interface Budgets {
  total: number;
  衣: number;
  食: number;
  住: number;
  行: number;
}

export interface NoticePrefs {
  outfit: boolean;
  budget: boolean;
  device: boolean;
}

export interface Toast {
  id: string;
  message: string;
}
