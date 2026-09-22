import { useMemo, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { itemNames, uid } from './format';
import {
  SEED_ALERTS,
  SEED_BUDGETS,
  SEED_DEVICES,
  SEED_EXPENSES,
  SEED_ITEMS,
  SEED_MEALS,
  SEED_NOTICES,
  SEED_OUTFITS,
  SEED_RECIPES,
  SEED_TARGETS,
  SEED_TRIPS,
  SUGGESTIONS,
} from './seed';
import type {
  Budgets,
  Device,
  Expense,
  HomeAlert,
  Meal,
  NoticePrefs,
  NutritionTarget,
  Outfit,
  Recipe,
  SceneName,
  Toast,
  Trip,
  WardrobeItem,
} from './types';

interface StoreValue {
  items: WardrobeItem[];
  outfits: Outfit[];
  suggestionIndex: number;
  weatherOn: boolean;
  outfitAdopted: boolean;
  activeOutfitId: string | null;
  meals: Meal[];
  recipes: Recipe[];
  targets: NutritionTarget;
  devices: Device[];
  alerts: HomeAlert[];
  activeScene: SceneName | null;
  trips: Trip[];
  activeTripId: string;
  expenses: Expense[];
  budgets: Budgets;
  notices: NoticePrefs;
  adoptedTips: string[];
  toasts: Toast[];
  addItem: (input: Omit<WardrobeItem, 'id' | 'wears' | 'createdAt'>) => void;
  updateItem: (item: WardrobeItem) => void;
  removeItem: (id: string) => void;
  toggleFavorite: (id: string) => void;
  applyOutfit: (id: string) => void;
  saveSuggestion: () => void;
  adoptOutfitSuggestion: () => void;
  refreshSuggestion: () => void;
  toggleWeather: () => void;
  addMeal: (input: Omit<Meal, 'id'>) => void;
  updateMeal: (meal: Meal) => void;
  removeMeal: (id: string) => void;
  applyRecipe: (id: string) => void;
  setTargets: (targets: NutritionTarget) => void;
  toggleDevice: (id: string) => void;
  unbindDevice: (id: string) => void;
  bindSampleDevices: () => void;
  applyScene: (name: SceneName) => void;
  handleAlert: (id: string) => void;
  selectTrip: (id: string) => void;
  togglePack: (tripId: string, packId: string) => void;
  addTrip: (input: Pick<Trip, 'title' | 'status' | 'transport' | 'dateLabel'>) => void;
  removeTrip: (id: string) => void;
  adoptPrep: (tripId: string) => void;
  addExpense: (input: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;
  setBudgets: (budgets: Budgets) => void;
  setNotice: (key: keyof NoticePrefs, value: boolean) => void;
  adoptProteinTip: () => void;
  adoptFilterTip: () => void;
  executeCrossPlan: () => void;
  markTip: (id: string) => void;
  suggestion: { title: string; reason: string; itemIds: string[] };
}

const StoreContext = createContext<StoreValue | null>(null);

function cloneDevices() {
  return SEED_DEVICES.map((device) => ({ ...device }));
}

function nextDevice(device: Device, scene: SceneName): Device {
  if (device.offline) return device;
  if (scene === '离家') {
    if (device.kind === '灯' || device.kind === '空调' || device.kind === '电视') {
      return { ...device, on: false };
    }
    return device;
  }
  if (scene === '回家') {
    if (device.kind === '灯') return { ...device, on: true, paramValue: device.paramLabel === '亮度' ? '70%' : device.paramValue };
    if (device.kind === '空调' && device.room === '客厅') return { ...device, on: true, paramValue: '24°C' };
    if (device.kind === '电视') return { ...device, on: false };
    return device;
  }
  if (scene === '睡眠') {
    if (device.kind === '灯' || device.kind === '电视') return { ...device, on: false };
    if (device.kind === '空调' && device.room === '客厅') return { ...device, on: false };
    if (device.kind === '空调' && device.room === '卧室') return { ...device, on: true, paramValue: '26°C' };
    return device;
  }
  if (device.room === '客厅' && device.kind === '灯') return { ...device, on: true, paramValue: '15%' };
  if (device.room === '客厅' && device.kind === '窗帘') return { ...device, on: true, paramValue: '闭合' };
  if (device.room === '客厅' && device.kind === '电视') return { ...device, on: true };
  return device;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WardrobeItem[]>(SEED_ITEMS);
  const [outfits, setOutfits] = useState<Outfit[]>(SEED_OUTFITS);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [weatherOn, setWeatherOn] = useState(true);
  const [outfitAdopted, setOutfitAdopted] = useState(false);
  const [activeOutfitId, setActiveOutfitId] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>(SEED_MEALS);
  const [recipes] = useState<Recipe[]>(SEED_RECIPES);
  const [targets, setTargetsState] = useState<NutritionTarget>(SEED_TARGETS);
  const [devices, setDevices] = useState<Device[]>(cloneDevices);
  const [alerts, setAlerts] = useState<HomeAlert[]>(SEED_ALERTS);
  const [activeScene, setActiveScene] = useState<SceneName | null>(null);
  const [trips, setTrips] = useState<Trip[]>(SEED_TRIPS);
  const [activeTripId, setActiveTripId] = useState('t-bj');
  const [expenses, setExpenses] = useState<Expense[]>(SEED_EXPENSES);
  const [budgets, setBudgetsState] = useState<Budgets>(SEED_BUDGETS);
  const [notices, setNotices] = useState<NoticePrefs>(SEED_NOTICES);
  const [adoptedTips, setAdoptedTips] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const suggestion = useMemo(() => {
    const pool = SUGGESTIONS.filter((item) => item.weather === weatherOn);
    const picked = pool[suggestionIndex % pool.length] ?? SUGGESTIONS[0];
    const names = itemNames(items, picked.itemIds);
    return {
      title: names.length > 0 ? names.join(' · ') : picked.title,
      reason: weatherOn ? picked.reason : '没拿到天气，已改成按通勤场合推荐。',
      itemIds: picked.itemIds.filter((id) => items.some((item) => item.id === id)),
    };
  }, [items, suggestionIndex, weatherOn]);

  function toast(message: string) {
    const id = uid('toast');
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2400);
  }

  function markTip(id: string) {
    setAdoptedTips((current) => (current.includes(id) ? current : [...current, id]));
  }

  function bumpWears(ids: string[]) {
    setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
  }

  function applyScene(name: SceneName, quiet = false) {
    setDevices((current) => current.map((device) => nextDevice(device, name)));
    setActiveScene(name);
    if (!quiet) toast(`已切换「${name}」`);
  }

  const value: StoreValue = {
    items,
    outfits,
    suggestionIndex,
    weatherOn,
    outfitAdopted,
    activeOutfitId,
    meals,
    recipes,
    targets,
    devices,
    alerts,
    activeScene,
    trips,
    activeTripId,
    expenses,
    budgets,
    notices,
    adoptedTips,
    toasts,
    suggestion,
    addItem: (input) => {
      setItems((current) => [{ ...input, id: uid('w'), wears: 0, createdAt: '2026-09-22' }, ...current]);
      toast(`已加入「${input.name}」`);
    },
    updateItem: (item) => {
      setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
      toast('单品已更新');
    },
    removeItem: (id) => {
      setItems((current) => current.filter((item) => item.id !== id));
      toast('已从衣橱移除');
    },
    toggleFavorite: (id) => {
      setOutfits((current) => current.map((outfit) => (outfit.id === id ? { ...outfit, favorite: !outfit.favorite } : outfit)));
    },
    applyOutfit: (id) => {
      const outfit = outfits.find((item) => item.id === id);
      if (!outfit) return;
      bumpWears(outfit.itemIds);
      setActiveOutfitId(id);
      toast(`已套用「${outfit.name}」`);
    },
    saveSuggestion: () => {
      if (suggestion.itemIds.length === 0) {
        toast('先添加单品，再保存穿搭');
        return;
      }
      const exists = outfits.some((outfit) => outfit.itemIds.join() === suggestion.itemIds.join());
      if (exists) {
        toast('这套已经在穿搭集里');
        return;
      }
      setOutfits((current) => [
        { id: uid('o'), name: `今日推荐 ${current.length + 1}`, itemIds: suggestion.itemIds, favorite: false },
        ...current,
      ]);
      toast('已保存到穿搭集');
    },
    adoptOutfitSuggestion: () => {
      if (outfitAdopted || suggestion.itemIds.length === 0) return;
      bumpWears(suggestion.itemIds);
      setOutfitAdopted(true);
      markTip('outfit');
      toast('已采纳今日穿搭');
    },
    refreshSuggestion: () => {
      setSuggestionIndex((index) => index + 1);
      setOutfitAdopted(false);
      toast('换了一套建议');
    },
    toggleWeather: () => {
      setWeatherOn((on) => !on);
      setSuggestionIndex(0);
      setOutfitAdopted(false);
    },
    addMeal: (input) => {
      setMeals((current) => [...current, { ...input, id: uid('m') }]);
      toast(`已记下${input.slot}`);
    },
    updateMeal: (meal) => {
      setMeals((current) => current.map((row) => (row.id === meal.id ? meal : row)));
      toast('餐次已更新');
    },
    removeMeal: (id) => {
      setMeals((current) => current.filter((meal) => meal.id !== id));
      toast('已删除这条餐次');
    },
    applyRecipe: (id) => {
      const recipe = recipes.find((item) => item.id === id);
      if (!recipe) return;
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setMeals((current) => [
        ...current,
        {
          id: uid('m'),
          slot: recipe.slot,
          name: recipe.name,
          time,
          kcal: recipe.kcal,
          protein: recipe.protein,
          carb: recipe.carb,
          fat: recipe.fat,
        },
      ]);
      toast(`已把「${recipe.name}」加入${recipe.slot}`);
    },
    setTargets: (next) => {
      setTargetsState(next);
      toast(next.kcal > 0 ? '营养目标已更新' : '已清除营养目标');
    },
    toggleDevice: (id) => {
      const device = devices.find((item) => item.id === id);
      if (!device || device.offline) return;
      setDevices((current) => current.map((item) => (item.id === id ? { ...item, on: !item.on } : item)));
    },
    unbindDevice: (id) => {
      setDevices((current) => current.filter((device) => device.id !== id));
      toast('设备已解绑');
    },
    bindSampleDevices: () => {
      setDevices((current) => {
        const ids = new Set(current.map((device) => device.id));
        const missing = SEED_DEVICES.filter((device) => !ids.has(device.id)).map((device) => ({ ...device }));
        return [...current, ...missing];
      });
      toast('已绑定演示设备');
    },
    applyScene: (name) => applyScene(name),
    handleAlert: (id) => {
      setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, handled: true } : alert)));
      if (id === 'a-filter') markTip('filter');
      toast('已记下，稍后处理');
    },
    selectTrip: setActiveTripId,
    togglePack: (tripId, packId) => {
      setTrips((current) =>
        current.map((trip) =>
          trip.id === tripId
            ? { ...trip, packing: trip.packing.map((item) => (item.id === packId ? { ...item, done: !item.done } : item)) }
            : trip,
        ),
      );
    },
    addTrip: (input) => {
      const trip: Trip = {
        id: uid('trip'),
        ...input,
        tickets: [],
        timeline: [{ time: '待定', title: '出发', detail: '时间补上之后会出现在这里' }],
        packing: ['身份证', '充电器', '换洗衣物'].map((text) => ({ id: uid('p'), text, done: false })),
        prepAdopted: false,
      };
      setTrips((current) => [trip, ...current]);
      setActiveTripId(trip.id);
      toast('行程已创建');
    },
    removeTrip: (id) => {
      const remaining = trips.filter((trip) => trip.id !== id);
      setTrips(remaining);
      setActiveTripId((selected) => (selected === id ? (remaining[0]?.id ?? '') : selected));
      toast('行程已删除');
    },
    adoptPrep: (tripId) => {
      const trip = trips.find((item) => item.id === tripId);
      if (!trip || trip.prepAdopted) return;
      setTrips((current) => current.map((item) => (item.id === tripId ? { ...item, prepAdopted: true } : item)));
      applyScene('离家', true);
      markTip('prep');
      toast('已采纳准备包：穿搭沿用今日建议，离家场景已打开');
    },
    addExpense: (input) => {
      setExpenses((current) => [{ ...input, id: uid('e') }, ...current]);
      toast('已记上一笔');
    },
    removeExpense: (id) => {
      setExpenses((current) => current.filter((item) => item.id !== id));
      toast('已删除这条流水');
    },
    setBudgets: (next) => {
      setBudgetsState(next);
      toast('预算已更新');
    },
    setNotice: (key, value) => {
      setNotices((current) => ({ ...current, [key]: value }));
    },
    adoptProteinTip: () => {
      if (!adoptedTips.includes('protein') && !meals.some((meal) => meal.name === '鸡胸肉沙拉')) {
        setMeals((current) => [
          ...current,
          { id: uid('m'), slot: '晚餐', name: '鸡胸肉沙拉', time: '18:30', kcal: 420, protein: 42, carb: 18, fat: 16 },
        ]);
      }
      markTip('protein');
      toast('已按建议补上鸡胸肉沙拉');
    },
    adoptFilterTip: () => {
      setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
      markTip('filter');
      toast('已把滤芯更换记进待办');
    },
    executeCrossPlan: () => {
      if (adoptedTips.includes('cross')) return;
      setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
      setSuggestionIndex(1);
      setWeatherOn(true);
      setOutfitAdopted(true);
      markTip('outfit');
      setMeals((current) => (
        current.some((meal) => meal.name === '鸡胸温蔬藜麦')
          ? current
          : [...current, { id: 'm-cross', slot: '午餐', name: '鸡胸温蔬藜麦', time: '12:40', kcal: 550, protein: 45, carb: 48, fat: 14 }]
      ));
      markTip('protein');
      applyScene('离家', true);
      setTrips((current) => current.map((trip) => {
        if (trip.id !== 't-bj') return trip;
        const owned = new Set(trip.packing.map((item) => item.text));
        const extra = ['防风风衣', '保暖内胆']
          .filter((text) => !owned.has(text))
          .map((text) => ({ id: uid('p'), text, done: false }));
        return { ...trip, prepAdopted: true, packing: [...trip.packing, ...extra] };
      }));
      setActiveTripId('t-bj');
      markTip('prep');
      setExpenses((current) => (
        current.some((item) => item.id === 'e-cross')
          ? current
          : [{ id: 'e-cross', tag: '行', amount: 2400, date: '2026-09-22', merchant: '差旅专账', note: '技术交流会' }, ...current]
      ));
      setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
      markTip('filter');
      markTip('cross');
      toast('已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账');
    },
    markTip,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// Hook lives next to the provider so pages share one session store.
// oxlint-disable-next-line react/only-export-components
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Store missing');
  return store;
}
