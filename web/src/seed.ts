import type {
  Budgets,
  Device,
  Expense,
  HomeAlert,
  Meal,
  NoticePrefs,
  NutritionTarget,
  Outfit,
  OutfitSuggestion,
  Recipe,
  Trip,
  WardrobeItem,
} from './types';

export const SEED_ITEMS: WardrobeItem[] = [
  { id: 'w1', name: '白色牛津衬衫', category: '上衣', season: '春夏', color: '白色', occasion: '通勤', wears: 12, createdAt: '2026-08-02' },
  { id: 'w2', name: '深蓝直筒牛仔裤', category: '裤装', season: '四季', color: '深蓝', occasion: '日常', wears: 28, createdAt: '2026-03-11' },
  { id: 'w3', name: '米色风衣', category: '外套', season: '春秋', color: '米色', occasion: '外出', wears: 6, createdAt: '2026-09-01' },
  { id: 'w4', name: '白色运动鞋', category: '鞋包', season: '四季', color: '白色', occasion: '运动', wears: 19, createdAt: '2026-05-20' },
  { id: 'w5', name: '黑色乐福鞋', category: '鞋包', season: '四季', color: '黑色', occasion: '通勤', wears: 15, createdAt: '2026-04-18' },
  { id: 'w6', name: '碎花半身裙', category: '裙装', season: '夏', color: '碎花', occasion: '约会', wears: 4, createdAt: '2026-06-08' },
];

export const SEED_OUTFITS: Outfit[] = [
  { id: 'o1', name: '通勤简约', itemIds: ['w1', 'w2', 'w5'], favorite: true },
  { id: 'o2', name: '周末走动', itemIds: ['w1', 'w2', 'w4'], favorite: false },
  { id: 'o3', name: '春秋外出', itemIds: ['w3', 'w1', 'w2'], favorite: false },
];

export const SUGGESTIONS: OutfitSuggestion[] = [
  {
    title: '白衬衫 · 牛仔裤 · 乐福鞋',
    reason: '22°C 多云，通勤场合，透气不闷。',
    itemIds: ['w1', 'w2', 'w5'],
    weather: true,
  },
  {
    title: '米色风衣 · 白衬衫 · 牛仔裤',
    reason: '22°C 多云，早晚微凉，加一件外套更稳妥。',
    itemIds: ['w3', 'w1', 'w2'],
    weather: true,
  },
  {
    title: '白衬衫 · 牛仔裤 · 运动鞋',
    reason: '没拿到天气，先按通勤场合推荐一套方便走动的。',
    itemIds: ['w1', 'w2', 'w4'],
    weather: false,
  },
];

export const SEED_MEALS: Meal[] = [
  { id: 'm1', slot: '早餐', name: '燕麦酸奶碗', time: '08:20', date: '2026-09-22', kcal: 360, protein: 18, carb: 52, fat: 12 },
  { id: 'm2', slot: '午餐', name: '香煎鸡胸沙拉', time: '12:30', date: '2026-09-22', kcal: 480, protein: 40, carb: 48, fat: 18 },
  { id: 'm3', slot: '加餐', name: '希腊酸奶', time: '16:00', date: '2026-09-22', kcal: 140, protein: 10, carb: 45, fat: 12 },
];

export const SEED_RECIPES: Recipe[] = [
  { id: 'r1', name: '鸡胸肉沙拉', tags: ['减脂', '快手'], slot: '晚餐', kcal: 420, protein: 42, carb: 18, fat: 16 },
  { id: 'r2', name: '番茄牛腩面', tags: ['快手'], slot: '午餐', kcal: 680, protein: 32, carb: 78, fat: 22 },
  { id: 'r3', name: '燕麦酸奶碗', tags: ['减脂', '早餐'], slot: '早餐', kcal: 360, protein: 18, carb: 52, fat: 12 },
  { id: 'r4', name: '清炒时蔬', tags: ['自炊', '少油'], slot: '晚餐', kcal: 210, protein: 8, carb: 22, fat: 9 },
];

export const SEED_TARGETS: NutritionTarget = { kcal: 1800, protein: 120, carb: 200, fat: 60 };

export const SEED_DEVICES: Device[] = [
  { id: 'd1', name: '客厅主灯', room: '客厅', kind: '灯', on: true, paramLabel: '亮度', paramValue: '70%' },
  { id: 'd2', name: '客厅空调', room: '客厅', kind: '空调', on: true, paramLabel: '温度', paramValue: '24°C' },
  { id: 'd3', name: '客厅窗帘', room: '客厅', kind: '窗帘', on: true, paramLabel: '开合', paramValue: '40%' },
  { id: 'd4', name: '客厅电视', room: '客厅', kind: '电视', on: false },
  { id: 'd5', name: '卧室灯', room: '卧室', kind: '灯', on: false, paramLabel: '亮度', paramValue: '关' },
  { id: 'd6', name: '卧室空调', room: '卧室', kind: '空调', on: true, paramLabel: '温度', paramValue: '26°C' },
  { id: 'd7', name: '卧室传感器', room: '卧室', kind: '传感器', on: false, offline: true, paramLabel: '最后温度', paramValue: '26°C' },
  { id: 'd8', name: '厨房灯', room: '厨房', kind: '灯', on: true, paramLabel: '亮度', paramValue: '100%' },
  { id: 'd9', name: '净水器', room: '厨房', kind: '净水', on: true, paramLabel: '滤芯', paramValue: '8%' },
  { id: 'd10', name: '冰箱', room: '厨房', kind: '家电', on: true, paramLabel: '冷藏', paramValue: '4°C' },
  { id: 'd11', name: '阳台灯', room: '阳台', kind: '灯', on: false, paramLabel: '电量', paramValue: '15%' },
  { id: 'd12', name: '入户门锁', room: '玄关', kind: '门锁', on: true, paramLabel: '状态', paramValue: '已上锁' },
];

export const SEED_ALERTS: HomeAlert[] = [
  { id: 'a-filter', level: '高', title: '净水器滤芯剩余 8%', detail: '预计一周内用完，更换大约 ¥298。', handled: false },
  { id: 'a-offline', level: '中', title: '卧室传感器离线', detail: '已保留最后读数 26°C，恢复联网前不要依赖它。', handled: false },
  { id: 'a-battery', level: '低', title: '阳台灯电量 15%', detail: '还能用几个晚上，记得充电。', handled: false },
];

export const SEED_TRIPS: Trip[] = [
  {
    id: 't-hz',
    title: '杭州周末',
    status: '进行中',
    transport: '高铁',
    dateLabel: '9月20日 – 9月22日',
    tickets: [
      { label: '高铁 G7321', status: '已出票' },
      { label: '西湖边酒店', status: '已入住' },
    ],
    timeline: [
      { time: '09-20 08:12', title: '出发', detail: '上海虹桥 → 杭州东' },
      { time: '09-20 12:00', title: '入住', detail: '西湖边酒店' },
      { time: '09-21', title: '市区', detail: '步行与餐饮' },
      { time: '09-22 18:40', title: '返程', detail: '杭州东 → 上海虹桥' },
    ],
    packing: [
      { id: 'p1', text: '身份证', done: true },
      { id: 'p2', text: '充电器', done: true },
      { id: 'p3', text: '换洗衣物', done: true },
      { id: 'p4', text: '雨伞', done: true },
    ],
    prepAdopted: true,
  },
  {
    id: 't-bj',
    title: '北京差旅',
    status: '即将开始',
    transport: '飞机',
    dateLabel: '9月28日 – 9月30日',
    tickets: [
      { label: '机票 CA1502', status: '已出票' },
      { label: '国贸酒店 两晚', status: '已确认' },
    ],
    timeline: [
      { time: '09-28 07:40', title: '出发', detail: '浦东机场 T2' },
      { time: '09-28 14:00', title: '入住', detail: '国贸酒店' },
      { time: '09-29 09:30', title: '会议', detail: '国贸三期' },
      { time: '09-30 19:10', title: '返程', detail: '首都机场' },
    ],
    packing: [
      { id: 'p5', text: '身份证', done: true },
      { id: 'p6', text: '充电器', done: true },
      { id: 'p7', text: '笔记本电脑', done: false },
      { id: 'p8', text: '换洗衣物', done: false },
      { id: 'p9', text: '洗漱包', done: false },
    ],
    prepAdopted: false,
  },
];

export const SEED_EXPENSES: Expense[] = [
  { id: 'e1', tag: '行', amount: 1680, date: '2026-09-01', merchant: '航旅纵横', note: '北京机票' },
  { id: 'e2', tag: '行', amount: 980, date: '2026-09-01', merchant: '国贸酒店', note: '两晚住宿' },
  { id: 'e3', tag: '衣', amount: 399, date: '2026-09-02', merchant: '优衣库', note: '白色牛津衬衫' },
  { id: 'e4', tag: '食', amount: 186, date: '2026-09-03', merchant: '盒马', note: '一周蔬菜' },
  { id: 'e5', tag: '住', amount: 320, date: '2026-09-04', merchant: '国家电网', note: '电费' },
  { id: 'e6', tag: '食', amount: 68, date: '2026-09-05', merchant: '美团', note: '午餐外卖' },
  { id: 'e7', tag: '食', amount: 42, date: '2026-09-06', merchant: '星巴克', note: '美式' },
  { id: 'e8', tag: '住', amount: 86, date: '2026-09-07', merchant: '自来水公司', note: '水费' },
  { id: 'e9', tag: '衣', amount: 86, date: '2026-09-08', merchant: '社区洗衣', note: '衬衫护理' },
  { id: 'e10', tag: '食', amount: 328, date: '2026-09-09', merchant: '盒马', note: '肉蛋奶' },
  { id: 'e11', tag: '行', amount: 334, date: '2026-09-10', merchant: '中石化', note: '加油' },
  { id: 'e12', tag: '食', amount: 56, date: '2026-09-11', merchant: '美团', note: '晚餐外卖' },
  { id: 'e13', tag: '住', amount: 298, date: '2026-09-12', merchant: '滤芯店', note: '净水器滤芯' },
  { id: 'e14', tag: '食', amount: 780, date: '2026-09-13', merchant: '街角小馆', note: '周末聚餐' },
  { id: 'e15', tag: '衣', amount: 795, date: '2026-09-14', merchant: '小李皮鞋', note: '黑色乐福鞋' },
  { id: 'e16', tag: '住', amount: 156, date: '2026-09-15', merchant: '燃气公司', note: '燃气费' },
  { id: 'e17', tag: '食', amount: 199, date: '2026-09-16', merchant: '食材盒子', note: '月度订阅' },
  { id: 'e18', tag: '食', amount: 801, date: '2026-09-18', merchant: '盒马', note: '补货' },
  { id: 'e19', tag: '行', amount: 126, date: '2026-09-20', merchant: '滴滴', note: '杭州站接送' },
];

export const SEED_BUDGETS: Budgets = { total: 10000, 衣: 2000, 食: 3000, 住: 1500, 行: 3500 };

export const SEED_NOTICES: NoticePrefs = { outfit: true, budget: true, device: true };

export const PAST_TREND = [
  { label: '4月', amount: 5820 },
  { label: '5月', amount: 6940 },
  { label: '6月', amount: 5310 },
  { label: '7月', amount: 8120 },
  { label: '8月', amount: 6480 },
];

export const TAG_COLOR: Record<string, string> = {
  衣: '#0D9488',
  食: '#D97706',
  住: '#2563EB',
  行: '#7C3AED',
};
