import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { api, ApiError, errorDetail } from './api/client';
import { demoMode, loadSnapshot, saveSnapshot } from './api/snapshot';
import { localDate } from './localDate';
import { estimateMeal as estimateMealText, pickRecipe, type MealDraft } from './dietPlan';
import { HomeConfirmation, type HomePreview, type HomeResult } from './components/HomeConfirmation';
import { uid } from './format';
import { draftsFromOrder, planOutfit } from './wardrobePlan';
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
} from './seed';
import type {
  Budgets,
  Device,
  BillDraft,
  BillImportReceipt,
  ClothingDraft,
  Expense,
  HomeAlert,
  HomeLink,
  ItineraryDraft,
  Meal,
  NoticePrefs,
  NutritionTarget,
  PackingTemplate,
  Outfit,
  Recipe,
  SceneName,
  Toast,
  Trip,
  TripChain,
  WardrobeItem,
} from './types';

type Source = 'loading' | 'api' | 'cached' | 'offline' | 'demo';

interface StoreValue {
  source: Source;
  offlineViewer: boolean;
  demoMode: boolean;
  saving: boolean;
  writeMessage: string;
  reconnect: () => Promise<boolean>;
  refreshWeather: (city: string) => Promise<boolean>;
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
  addItem: (input: Omit<WardrobeItem, 'id' | 'wears' | 'createdAt'>) => Promise<boolean>;
  addItems: (inputs: ClothingDraft[]) => Promise<boolean>;
  recognizeClothing: (image: string) => Promise<ClothingDraft | 'manual' | null>;
  draftFromOrder: (text: string) => Promise<ClothingDraft[]>;
  updateItem: (item: WardrobeItem) => Promise<boolean>;
  removeItem: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<boolean>;
  applyOutfit: (id: string) => Promise<boolean>;
  saveSuggestion: () => Promise<boolean>;
  adoptOutfitSuggestion: () => Promise<boolean>;
  refreshSuggestion: () => Promise<boolean>;
  toggleWeather: () => Promise<boolean>;
  addMeal: (input: Omit<Meal, 'id'>, shortcutDraftId?: string) => Promise<boolean>;
  estimateMeal: (text: string) => Promise<MealDraft | null>;
  updateMeal: (meal: Meal) => Promise<boolean>;
  removeMeal: (id: string) => Promise<boolean>;
  addRecipe: (input: Omit<Recipe, 'id'>) => Promise<boolean>;
  applyRecipe: (id: string, date?: string) => Promise<boolean>;
  setTargets: (targets: NutritionTarget) => Promise<boolean>;
  toggleDevice: (id: string) => Promise<boolean>;
  unbindDevice: (id: string) => Promise<boolean>;
  bindSampleDevices: () => Promise<boolean>;
  applyScene: (name: SceneName) => Promise<boolean>;
  bindScene: (name: SceneName, target: string) => Promise<boolean>;
  handleAlert: (id: string) => Promise<boolean>;
  dismissHomeAlerts: () => Promise<boolean>;
  selectTrip: (id: string) => Promise<boolean>;
  togglePack: (tripId: string, packId: string) => Promise<boolean>;
  addTrip: (input: Pick<Trip, 'title' | 'status' | 'transport' | 'dateLabel'>) => Promise<boolean>;
  removeTrip: (id: string) => Promise<boolean>;
  adoptPrep: (tripId: string, confirmation: string) => Promise<boolean>;
  addExpense: (input: Omit<Expense, 'id'>) => Promise<boolean>;
  previewBills: (input: { csv?: string; image?: string }) => Promise<BillDraft[] | null>;
  importExpenses: (rows: BillDraft[]) => Promise<BillImportReceipt | { reviewRows: BillDraft[] } | null>;
  removeExpense: (id: string) => Promise<boolean>;
  setBudgets: (budgets: Budgets) => Promise<boolean>;
  setNotice: (key: keyof NoticePrefs, value: boolean) => Promise<boolean>;
  adoptProteinTip: () => Promise<boolean>;
  adoptFilterTip: () => Promise<boolean>;
  executeCrossPlan: () => Promise<boolean>;
  markTip: (id: string) => Promise<boolean>;
  adoptActions: (actions: unknown[], key?: string) => Promise<boolean>;
  setModel: (input: { baseUrl: string; model: string; apiKey: string }) => Promise<boolean>;
  setHome: (input: { baseUrl: string; token: string }) => Promise<boolean>;
  syncHome: () => Promise<boolean>;
  parseTrip: (text: string) => Promise<ItineraryDraft | null>;
  importTrip: (draft: ItineraryDraft) => Promise<boolean>;
  runChain: (tripId: string, month?: string) => Promise<TripChain | null>;
  adoptTripMeal: (tripId: string, name: string) => Promise<boolean>;
  addPackingLine: (tripId: string, text: string) => Promise<boolean>;
  editPackingLine: (tripId: string, packId: string, text: string) => Promise<boolean>;
  savePackingTemplate: (tripId: string, name: string) => Promise<boolean>;
  applyPackingTemplate: (tripId: string, templateId: string) => Promise<boolean>;
  addTripExpense: (tripId: string, input: { amount: number; merchant: string; kind: '票务' | '食宿' }) => Promise<boolean>;
  weatherLabel: string;
  weatherCity: string;
  weatherSource: string;
  weatherUpdatedAt: string;
  online: boolean;
  model: { configured: boolean; baseUrl: string; model: string };
  home: HomeLink;
  packingTemplates: PackingTemplate[];
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
  weatherCity: string;
  weatherSource: string;
  weatherUpdatedAt: string;
  outfitAdopted: boolean;
  activeOutfitId: string | null;
  activeScene: SceneName | null;
  activeTripId: string;
  adoptedTips: string[];
  model: { configured: boolean; baseUrl: string; model: string };
  home: HomeLink;
  packingTemplates?: PackingTemplate[];
};

const StoreContext = createContext<StoreValue | null>(null);

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
  const [items, setItems] = useState<WardrobeItem[]>(demoMode ? SEED_ITEMS : []);
  const [outfits, setOutfits] = useState<Outfit[]>(demoMode ? SEED_OUTFITS : []);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [weatherOn, setWeatherOn] = useState(demoMode);
  const [outfitAdopted, setOutfitAdopted] = useState(false);
  const [activeOutfitId, setActiveOutfitId] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>(demoMode ? SEED_MEALS : []);
  const [recipes, setRecipes] = useState<Recipe[]>(demoMode ? SEED_RECIPES : []);
  const [targets, setTargetsState] = useState<NutritionTarget>(SEED_TARGETS);
  const [devices, setDevices] = useState<Device[]>(demoMode ? SEED_DEVICES : []);
  const [alerts, setAlerts] = useState<HomeAlert[]>(demoMode ? SEED_ALERTS : []);
  const [activeScene, setActiveScene] = useState<SceneName | null>(null);
  const [trips, setTrips] = useState<Trip[]>(demoMode ? SEED_TRIPS : []);
  const [activeTripId, setActiveTripId] = useState(demoMode ? 't-bj' : '');
  const [expenses, setExpenses] = useState<Expense[]>(demoMode ? SEED_EXPENSES : []);
  const [budgets, setBudgetsState] = useState<Budgets>(SEED_BUDGETS);
  const [notices, setNotices] = useState<NoticePrefs>(SEED_NOTICES);
  const [adoptedTips, setAdoptedTips] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [weatherLabel, setWeatherLabel] = useState(demoMode ? '22°C 多云' : '');
  const [offlineViewer, setOfflineViewer] = useState(false);
  const [source, setSource] = useState<Source>('loading');
  const [saving, setSaving] = useState(false);
  const [writeMessage, setWriteMessage] = useState('');
  const [weatherInfo, setWeatherInfo] = useState({ weatherCity: '', weatherSource: '', weatherUpdatedAt: '' });
  const busy = useRef(false);
  const uncertain = useRef(false);
  const sourceRef = useRef<Source>('loading');

  function changeSource(next: Source) {
    sourceRef.current = next;
    setSource(next);
  }
  const [model, setModelState] = useState({ configured: false, baseUrl: '', model: '' });
  const [home, setHomeState] = useState<HomeLink>({ configured: false, baseUrl: 'http://192.168.0.111:8123', connected: false, sceneCatalog: [], sceneBindings: {} });
  const [packingTemplates, setPackingTemplates] = useState<PackingTemplate[]>([]);

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
    setWeatherLabel(snapshot.weatherLabel || '天气未知');
    setWeatherInfo({ weatherCity: snapshot.weatherCity || '', weatherSource: snapshot.weatherSource || '', weatherUpdatedAt: snapshot.weatherUpdatedAt || '' });
    setOutfitAdopted(snapshot.outfitAdopted);
    setActiveOutfitId(snapshot.activeOutfitId);
    setActiveScene(snapshot.activeScene);
    setActiveTripId(snapshot.activeTripId || '');
    setAdoptedTips(snapshot.adoptedTips);
    setModelState(snapshot.model);
    setHomeState({
      configured: snapshot.home?.configured ?? false,
      baseUrl: snapshot.home?.baseUrl || 'http://192.168.0.111:8123',
      connected: snapshot.home?.connected ?? false,
      sceneCatalog: snapshot.home?.sceneCatalog ?? [],
      sceneBindings: snapshot.home?.sceneBindings ?? {},
    });
    setPackingTemplates(snapshot.packingTemplates ?? []);
  }

  function acceptSnapshot(snapshot: RemoteSnapshot) {
    const collections = ['items', 'outfits', 'meals', 'recipes', 'devices', 'alerts', 'trips', 'expenses', 'adoptedTips'] as const;
    if (collections.some((key) => !Array.isArray(snapshot?.[key])) || !snapshot.budgets || !snapshot.targets || !snapshot.model || !snapshot.notices) {
      throw new Error('服务未返回完整记录');
    }
    applyRemote(snapshot);
    setOfflineViewer(false);
    changeSource('api');
    // The database has already acknowledged the request. Browser caching is optional.
    void saveSnapshot(snapshot).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const snapshot = await api<RemoteSnapshot>('/api/snapshot');
        if (!cancelled) acceptSnapshot(snapshot);
      } catch {
        const cached = await loadSnapshot().catch(() => null);
        if (cancelled) return;
        setOfflineViewer(!demoMode);
        changeSource(demoMode ? 'demo' : cached ? 'cached' : 'offline');
      }
    }
    void start();
    return () => { cancelled = true; };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reconnect() {
    if (busy.current || sourceRef.current === 'loading') return false;
    busy.current = true;
    setSaving(true);
    try {
      acceptSnapshot(await api<RemoteSnapshot>('/api/snapshot'));
      setWriteMessage(uncertain.current ? '已刷新记录。请核对上次操作，仅在确实需要时再次提交。' : '已重新连接，可以再次提交。');
      uncertain.current = false;
      return true;
    } catch (error) {
      setWriteMessage(`重连失败：${errorDetail(error)}。请启动本地服务后重试。`);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  type WriteResponse = { snapshot: RemoteSnapshot; imported?: number; receipt?: BillImportReceipt; reviewRows?: BillDraft[]; duplicate?: boolean; error?: string; scene?: HomeResult; chain?: TripChain };
  async function commit(path: string, init: RequestInit, demo?: () => void, saved?: (body: WriteResponse) => void) {
    if (busy.current) return false;
    const current = sourceRef.current;
    if (current === 'demo' && demo) {
      demo();
      setWriteMessage('演示更改仅保留在当前页面。');
      return true;
    }
    if (current !== 'api') {
      setWriteMessage(uncertain.current ? '上次操作结果待确认。请先刷新记录并核对。' : '未保存。请连接本地服务后再提交。');
      return false;
    }
    busy.current = true;
    setSaving(true);
    setWriteMessage('');
    try {
      const body = await api<WriteResponse>(path, init);
      acceptSnapshot(body.snapshot);
      if (body.error) {
        setWriteMessage(`操作未完成：${new ApiError(200, body.error).message}。请检查连接或设置后重试。`);
        return false;
      }
      saved?.(body);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        setWriteMessage(`未保存：${errorDetail(error)}。请核对输入后重试。`);
      } else {
        uncertain.current = true;
        changeSource('cached');
        setWriteMessage(`保存结果待确认：${errorDetail(error)}。请先刷新并核对记录，以免重复操作。`);
      }
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const suggestion = useMemo(
    () => planOutfit(items, suggestionIndex, weatherOn, weatherLabel),
    [items, suggestionIndex, weatherLabel, weatherOn],
  );

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

  const [control, setControl] = useState<{ title: string; path: string; preview: HomePreview; result?: HomeResult; demo?: () => void } | null>(null);
  async function previewControl(title: string, path: string, demoSteps: HomePreview['steps'], demo: () => void) {
    if (busy.current) return false;
    setWriteMessage('');
    if (sourceRef.current === 'demo') {
      setControl({ title, path, preview: { token: '', via: 'local', steps: demoSteps }, demo });
      return true;
    }
    if (sourceRef.current !== 'api') { setWriteMessage('请连接本地服务后重新预览。'); return false; }
    try {
      const { preview } = await api<{ preview: HomePreview }>(path, { method: 'POST' });
      setControl({ title, path, preview });
      return true;
    } catch (error) { setWriteMessage(`预览失败：${errorDetail(error)}`); return false; }
  }
  async function confirmControl() {
    if (!control || control.result) return;
    const { preview } = control;
    await commit(control.path, { method: 'POST', body: JSON.stringify({ confirmation: preview.token }) }, control.demo && (() => {
      control.demo?.();
      setControl({ ...control, result: { status: 'done', results: preview.steps.map((s) => ({ id: s.id, label: s.label, action: s.change?.on ? '开启' : '关闭' })) } });
    }), (body) => setControl({ ...control, result: body.scene }));
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
    online: source === 'api',
    source, offlineViewer, demoMode, saving, writeMessage, reconnect,
    ...weatherInfo,
    refreshWeather: (city) => commit('/api/weather/refresh', { method: 'POST', body: JSON.stringify({ city }) }),
    model,
    home,
    packingTemplates,
    addItem: async (input) => {
      return commit('/api/items', { method: 'POST', body: JSON.stringify({ ...input, createdAt: localDate() }) }, () => {
        setItems((current) => [{ ...input, id: uid('w'), wears: 0, createdAt: localDate() }, ...current]);
        toast(`已加入「${input.name}」`);
      }, () => toast(`已加入「${input.name}」`));
    },
    addItems: async (inputs) => {
      if (inputs.length === 0) return false;
      return commit('/api/items/batch', { method: 'POST', body: JSON.stringify({ items: inputs, createdAt: localDate() }) }, () => {
        setItems((current) => [
          ...inputs.map((input) => ({ ...input, id: uid('w'), wears: 0, createdAt: localDate() })),
          ...current,
        ]);
        toast(inputs.length === 1 ? `已加入「${inputs[0].name}」` : `已加入 ${inputs.length} 件`);
      }, () => toast(inputs.length === 1 ? `已加入「${inputs[0].name}」` : `已加入 ${inputs.length} 件`));
    },
    recognizeClothing: async (image) => {
      if (sourceRef.current !== 'api') return 'manual';
      try {
        return await api<ClothingDraft>('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image }) });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 503) return 'manual';
        toast(`这张照片没有识别出来：${errorDetail(error)}`);
        return null;
      }
    },
    draftFromOrder: async (text) => {
      if (sourceRef.current === 'api') {
        try {
          const body = await api<{ drafts: ClothingDraft[] }>('/api/wardrobe/drafts', {
            method: 'POST',
            body: JSON.stringify({ text }),
          });
          return body.drafts;
        } catch (error) {
          toast(`服务暂不可用，使用本机估算：${errorDetail(error)}`);
        }
      }
      return draftsFromOrder(text);
    },
    updateItem: async (item) => {
      return commit(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(item) }, () => {
        setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
        toast('单品已更新');
      }, () => toast('单品已更新'));
    },
    removeItem: async (id) => {
      return commit(`/api/items/${id}`, { method: 'DELETE' }, () => {
        setItems((current) => current.filter((item) => item.id !== id));
        toast('已从衣橱移除');
      }, () => toast('已从衣橱移除'));
    },
    toggleFavorite: async (id) => {
      return commit(`/api/outfits/${id}/favorite`, { method: 'POST' }, () => {
        setOutfits((current) => current.map((outfit) => (outfit.id === id ? { ...outfit, favorite: !outfit.favorite } : outfit)));
      });
    },
    applyOutfit: async (id) => {
      const outfit = outfits.find((item) => item.id === id);
      if (!outfit) return false;
      return commit(`/api/outfits/${id}/apply`, { method: 'POST' }, () => {
        bumpWears(outfit.itemIds);
        setActiveOutfitId(id);
        toast(`已套用「${outfit.name}」`);
      }, () => toast(`已套用「${outfit.name}」`));
    },
    saveSuggestion: async () => {
      if (suggestion.itemIds.length === 0) {
        toast('先添加单品，再保存穿搭');
        return false;
      }
      return commit('/api/outfits', { method: 'POST', body: JSON.stringify({ itemIds: suggestion.itemIds }) }, () => {
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
      }, (body) => toast(body.duplicate ? '这套已经在穿搭集里' : '已保存到穿搭集'));
    },
    adoptOutfitSuggestion: async () => {
      if (outfitAdopted || suggestion.itemIds.length === 0) return false;
      return commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'outfit' }) }, () => {
        bumpWears(suggestion.itemIds);
        setOutfitAdopted(true);
        markTip('outfit');
        toast('已采纳今日穿搭');
      }, () => toast('已采纳今日穿搭'));
    },
    refreshSuggestion: async () => {
      return commit('/api/wardrobe/suggestion/refresh', { method: 'POST' }, () => {
        setSuggestionIndex((index) => index + 1);
        setOutfitAdopted(false);
        toast('换了一套建议');
      }, () => toast('换了一套建议'));
    },
    toggleWeather: async () => {
      return commit('/api/session/weather', { method: 'POST' }, () => {
        setWeatherOn((on) => !on);
        setWeatherLabel((label) => (label === '天气未知' ? '22°C 多云' : '天气未知'));
        setSuggestionIndex(0);
        setOutfitAdopted(false);
      });
    },
    addMeal: async (input, shortcutDraftId) => {
      const demo = shortcutDraftId ? undefined : () => {
        setMeals((current) => [...current, { ...input, id: uid('m'), date: input.date || localDate() }]);
        toast(`已记下${input.slot}`);
      };
      return commit('/api/meals', { method: 'POST', body: JSON.stringify({ ...input, shortcutDraftId }) }, demo, () => toast(`已记下${input.slot}`));
    },
    estimateMeal: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      if (sourceRef.current === 'api') {
        try {
          const body = await api<{ draft: MealDraft }>('/api/meals/estimate', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
          return body.draft;
        } catch (error) {
          toast(`服务暂不可用，使用本机估算：${errorDetail(error)}`);
        }
      }
      return estimateMealText(trimmed, recipes);
    },
    updateMeal: async (meal) => {
      return commit(`/api/meals/${meal.id}`, { method: 'PATCH', body: JSON.stringify(meal) }, () => {
        setMeals((current) => current.map((row) => (row.id === meal.id ? meal : row)));
        toast('餐次已更新');
      }, () => toast('餐次已更新'));
    },
    removeMeal: async (id) => {
      return commit(`/api/meals/${id}`, { method: 'DELETE' }, () => {
        setMeals((current) => current.filter((meal) => meal.id !== id));
        toast('已删除这条餐次');
      }, () => toast('已删除这条餐次'));
    },
    addRecipe: async (input) => {
      const name = input.name.trim();
      if (!name) return false;
      const tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
      return commit('/api/recipes', { method: 'POST', body: JSON.stringify({ ...input, name, tags }) }, () => {
        setRecipes((current) => [{ ...input, id: uid('r'), name, tags }, ...current]);
        toast(`已加入食谱「${name}」`);
      }, () => toast(`已加入食谱「${name}」`));
    },
    applyRecipe: async (id, date = localDate()) => {
      const recipe = recipes.find((item) => item.id === id);
      if (!recipe) return false;
      return commit(`/api/recipes/${id}/apply`, { method: 'POST', body: JSON.stringify({ date }) }, () => {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setMeals((current) => [
          ...current,
          { id: uid('m'), slot: recipe.slot, name: recipe.name, time, date, kcal: recipe.kcal, protein: recipe.protein, carb: recipe.carb, fat: recipe.fat },
        ]);
        toast(`已把「${recipe.name}」加入${recipe.slot}`);
      }, () => toast(`已把「${recipe.name}」加入${recipe.slot}`));
    },
    setTargets: async (next) => {
      return commit('/api/nutrition-target', { method: 'PUT', body: JSON.stringify(next) }, () => {
        setTargetsState(next);
        toast(next.kcal > 0 ? '营养目标已更新' : '已清除营养目标');
      }, () => toast(next.kcal > 0 ? '营养目标已更新' : '已清除营养目标'));
    },
    toggleDevice: async (id) => {
      const device = devices.find((item) => item.id === id);
      if (!device || device.offline) return false;
      return previewControl(device.name, `/api/devices/${encodeURIComponent(id)}/toggle`, [{ id, label: device.name, change: { on: !device.on } }], () => {
        setDevices((current) => current.map((item) => (item.id === id ? { ...item, on: !item.on } : item)));
      });
    },
    unbindDevice: async (id) => {
      return commit(`/api/devices/${id}`, { method: 'DELETE' }, () => {
        setDevices((current) => current.filter((device) => device.id !== id));
        toast('设备已解绑');
      }, () => toast('设备已解绑'));
    },
    bindSampleDevices: async () => {
      return commit('/api/devices/bind-sample', { method: 'POST' }, () => {
        setDevices((current) => {
          const ids = new Set(current.map((device) => device.id));
          const missing = SEED_DEVICES.filter((device) => !ids.has(device.id)).map((device) => ({ ...device }));
          return [...current, ...missing];
        });
        toast('已绑定演示设备');
      }, () => toast('已绑定演示设备'));
    },
    applyScene: async (name) => {
      const steps = devices.flatMap((device) => {
        const next = nextDevice(device, name);
        return next.on === device.on && next.paramValue === device.paramValue ? [] : [{ id: device.id, label: device.name, change: { on: next.on, paramValue: next.paramValue } }];
      });
      return previewControl(name, `/api/scenes/${encodeURIComponent(name)}`, steps, () => applyScene(name));
    },
    bindScene: async (name, target) => {
      return commit(`/api/home/scenes/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ target }) }, () => {
        setHomeState((current) => ({ ...current, sceneBindings: { ...current.sceneBindings, [name]: target } }));
      }, () => toast(target === 'devices' ? `「${name}」改为按设备动作` : `「${name}」已绑到场景`));
    },
    handleAlert: async (id) => {
      return commit(`/api/alerts/${id}/handle`, { method: 'POST' }, () => {
        setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, handled: true } : alert)));
        if (id === 'a-filter' || id.startsWith('ha-')) markTip('filter');
        toast('已记下，稍后处理');
      }, () => toast('已记下，稍后处理'));
    },
    selectTrip: async (id) => {
      return commit(`/api/trips/${id}/select`, { method: 'POST' }, () => {
        setActiveTripId(id);
      });
    },
    togglePack: async (tripId, packId) => {
      return commit(`/api/trips/${tripId}/packing/${packId}`, { method: 'POST' }, () => {
        setTrips((current) =>
          current.map((trip) =>
            trip.id === tripId
              ? { ...trip, packing: trip.packing.map((item) => (item.id === packId ? { ...item, done: !item.done } : item)) }
              : trip,
          ),
        );
      });
    },
    addTrip: async (input) => {
      return commit('/api/trips', { method: 'POST', body: JSON.stringify(input) }, () => {
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
      }, () => toast('行程已创建'));
    },
    removeTrip: async (id) => {
      return commit(`/api/trips/${id}`, { method: 'DELETE' }, () => {
        const remaining = trips.filter((trip) => trip.id !== id);
        setTrips(remaining);
        setActiveTripId((selected) => (selected === id ? (remaining[0]?.id ?? '') : selected));
        toast('行程已删除');
      }, () => toast('行程已删除'));
    },
    adoptPrep: async (tripId, confirmation) => {
      const trip = trips.find((item) => item.id === tripId);
      if (!trip || trip.prepAdopted) return false;
      return commit(`/api/trips/${tripId}/adopt-prep`, { method: 'POST', body: JSON.stringify({ confirmation }) }, () => {
        setTrips((current) => current.map((item) => (item.id === tripId ? { ...item, prepAdopted: true } : item)));
        markTip('prep');
        toast('已采纳出行穿搭');
      }, () => toast('已采纳出行穿搭'));
    },
    addExpense: async (input) => {
      return commit('/api/expenses', { method: 'POST', body: JSON.stringify(input) }, () => {
        setExpenses((current) => [{ ...input, id: uid('e') }, ...current]);
        toast('已记上一笔');
      }, () => toast('已记上一笔'));
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
        const status = error instanceof ApiError ? error.status : 0;
        toast(status === 503 ? '先在设置里接上能看图的模型' : `这份账单没有读出来：${errorDetail(error)}`);
        return null;
      }
    },
    importExpenses: async (rows) => {
      let receipt: BillImportReceipt | { reviewRows: BillDraft[] } | null = null;
      await commit('/api/bills/import', { method: 'POST', body: JSON.stringify({ rows }) }, undefined, (body) => {
        receipt = body.reviewRows ? { reviewRows: body.reviewRows } : body.receipt ?? null;
      });
      return receipt;
    },
    removeExpense: async (id) => {
      return commit(`/api/expenses/${id}`, { method: 'DELETE' }, () => {
        setExpenses((current) => current.filter((item) => item.id !== id));
        toast('已删除这条流水');
      }, () => toast('已删除这条流水'));
    },
    setBudgets: async (next) => {
      return commit('/api/budgets', { method: 'PUT', body: JSON.stringify(next) }, () => {
        setBudgetsState(next);
        toast('预算已更新');
      }, () => toast('预算已更新'));
    },
    setNotice: async (key, value) => {
      return commit('/api/notices', { method: 'PUT', body: JSON.stringify({ [key]: value }) }, () => {
        setNotices((current) => ({ ...current, [key]: value }));
      });
    },
    setModel: async (input) => {
      return commit('/api/model', { method: 'PUT', body: JSON.stringify(input) }, undefined, () => toast('模型连接已保存'));
    },
    setHome: async (input) => {
      return commit('/api/home', { method: 'PUT', body: JSON.stringify(input) }, undefined, () => toast('家居地址已保存'));
    },
    syncHome: () => commit('/api/home/sync', { method: 'POST' }, undefined, () => toast('已从 Home Assistant 同步设备')),
    parseTrip: async (text) => {
      if (sourceRef.current !== 'api') {
        toast('本地服务没开，行程还解析不了');
        return null;
      }
      try {
        const body = await api<{ draft: ItineraryDraft }>('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text }) });
        return body.draft;
      } catch (error) {
        toast(`这份短信或邮件没有读出行程：${errorDetail(error)}`);
        return null;
      }
    },
    importTrip: (draft) => commit('/api/trips/import', { method: 'POST', body: JSON.stringify({ draft }) }, undefined, body => toast(body.duplicate ? '已打开已有行程' : `已写入「${draft.title}」`)),
    runChain: async (tripId, month) => {
      try {
        const { chain } = await api<{ chain: TripChain }>(`/api/trips/${tripId}/chain${month ? `?month=${encodeURIComponent(month)}` : ''}`, { method: 'POST' });
        return chain;
      } catch (error) { setWriteMessage(`准备包预览失败：${errorDetail(error)}`); return null; }
    },
    adoptTripMeal: async (tripId, name) => {
      return commit(`/api/trips/${tripId}/meal`, { method: 'POST', body: JSON.stringify({ name }) }, () => {
        if (!meals.some((meal) => meal.name === name && meal.date === localDate())) {
          setMeals((current) => [...current, { id: uid('m'), slot: '午餐', name, time: '12:30', date: localDate(), kcal: 420, protein: 42, carb: 18, fat: 16 }]);
        }
        toast(`已记下「${name}」`);
      }, () => toast(`已记下「${name}」`));
    },
    addPackingLine: async (tripId, text) => {
      return commit(`/api/trips/${tripId}/packing`, { method: 'POST', body: JSON.stringify({ text }) }, () => {
        setTrips((current) => current.map((trip) => (
          trip.id === tripId && !trip.packing.some((item) => item.text === text)
            ? { ...trip, packing: [...trip.packing, { id: uid('p'), text, done: false }] }
            : trip
        )));
      });
    },
    editPackingLine: (tripId, packId, text) => commit(`/api/trips/${tripId}/packing/${packId}`, { method: 'PATCH', body: JSON.stringify({ text }) }, () => {
      setTrips(current => current.map(trip => trip.id === tripId ? { ...trip, packing: trip.packing.map(item => item.id === packId ? { ...item, text } : item) } : trip));
    }),
    savePackingTemplate: async (tripId, name) => {
      return commit('/api/packing-templates', { method: 'POST', body: JSON.stringify({ tripId, name }) }, () => {
        const trip = trips.find((item) => item.id === tripId);
        if (!trip) return;
        setPackingTemplates((current) => [...current, { id: uid('pack'), name, items: trip.packing.map((item) => item.text) }]);
        toast(`已保存行李模板「${name}」`);
      }, () => toast(`已保存行李模板「${name}」`));
    },
    applyPackingTemplate: async (tripId, templateId) => {
      return commit(`/api/trips/${tripId}/packing-template`, { method: 'POST', body: JSON.stringify({ templateId }) }, () => {
        const template = packingTemplates.find((item) => item.id === templateId);
        if (!template) return;
        setTrips((current) => current.map((trip) => {
          if (trip.id !== tripId) return trip;
          const owned = new Set(trip.packing.map((item) => item.text));
          const extra = template.items.filter((text) => !owned.has(text)).map((text) => ({ id: uid('p'), text, done: false }));
          return { ...trip, packing: [...trip.packing, ...extra] };
        }));
      });
    },
    addTripExpense: async (tripId, input) => {
      return commit(`/api/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify(input) }, () => {
        setExpenses((current) => [{ id: uid('e'), tag: '行', amount: input.amount, date: localDate(), merchant: input.merchant, note: input.kind, tripId }, ...current]);
        toast('已记到这趟行程');
      }, () => toast('已记到这趟行程'));
    },
    adoptActions: async (actions, key) => {
      return commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key, actions }) }, () => {
        if (key === 'cross') {
          setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
          setSuggestionIndex(1);
          setWeatherOn(true);
          setOutfitAdopted(true);
          markTip('cross');
          toast('已按衣食住行支记下：风衣、清淡午餐、北京行李和差旅账。家居动作请单独确认');
        }
      }, () => toast(key === 'cross' ? '已按衣食住行支记下：风衣、清淡午餐、北京行李和差旅账。家居动作请单独确认' : '已采纳'));
    },
    adoptProteinTip: async () => {
      const picked = pickRecipe(recipes, meals.filter((meal) => meal.date === localDate()), targets);
      if (!picked) return false;
      return commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'protein' }) }, () => {
        if (!meals.some((meal) => meal.name === picked.name && meal.date === localDate())) {
          setMeals((current) => [
            ...current,
            { id: uid('m'), slot: picked.slot, name: picked.name, time: '18:30', date: localDate(), kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat },
          ]);
        }
        markTip('protein');
        toast(`已按建议补上${picked.name}`);
      }, () => toast(`已按建议补上${picked.name}`));
    },
    dismissHomeAlerts: async () => {
      const ids = alerts.filter((alert) => !alert.handled && alert.id.startsWith('ha-')).map((alert) => alert.id);
      for (const id of ids) {
        if (!await value.handleAlert(id)) return false;
      }
      return ids.length > 0;
    },
    adoptFilterTip: async () => {
      return commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'filter' }) }, () => {
        setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
        markTip('filter');
        toast('已把滤芯更换记进待办');
      }, () => toast('已把滤芯更换记进待办'));
    },
    executeCrossPlan: async () => {
      if (adoptedTips.includes('cross')) return false;
      return commit('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'cross' }) }, () => {
        setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
        setSuggestionIndex(1);
        setWeatherOn(true);
        setOutfitAdopted(true);
        markTip('outfit');
        setMeals((current) => (
          current.some((meal) => meal.name === '鸡胸温蔬藜麦')
            ? current
            : [...current, { id: 'm-cross', slot: '午餐', name: '鸡胸温蔬藜麦', time: '12:40', date: localDate(), kcal: 550, protein: 45, carb: 48, fat: 14 }]
        ));
        markTip('protein');
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
            : [{ id: 'e-cross', tag: '行', amount: 2400, date: localDate(), merchant: '差旅专账', note: '技术交流会' }, ...current]
        ));
        setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
        markTip('filter');
        markTip('cross');
        toast('已按衣食住行支记下：风衣、清淡午餐、北京行李和差旅账。家居动作请单独确认');
      }, () => toast('已采纳跨模块安排'));
    },
    markTip: async (id) => {
      return commit('/api/session/tips', { method: 'POST', body: JSON.stringify({ id }) }, () => {
        markTip(id);
      });
    },
  };

  return <StoreContext.Provider value={value}>{children}{control && <HomeConfirmation {...control} saving={saving} message={writeMessage} onConfirm={() => void confirmControl()} onClose={() => setControl(null)} />}</StoreContext.Provider>;
}

// Hook lives next to the provider so pages share one session store.
// oxlint-disable-next-line react/only-export-components
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Store missing');
  return store;
}
