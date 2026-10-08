import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { api } from './api/client';
import { loadSnapshot, saveSnapshot } from './api/snapshot';
import { DIET_TODAY, estimateMeal as estimateMealText, pickRecipe, type MealDraft } from './dietPlan';
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
  BillDraft,
  ClothingDraft,
  Expense,
  HomeAlert,
  HomeLink,
  ItineraryDraft,
  Meal,
  NoticePrefs,
  NutritionTarget,
  Outfit,
  Recipe,
  SceneName,
  Toast,
  Trip,
  TripChain,
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
  addItems: (inputs: ClothingDraft[]) => void;
  recognizeClothing: (image: string) => Promise<ClothingDraft | null>;
  updateItem: (item: WardrobeItem) => void;
  removeItem: (id: string) => void;
  toggleFavorite: (id: string) => void;
  applyOutfit: (id: string) => void;
  saveSuggestion: () => void;
  adoptOutfitSuggestion: () => void;
  refreshSuggestion: () => void;
  toggleWeather: () => void;
  addMeal: (input: Omit<Meal, 'id'>) => void;
  estimateMeal: (text: string) => Promise<MealDraft | null>;
  updateMeal: (meal: Meal) => void;
  removeMeal: (id: string) => void;
  addRecipe: (input: Omit<Recipe, 'id'>) => void;
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
  previewBills: (input: { csv?: string; image?: string }) => Promise<BillDraft[] | null>;
  importExpenses: (rows: BillDraft[]) => void;
  removeExpense: (id: string) => void;
  setBudgets: (budgets: Budgets) => void;
  setNotice: (key: keyof NoticePrefs, value: boolean) => void;
  adoptProteinTip: () => void;
  adoptFilterTip: () => void;
  executeCrossPlan: () => void;
  markTip: (id: string) => void;
  adoptActions: (actions: unknown[], key?: string) => void;
  setModel: (input: { baseUrl: string; model: string; apiKey: string }) => void;
  setHome: (input: { baseUrl: string; token: string }) => void;
  syncHome: () => Promise<boolean>;
  parseTrip: (text: string) => Promise<ItineraryDraft | null>;
  importTrip: (draft: ItineraryDraft) => Promise<boolean>;
  runChain: (tripId: string) => Promise<TripChain | null>;
  weatherLabel: string;
  online: boolean;
  model: { configured: boolean; baseUrl: string; model: string };
  home: HomeLink;
  suggestion: { title: string; reason: string; itemIds: string[] };
}

type RemoteSnapshot = {
  items: WardrobeItem[];
  outfits: Outfit[];
  meals: Meal[];
  recipes: Recipe[];
  targets: NutritionTarget;
  devices: Device[];
  alerts: HomeAlert[];
  trips: Trip[];
  expenses: Expense[];
  budgets: Budgets;
  notices: NoticePrefs;
  suggestionIndex: number;
  weatherOn: boolean;
  weatherLabel: string;
  outfitAdopted: boolean;
  activeOutfitId: string | null;
  activeScene: SceneName | null;
  activeTripId: string;
  adoptedTips: string[];
  model: { configured: boolean; baseUrl: string; model: string };
  home: HomeLink;
};

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
  const [recipes, setRecipes] = useState<Recipe[]>(SEED_RECIPES);
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
  const [weatherLabel, setWeatherLabel] = useState('22°C 多云');
  const [online, setOnline] = useState(false);
  const [model, setModelState] = useState({ configured: false, baseUrl: '', model: '' });
  const [home, setHomeState] = useState<HomeLink>({ configured: false, baseUrl: 'http://192.168.0.111:8123', connected: false });
  const sourceRef = useRef<'api' | 'memory'>('memory');

  function applyRemote(snapshot: RemoteSnapshot) {
    setItems(snapshot.items);
    setOutfits(snapshot.outfits);
    setMeals(snapshot.meals);
    setRecipes(snapshot.recipes);
    setTargetsState(snapshot.targets);
    setDevices(snapshot.devices);
    setAlerts(snapshot.alerts);
    setTrips(snapshot.trips);
    setExpenses(snapshot.expenses);
    setBudgetsState(snapshot.budgets);
    setNotices(snapshot.notices);
    setSuggestionIndex(snapshot.suggestionIndex);
    setWeatherOn(snapshot.weatherOn);
    setWeatherLabel(snapshot.weatherLabel || '22°C 多云');
    setOutfitAdopted(snapshot.outfitAdopted);
    setActiveOutfitId(snapshot.activeOutfitId);
    setActiveScene(snapshot.activeScene);
    setActiveTripId(snapshot.activeTripId || 't-bj');
    setAdoptedTips(snapshot.adoptedTips);
    setModelState(snapshot.model);
    setHomeState(snapshot.home ?? { configured: false, baseUrl: 'http://192.168.0.111:8123', connected: false });
  }

  useEffect(() => {
    let cancel = false;
    api<RemoteSnapshot>('/api/snapshot')
      .then((snapshot) => {
        if (cancel) return;
        applyRemote(snapshot);
        sourceRef.current = 'api';
        setOnline(true);
        void saveSnapshot(snapshot);
      })
      .catch(() => {
        void loadSnapshot<RemoteSnapshot>().then((cached) => {
          if (cancel || !cached) return;
          applyRemote(cached);
        });
      });
    return () => {
      cancel = true;
    };
    // 启动时用本机库；库没开就留着种子。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function commit(path: string, init?: RequestInit) {
    if (sourceRef.current !== 'api') return false;
    try {
      const body = await api<{ snapshot?: RemoteSnapshot } & RemoteSnapshot>(path, init);
      const snapshot = body.snapshot ?? body;
      applyRemote(snapshot);
      void saveSnapshot(snapshot);
      return true;
    } catch {
      sourceRef.current = 'memory';
      setOnline(false);
      return false;
    }
  }

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
    weatherLabel,
    online,
    model,
    home,
    addItem: (input) => {
      void (async () => {
        if (await commit('/api/items', { method: 'POST', body: JSON.stringify(input) })) {
          toast(`已加入「${input.name}」`);
          return;
        }
        setItems((current) => [{ ...input, id: uid('w'), wears: 0, createdAt: '2026-09-22' }, ...current]);
        toast(`已加入「${input.name}」`);
      })();
    },
    addItems: (inputs) => {
      if (inputs.length === 0) return;
      void (async () => {
        if (sourceRef.current === 'api') {
          try {
            const body = await api<{ snapshot: RemoteSnapshot }>('/api/items/batch', {
              method: 'POST',
              body: JSON.stringify({ items: inputs }),
            });
            applyRemote(body.snapshot);
            void saveSnapshot(body.snapshot);
            toast(inputs.length === 1 ? `已加入「${inputs[0].name}」` : `已加入 ${inputs.length} 件`);
            return;
          } catch {
            sourceRef.current = 'memory';
            setOnline(false);
          }
        }
        setItems((current) => [
          ...inputs.map((input) => ({ ...input, id: uid('w'), wears: 0, createdAt: '2026-09-22' })),
          ...current,
        ]);
        toast(inputs.length === 1 ? `已加入「${inputs[0].name}」` : `已加入 ${inputs.length} 件`);
      })();
    },
    recognizeClothing: async (image) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，照片还识别不了');
        return null;
      }
      try {
        return await api<ClothingDraft>('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image }) });
      } catch (error) {
        const status = error instanceof Error ? error.message : '';
        toast(status === '503' ? '先在设置里接上能看图的模型' : '这张照片没有识别出来');
        return null;
      }
    },
    updateItem: (item) => {
      void (async () => {
        if (await commit(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(item) })) {
          toast('单品已更新');
          return;
        }
        setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
        toast('单品已更新');
      })();
    },
    removeItem: (id) => {
      void (async () => {
        if (await commit(`/api/items/${id}`, { method: 'DELETE' })) {
          toast('已从衣橱移除');
          return;
        }
        setItems((current) => current.filter((item) => item.id !== id));
        toast('已从衣橱移除');
      })();
    },
    toggleFavorite: (id) => {
      void (async () => {
        if (await commit(`/api/outfits/${id}/favorite`, { method: 'POST' })) return;
        setOutfits((current) => current.map((outfit) => (outfit.id === id ? { ...outfit, favorite: !outfit.favorite } : outfit)));
      })();
    },
    applyOutfit: (id) => {
      const outfit = outfits.find((item) => item.id === id);
      if (!outfit) return;
      void (async () => {
        if (await commit(`/api/outfits/${id}/apply`, { method: 'POST' })) {
          toast(`已套用「${outfit.name}」`);
          return;
        }
        bumpWears(outfit.itemIds);
        setActiveOutfitId(id);
        toast(`已套用「${outfit.name}」`);
      })();
    },
    saveSuggestion: () => {
      if (suggestion.itemIds.length === 0) {
        toast('先添加单品，再保存穿搭');
        return;
      }
      void (async () => {
        if (sourceRef.current === 'api') {
          try {
            const body = await api<{ snapshot: RemoteSnapshot; duplicate?: boolean }>('/api/outfits', {
              method: 'POST',
              body: JSON.stringify({ itemIds: suggestion.itemIds }),
            });
            applyRemote(body.snapshot);
            void saveSnapshot(body.snapshot);
            toast(body.duplicate ? '这套已经在穿搭集里' : '已保存到穿搭集');
            return;
          } catch {
            sourceRef.current = 'memory';
            setOnline(false);
          }
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
      })();
    },
    adoptOutfitSuggestion: () => {
      if (outfitAdopted || suggestion.itemIds.length === 0) return;
      void (async () => {
        if (await commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'outfit' }) })) {
          toast('已采纳今日穿搭');
          return;
        }
        bumpWears(suggestion.itemIds);
        setOutfitAdopted(true);
        markTip('outfit');
        toast('已采纳今日穿搭');
      })();
    },
    refreshSuggestion: () => {
      void (async () => {
        if (await commit('/api/wardrobe/suggestion/refresh', { method: 'POST' })) {
          toast('换了一套建议');
          return;
        }
        setSuggestionIndex((index) => index + 1);
        setOutfitAdopted(false);
        toast('换了一套建议');
      })();
    },
    toggleWeather: () => {
      void (async () => {
        if (await commit('/api/session/weather', { method: 'POST' })) return;
        setWeatherOn((on) => !on);
        setWeatherLabel((label) => (label === '天气未知' ? '22°C 多云' : '天气未知'));
        setSuggestionIndex(0);
        setOutfitAdopted(false);
      })();
    },
    addMeal: (input) => {
      void (async () => {
        if (await commit('/api/meals', { method: 'POST', body: JSON.stringify(input) })) {
          toast(`已记下${input.slot}`);
          return;
        }
        setMeals((current) => [...current, { ...input, id: uid('m'), date: input.date || DIET_TODAY }]);
        toast(`已记下${input.slot}`);
      })();
    },
    estimateMeal: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      if (sourceRef.current === 'api') {
        try {
          const body = await api<{ draft: MealDraft }>('/api/meals/estimate', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
          return body.draft;
        } catch {
          sourceRef.current = 'memory';
          setOnline(false);
        }
      }
      return estimateMealText(trimmed, recipes);
    },
    updateMeal: (meal) => {
      void (async () => {
        if (await commit(`/api/meals/${meal.id}`, { method: 'PATCH', body: JSON.stringify(meal) })) {
          toast('餐次已更新');
          return;
        }
        setMeals((current) => current.map((row) => (row.id === meal.id ? meal : row)));
        toast('餐次已更新');
      })();
    },
    removeMeal: (id) => {
      void (async () => {
        if (await commit(`/api/meals/${id}`, { method: 'DELETE' })) {
          toast('已删除这条餐次');
          return;
        }
        setMeals((current) => current.filter((meal) => meal.id !== id));
        toast('已删除这条餐次');
      })();
    },
    addRecipe: (input) => {
      const name = input.name.trim();
      if (!name) return;
      const tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
      void (async () => {
        if (await commit('/api/recipes', { method: 'POST', body: JSON.stringify({ ...input, name, tags }) })) {
          toast(`已加入食谱「${name}」`);
          return;
        }
        setRecipes((current) => [{ ...input, id: uid('r'), name, tags }, ...current]);
        toast(`已加入食谱「${name}」`);
      })();
    },
    applyRecipe: (id) => {
      const recipe = recipes.find((item) => item.id === id);
      if (!recipe) return;
      void (async () => {
        if (await commit(`/api/recipes/${id}/apply`, { method: 'POST' })) {
          toast(`已把「${recipe.name}」加入${recipe.slot}`);
          return;
        }
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setMeals((current) => [
          ...current,
          { id: uid('m'), slot: recipe.slot, name: recipe.name, time, date: DIET_TODAY, kcal: recipe.kcal, protein: recipe.protein, carb: recipe.carb, fat: recipe.fat },
        ]);
        toast(`已把「${recipe.name}」加入${recipe.slot}`);
      })();
    },
    setTargets: (next) => {
      void (async () => {
        if (await commit('/api/nutrition-target', { method: 'PUT', body: JSON.stringify(next) })) {
          toast(next.kcal > 0 ? '营养目标已更新' : '已清除营养目标');
          return;
        }
        setTargetsState(next);
        toast(next.kcal > 0 ? '营养目标已更新' : '已清除营养目标');
      })();
    },
    toggleDevice: (id) => {
      const device = devices.find((item) => item.id === id);
      if (!device || device.offline) return;
      void (async () => {
        if (await commit(`/api/devices/${id}/toggle`, { method: 'POST' })) return;
        setDevices((current) => current.map((item) => (item.id === id ? { ...item, on: !item.on } : item)));
      })();
    },
    unbindDevice: (id) => {
      void (async () => {
        if (await commit(`/api/devices/${id}`, { method: 'DELETE' })) {
          toast('设备已解绑');
          return;
        }
        setDevices((current) => current.filter((device) => device.id !== id));
        toast('设备已解绑');
      })();
    },
    bindSampleDevices: () => {
      void (async () => {
        if (await commit('/api/devices/bind-sample', { method: 'POST' })) {
          toast('已绑定演示设备');
          return;
        }
        setDevices((current) => {
          const ids = new Set(current.map((device) => device.id));
          const missing = SEED_DEVICES.filter((device) => !ids.has(device.id)).map((device) => ({ ...device }));
          return [...current, ...missing];
        });
        toast('已绑定演示设备');
      })();
    },
    applyScene: (name) => {
      void (async () => {
        if (await commit(`/api/scenes/${encodeURIComponent(name)}`, { method: 'POST' })) {
          toast(`已切换「${name}」`);
          return;
        }
        applyScene(name);
      })();
    },
    handleAlert: (id) => {
      void (async () => {
        if (await commit(`/api/alerts/${id}/handle`, { method: 'POST' })) {
          toast('已记下，稍后处理');
          return;
        }
        setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, handled: true } : alert)));
        if (id === 'a-filter') markTip('filter');
        toast('已记下，稍后处理');
      })();
    },
    selectTrip: (id) => {
      void (async () => {
        if (await commit(`/api/trips/${id}/select`, { method: 'POST' })) return;
        setActiveTripId(id);
      })();
    },
    togglePack: (tripId, packId) => {
      void (async () => {
        if (await commit(`/api/trips/${tripId}/packing/${packId}`, { method: 'POST' })) return;
        setTrips((current) =>
          current.map((trip) =>
            trip.id === tripId
              ? { ...trip, packing: trip.packing.map((item) => (item.id === packId ? { ...item, done: !item.done } : item)) }
              : trip,
          ),
        );
      })();
    },
    addTrip: (input) => {
      void (async () => {
        if (await commit('/api/trips', { method: 'POST', body: JSON.stringify(input) })) {
          toast('行程已创建');
          return;
        }
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
      })();
    },
    removeTrip: (id) => {
      void (async () => {
        if (await commit(`/api/trips/${id}`, { method: 'DELETE' })) {
          toast('行程已删除');
          return;
        }
        const remaining = trips.filter((trip) => trip.id !== id);
        setTrips(remaining);
        setActiveTripId((selected) => (selected === id ? (remaining[0]?.id ?? '') : selected));
        toast('行程已删除');
      })();
    },
    adoptPrep: (tripId) => {
      const trip = trips.find((item) => item.id === tripId);
      if (!trip || trip.prepAdopted) return;
      void (async () => {
        if (await commit(`/api/trips/${tripId}/adopt-prep`, { method: 'POST' })) {
          toast('已采纳准备包：穿搭沿用今日建议，离家场景已打开');
          return;
        }
        setTrips((current) => current.map((item) => (item.id === tripId ? { ...item, prepAdopted: true } : item)));
        applyScene('离家', true);
        markTip('prep');
        toast('已采纳准备包：穿搭沿用今日建议，离家场景已打开');
      })();
    },
    addExpense: (input) => {
      void (async () => {
        if (await commit('/api/expenses', { method: 'POST', body: JSON.stringify(input) })) {
          toast('已记上一笔');
          return;
        }
        setExpenses((current) => [{ ...input, id: uid('e') }, ...current]);
        toast('已记上一笔');
      })();
    },
    previewBills: async (input) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，账单还导不进来');
        return null;
      }
      try {
        const body = await api<{ rows: BillDraft[] }>('/api/bills/preview', { method: 'POST', body: JSON.stringify(input) });
        return body.rows;
      } catch (error) {
        const status = error instanceof Error ? error.message : '';
        toast(status === '503' ? '先在设置里接上能看图的模型' : '这份账单没有读出来');
        return null;
      }
    },
    importExpenses: (rows) => {
      const ready = rows.filter((row): row is BillDraft & { tag: NonNullable<BillDraft['tag']> } => Boolean(row.tag));
      if (ready.length === 0) {
        toast('先给每一笔选好衣食住行');
        return;
      }
      void (async () => {
        if (sourceRef.current === 'api') {
          try {
            const body = await api<{ snapshot: RemoteSnapshot; imported: number }>('/api/bills/import', {
              method: 'POST',
              body: JSON.stringify({ rows: ready }),
            });
            applyRemote(body.snapshot);
            void saveSnapshot(body.snapshot);
            toast(`已导入 ${body.imported} 笔，环图和预算已更新`);
            return;
          } catch {
            sourceRef.current = 'memory';
            setOnline(false);
          }
        }
        setExpenses((current) => [...ready.map((row) => ({ ...row, id: uid('e') })), ...current]);
        toast(`已导入 ${ready.length} 笔，环图和预算已更新`);
      })();
    },
    removeExpense: (id) => {
      void (async () => {
        if (await commit(`/api/expenses/${id}`, { method: 'DELETE' })) {
          toast('已删除这条流水');
          return;
        }
        setExpenses((current) => current.filter((item) => item.id !== id));
        toast('已删除这条流水');
      })();
    },
    setBudgets: (next) => {
      void (async () => {
        if (await commit('/api/budgets', { method: 'PUT', body: JSON.stringify(next) })) {
          toast('预算已更新');
          return;
        }
        setBudgetsState(next);
        toast('预算已更新');
      })();
    },
    setNotice: (key, value) => {
      void (async () => {
        if (await commit('/api/notices', { method: 'PUT', body: JSON.stringify({ [key]: value }) })) return;
        setNotices((current) => ({ ...current, [key]: value }));
      })();
    },
    setModel: (input) => {
      void (async () => {
        if (await commit('/api/model', { method: 'PUT', body: JSON.stringify(input) })) {
          toast('模型连接已保存');
          return;
        }
        toast('本地服务没开，模型地址还没写下');
      })();
    },
    setHome: (input) => {
      void (async () => {
        if (await commit('/api/home', { method: 'PUT', body: JSON.stringify(input) })) {
          toast('家居地址已保存');
          return;
        }
        toast('本地服务没开，家居令牌还没写下');
      })();
    },
    syncHome: async () => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，家居仍是演示数据');
        return false;
      }
      try {
        const body = await api<{ snapshot: RemoteSnapshot; error?: string }>('/api/home/sync', { method: 'POST' });
        applyRemote(body.snapshot);
        void saveSnapshot(body.snapshot);
        toast(body.snapshot.home.connected ? '已从 Home Assistant 同步设备' : '未连接，仍显示演示数据');
        return body.snapshot.home.connected;
      } catch {
        toast('未连接，仍显示演示数据');
        return false;
      }
    },
    parseTrip: async (text) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，行程还解析不了');
        return null;
      }
      try {
        const body = await api<{ draft: ItineraryDraft }>('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text }) });
        return body.draft;
      } catch {
        toast('这份短信或邮件没有读出行程');
        return null;
      }
    },
    importTrip: async (draft) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，行程还写不进去');
        return false;
      }
      try {
        const body = await api<{ snapshot: RemoteSnapshot }>('/api/trips/import', { method: 'POST', body: JSON.stringify({ draft }) });
        applyRemote(body.snapshot);
        void saveSnapshot(body.snapshot);
        toast(`已写入「${draft.title}」`);
        return true;
      } catch {
        toast('行程没有写进去');
        return false;
      }
    },
    runChain: async (tripId) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，这趟行程还串不起来');
        return null;
      }
      try {
        const body = await api<{ snapshot: RemoteSnapshot; chain: TripChain }>(`/api/trips/${tripId}/chain`, { method: 'POST' });
        applyRemote(body.snapshot);
        void saveSnapshot(body.snapshot);
        toast(body.chain.scene.via === 'home-assistant' ? '已按行程串起，离家场景已交给 Home Assistant' : '已按行程串起，离家只记在本机');
        return body.chain;
      } catch {
        toast('这趟行程没有串起来');
        return null;
      }
    },
    adoptActions: (actions, key) => {
      void (async () => {
        if (await commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key, actions }) })) {
          toast(key === 'cross' ? '已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账' : '已采纳');
          return;
        }
        if (key === 'cross') {
          setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
          setSuggestionIndex(1);
          setWeatherOn(true);
          setOutfitAdopted(true);
          markTip('cross');
          toast('已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账');
        }
      })();
    },
    adoptProteinTip: () => {
      const picked = pickRecipe(recipes, meals, targets);
      if (!picked) return;
      void (async () => {
        if (await commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'protein' }) })) {
          toast(`已按建议补上${picked.name}`);
          return;
        }
        if (!meals.some((meal) => meal.name === picked.name)) {
          setMeals((current) => [
            ...current,
            { id: uid('m'), slot: picked.slot, name: picked.name, time: '18:30', date: DIET_TODAY, kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat },
          ]);
        }
        markTip('protein');
        toast(`已按建议补上${picked.name}`);
      })();
    },
    adoptFilterTip: () => {
      void (async () => {
        if (await commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'filter' }) })) {
          toast('已把滤芯更换记进待办');
          return;
        }
        setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
        markTip('filter');
        toast('已把滤芯更换记进待办');
      })();
    },
    executeCrossPlan: () => {
      if (adoptedTips.includes('cross')) return;
      if (sourceRef.current === 'api') {
        void (async () => {
          if (await commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'cross' }) })) {
            toast('已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账');
          }
        })();
        return;
      }
      setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
      setSuggestionIndex(1);
      setWeatherOn(true);
      setOutfitAdopted(true);
      markTip('outfit');
      setMeals((current) => (
        current.some((meal) => meal.name === '鸡胸温蔬藜麦')
          ? current
          : [...current, { id: 'm-cross', slot: '午餐', name: '鸡胸温蔬藜麦', time: '12:40', date: DIET_TODAY, kcal: 550, protein: 45, carb: 48, fat: 14 }]
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
    markTip: (id) => {
      void (async () => {
        if (await commit('/api/session/tips', { method: 'POST', body: JSON.stringify({ id }) })) return;
        markTip(id);
      })();
    },
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
