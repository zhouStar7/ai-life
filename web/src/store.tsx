import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { ApiError, api, isRejected } from './api/client';
import { loadPending, loadSnapshot, savePending, saveSnapshot, type PendingWrite } from './api/snapshot';
import { tripStatus } from '../../shared/trips';
import { useAuth } from './auth';
import { todayIso } from './calendar';
import { DIET_TODAY, estimateMeal as estimateMealText, pickRecipe, type MealDraft } from './dietPlan';
import { uid } from './format';
import { draftsFromOrder, planOutfit } from './wardrobePlan';
import {
  SEED_DEVICES,
} from './seed';
import type {
  SpendingSummary,
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
  PackingTemplate,
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
  spending: SpendingSummary;
  budgets: Budgets;
  notices: NoticePrefs;
  adoptedTips: string[];
  toasts: Toast[];
  addItem: (input: Omit<WardrobeItem, 'id' | 'wears' | 'createdAt'>) => Promise<boolean>;
  addItems: (inputs: ClothingDraft[]) => Promise<boolean>;
  recognizeClothing: (image: string) => Promise<ClothingDraft | 'manual' | null>;
  draftFromOrder: (text: string) => Promise<ClothingDraft[]>;
  updateItem: (item: WardrobeItem) => Promise<boolean>;
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
  bindScene: (name: SceneName, target: string) => void;
  handleAlert: (id: string) => void;
  dismissHomeAlerts: () => void;
  selectTrip: (id: string) => void;
  togglePack: (tripId: string, packId: string) => void;
  addTrip: (input: Pick<Trip, 'title' | 'status' | 'transport' | 'dateLabel' | 'startDate' | 'endDate'>) => void;
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
  adoptTripMeal: (tripId: string, name: string) => void;
  addPackingLine: (tripId: string, text: string) => void;
  savePackingTemplate: (tripId: string, name: string) => void;
  applyPackingTemplate: (tripId: string, templateId: string) => void;
  addTripExpense: (tripId: string, input: { amount: number; merchant: string; kind: '票务' | '食宿' }) => void;
  weatherLabel: string;
  dataReady: boolean;
  loadError: boolean;
  retryConnection: () => void;
  authReady: boolean;
  canRegister: boolean;
  member: { id: string; username: string; name: string } | null;
  login: (username: string, password: string) => Promise<string | null>;
  register: (username: string, name: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  addMember: (input: { username: string; name: string; password: string }) => Promise<string | null>;
  online: boolean;
  saveState: 'saved' | 'unsaved' | 'offline';
  model: { configured: boolean; baseUrl: string; model: string };
  home: HomeLink;
  packingTemplates: PackingTemplate[];
  suggestion: { title: string; reason: string; itemIds: string[]; source: 'model' | 'rules' };
  suggesting: boolean;
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
  spending: SpendingSummary;
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
  const auth = useAuth();
  const { member } = auth;
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [weatherOn, setWeatherOn] = useState(true);
  const [outfitAdopted, setOutfitAdopted] = useState(false);
  const [activeOutfitId, setActiveOutfitId] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [targets, setTargetsState] = useState<NutritionTarget>({ kcal: 0, protein: 0, carb: 0, fat: 0 });
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<HomeAlert[]>([]);
  const [activeScene, setActiveScene] = useState<SceneName | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [spending, setSpending] = useState<SpendingSummary>({ month: todayIso().slice(0, 7), monthTotal: 0, byTag: { 衣: 0, 食: 0, 住: 0, 行: 0 }, trend: [] });
  const [budgets, setBudgetsState] = useState<Budgets>({ total: 0, 衣: 0, 食: 0, 住: 0, 行: 0 });
  const [notices, setNotices] = useState<NoticePrefs>({ outfit: true, budget: true, device: true });
  const [adoptedTips, setAdoptedTips] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [weatherLabel, setWeatherLabel] = useState('22°C 多云');
  const [modelSuggestion, setModelSuggestion] = useState<{ title: string; reason: string; itemIds: string[]; source: 'model' | 'rules' } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [online, setOnline] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'offline'>('offline');
  const [model, setModelState] = useState({ configured: false, baseUrl: '', model: '' });
  const [home, setHomeState] = useState<HomeLink>({ configured: false, baseUrl: 'http://192.168.0.111:8123', connected: false, sceneCatalog: [], sceneBindings: {} });
  const [packingTemplates, setPackingTemplates] = useState<PackingTemplate[]>([]);
  const onlineRef = useRef(false);
  const queueRef = useRef<PendingWrite[]>([]);
  const memberRef = useRef('');
  const writeTail = useRef<Promise<unknown>>(Promise.resolve());
  const flushing = useRef<Promise<void> | null>(null);
  const connecting = useRef(false);

  function applyRemote(snapshot: RemoteSnapshot) {
    if (!('partial' in snapshot)) setDataReady(true);
    setLoadError(false);
    if ('spending' in snapshot) setSpending(snapshot.spending);
    if ('items' in snapshot) setItems(snapshot.items);
    if ('outfits' in snapshot) setOutfits(snapshot.outfits);
    if ('meals' in snapshot) setMeals(snapshot.meals);
    if ('recipes' in snapshot) setRecipes(snapshot.recipes);
    if ('targets' in snapshot) setTargetsState(snapshot.targets);
    if ('devices' in snapshot) setDevices(snapshot.devices);
    if ('alerts' in snapshot) setAlerts(snapshot.alerts);
    if ('trips' in snapshot) setTrips(snapshot.trips);
    if ('expenses' in snapshot) setExpenses(snapshot.expenses);
    if ('budgets' in snapshot) setBudgetsState(snapshot.budgets);
    if ('notices' in snapshot) setNotices(snapshot.notices);
    if ('suggestionIndex' in snapshot) setSuggestionIndex(snapshot.suggestionIndex);
    if ('weatherOn' in snapshot) setWeatherOn(snapshot.weatherOn);
    if ('weatherLabel' in snapshot) setWeatherLabel(snapshot.weatherLabel || '22°C 多云');
    if ('outfitAdopted' in snapshot) setOutfitAdopted(snapshot.outfitAdopted);
    if ('activeOutfitId' in snapshot) setActiveOutfitId(snapshot.activeOutfitId);
    if ('activeScene' in snapshot) setActiveScene(snapshot.activeScene);
    if ('activeTripId' in snapshot) setActiveTripId(snapshot.activeTripId || 't-bj');
    if ('adoptedTips' in snapshot) setAdoptedTips(snapshot.adoptedTips);
    if ('model' in snapshot) setModelState(snapshot.model);
    if ('home' in snapshot) setHomeState({
      configured: snapshot.home?.configured ?? false,
      baseUrl: snapshot.home?.baseUrl || 'http://192.168.0.111:8123',
      connected: snapshot.home?.connected ?? false,
      sceneCatalog: snapshot.home?.sceneCatalog ?? [],
      sceneBindings: snapshot.home?.sceneBindings ?? {},
    });
    if ('packingTemplates' in snapshot) setPackingTemplates(snapshot.packingTemplates ?? []);
  }

  useEffect(() => {
    if (!member) return;
    let cancel = false;
    const memberId = member.id;
    memberRef.current = memberId;
    async function connect() {
      if (cancel || memberRef.current !== memberId || connecting.current) return;
      connecting.current = true;
      try {
        const snapshot = await api<RemoteSnapshot>('/api/snapshot');
        if (cancel || memberRef.current !== memberId) return;
        markOnline(true);
        if (queueRef.current.length === 0) {
          applyRemote(snapshot);
          void saveSnapshot(memberId, snapshot);
          setSaveState('saved');
        } else {
          applyRemote(snapshot);
          await flushQueue();
          if (!cancel && queueRef.current.length === 0) applyRemote(await api<RemoteSnapshot>('/api/snapshot'));
        }
        try {
          const suggestion = await api<{ title?: string; reason?: string; itemIds?: string[]; source?: string }>('/api/wardrobe/suggestion');
          if (!cancel && memberRef.current === memberId) takeSuggestion(suggestion);
        } catch {
          if (!cancel && memberRef.current === memberId) setModelSuggestion(null);
        }
      } catch (error) {
        if (cancel || memberRef.current !== memberId) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === -1)) return;
        markOnline(false);
        setLoadError(true);
        {
          const cached = await loadSnapshot<RemoteSnapshot>(memberId);
          if (!cancel && memberRef.current === memberId && cached) applyRemote(cached);
          setSaveState(queueRef.current.length ? 'unsaved' : 'offline');
        }
      } finally { connecting.current = false; }
    }
    void loadPending(memberId).then((queue) => {
      if (cancel || memberRef.current !== memberId) return;
      queueRef.current = queue;
      if (queue.length > 0) setSaveState('unsaved');
      void connect();
    }).catch(() => {
      if (!cancel) void connect();
    });
    const timer = window.setInterval(() => {
      if (memberRef.current === memberId && (!onlineRef.current || queueRef.current.length > 0)) void connect();
    }, 5000);
    const onOnline = () => { void connect(); };
    window.addEventListener('online', onOnline);
    return () => {
      cancel = true;
      memberRef.current = '';
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
    // 登录后连本机库；断线后只重试当前成员的待同步修改。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  function markOnline(value: boolean) {
    onlineRef.current = value;
    setOnline(value);
  }

  function send(path: string, init: RequestInit | undefined, track: boolean) {
    const memberId = memberRef.current;
    const headers = new Headers(init?.headers);
    if (!headers.has('idempotency-key')) headers.set('idempotency-key', crypto.randomUUID());
    const operation: PendingWrite = {
      id: headers.get('idempotency-key')!, path, method: init?.method ?? 'POST',
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    async function queue() {
      if (!queueRef.current.some(item => item.id === operation.id)) queueRef.current = [...queueRef.current, operation];
      await savePending(memberId, queueRef.current).catch(() => toast('无法缓存修改，请保持页面打开后重试'));
      setSaveState('unsaved');
    }
    const run = async () => {
      if (!memberId || memberRef.current !== memberId) return 'unauthorized' as const;
      if (track && queueRef.current.length > 0) { await queue(); return 'offline' as const; }
      try {
        const body = await api<{ snapshot?: RemoteSnapshot } & RemoteSnapshot>(path, { ...init, headers });
        if (memberRef.current !== memberId) return 'unauthorized' as const;
        const snapshot = body.snapshot ?? body;
        if (snapshot && typeof snapshot === 'object' && ('items' in snapshot || 'partial' in snapshot)) {
          applyRemote(snapshot);
        }
        markOnline(true);
        if (queueRef.current.length === 0) setSaveState('saved');
        return 'saved' as const;
      } catch (error) {
        if (memberRef.current !== memberId || (error instanceof ApiError && [401, -1].includes(error.status))) return 'unauthorized' as const;
        if (isRejected(error)) return 'rejected' as const;
        if (track) await queue();
        markOnline(false); setSaveState('unsaved');
        return 'offline' as const;
      }
    };
    const result = writeTail.current.then(run, run);
    writeTail.current = result;
    return result;
  }

  function flushQueue(): Promise<void> {
    if (flushing.current) return flushing.current;
    const memberId = memberRef.current;
    flushing.current = (async () => {
      while (queueRef.current.length > 0 && memberRef.current === memberId) {
        const next = queueRef.current[0];
        const result = await send(next.path, {
          method: next.method, body: next.body, headers: { 'idempotency-key': next.id },
        }, false);
        if (result === 'offline' || result === 'unauthorized') return;
        queueRef.current = queueRef.current.filter(item => item.id !== next.id);
        await savePending(memberId, queueRef.current).catch(() => undefined);
        if (result === 'rejected') toast('有一条修改无法同步，请检查当前记录后重试');
      }
      if (memberRef.current === memberId) setSaveState('saved');
    })().finally(() => { flushing.current = null; });
    return flushing.current;
  }

  async function settle(path: string, init: RequestInit | undefined, message: string, applyLocal?: () => void) {
    const result = await send(path, init, true);
    if (result === 'saved') {
      if (message) toast(message);
      return 'saved' as const;
    }
    if (result === 'unauthorized') return 'rejected' as const;
    if (result === 'rejected') {
      toast('没有保存，请检查填写内容');
      return 'rejected' as const;
    }
    applyLocal?.();
    toast('未保存，连接恢复后会自动同步');
    return 'offline' as const;
  }

  useEffect(() => {
    if (!dataReady || !member) return;
    const snapshot = { items, outfits, meals, recipes, targets, devices, alerts, trips, expenses, spending, budgets, notices,
      suggestionIndex, weatherOn, weatherLabel, outfitAdopted, activeOutfitId, activeScene, activeTripId,
      adoptedTips, model, home, packingTemplates };
    void saveSnapshot(member.id, snapshot).catch(() => undefined);
  }, [dataReady, member, items, outfits, meals, recipes, targets, devices, alerts, trips, expenses, spending, budgets, notices,
    suggestionIndex, weatherOn, weatherLabel, outfitAdopted, activeOutfitId, activeScene, activeTripId,
    adoptedTips, model, home, packingTemplates]);

  function takeSuggestion(body: { title?: string; reason?: string; itemIds?: string[]; source?: string } | null | undefined) {
    if (!body || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      setModelSuggestion(null);
      return;
    }
    setModelSuggestion({
      title: body.title?.trim() || '',
      reason: body.reason?.trim() || '',
      itemIds: body.itemIds,
      source: body.source === 'model' ? 'model' : 'rules',
    });
  }

  async function pullSuggestion() {
    if (!onlineRef.current) return;
    try {
      takeSuggestion(await api<{ title?: string; reason?: string; itemIds?: string[]; source?: string }>('/api/wardrobe/suggestion'));
    } catch {
      setModelSuggestion(null);
    }
  }

  const localSuggestion = useMemo(
    () => ({ ...planOutfit(items, suggestionIndex, weatherOn, weatherLabel), source: 'rules' as const }),
    [items, suggestionIndex, weatherLabel, weatherOn],
  );
  const suggestion = useMemo(() => {
    if (!modelSuggestion) return localSuggestion;
    const known = new Set(items.map((item) => item.id));
    if (modelSuggestion.itemIds.some((id) => !known.has(id))) return localSuggestion;
    return modelSuggestion;
  }, [items, localSuggestion, modelSuggestion]);

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
    trips: trips.map(trip => ({ ...trip, status: tripStatus(trip, todayIso()) })),
    activeTripId,
    expenses,
    spending,
    budgets,
    notices,
    adoptedTips,
    toasts,
    suggestion,
    weatherLabel,
    suggesting,
    ...auth,
    dataReady, loadError,
    retryConnection: () => window.dispatchEvent(new Event('online')),
    addMember: async (input) => {
      try {
        await api('/api/members', { method: 'POST', body: JSON.stringify(input) });
        toast(`已添加家庭成员「${input.name}」`);
        return null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) return '这个用户名已经有人用了';
        return '没有添加成功，用户名用小写字母或数字，密码至少 6 位';
      }
    },
    online,
    saveState,
    model,
    home,
    packingTemplates,
    addItem: async (input) => {
      const result = await settle('/api/items', { method: 'POST', body: JSON.stringify(input) }, `已加入「${input.name}」`, () => {
        setItems((current) => [{ ...input, id: uid('w'), wears: 0, createdAt: todayIso() }, ...current]);
      });
      if (result === 'saved') void pullSuggestion();
      return result !== 'rejected';
    },
    addItems: async (inputs) => {
      if (inputs.length === 0) return false;
      const message = inputs.length === 1 ? `已加入「${inputs[0].name}」` : `已加入 ${inputs.length} 件`;
      const result = await settle('/api/items/batch', { method: 'POST', body: JSON.stringify({ items: inputs }) }, message, () => {
        setItems((current) => [
          ...inputs.map((input) => ({ ...input, id: uid('w'), wears: 0, createdAt: todayIso() })),
          ...current,
        ]);
      });
      if (result === 'saved') void pullSuggestion();
      return result !== 'rejected';
    },
    recognizeClothing: async (image) => {
      if (!onlineRef.current) return 'manual';
      try {
        return await api<ClothingDraft>('/api/wardrobe/recognize', { method: 'POST', body: JSON.stringify({ image }) });
      } catch (error) {
        const status = error instanceof Error ? error.message : '';
        if (status === '503' || status === '0') return 'manual';
        toast('这张照片没有识别出来');
        return null;
      }
    },
    draftFromOrder: async (text) => {
      if (onlineRef.current) {
        try {
          const body = await api<{ drafts: ClothingDraft[] }>('/api/wardrobe/drafts', {
            method: 'POST',
            body: JSON.stringify({ text }),
          });
          return body.drafts;
        } catch (error) {
          if (!isRejected(error)) markOnline(false);
        }
      }
      return draftsFromOrder(text);
    },
    updateItem: async (item) => {
      const result = await settle(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(item) }, '单品已更新', () => {
        setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
      });
      if (result === 'saved') void pullSuggestion();
      return result !== 'rejected';
    },
    removeItem: (id) => {
      void (async () => {
        const result = await settle(`/api/items/${id}`, { method: 'DELETE' }, '已从衣橱移除', () => {
          setItems((current) => current.filter((item) => item.id !== id));
        });
        if (result === 'saved') await pullSuggestion();
      })();
    },
    toggleFavorite: (id) => {
      void settle(`/api/outfits/${id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: !outfits.find(o => o.id === id)?.favorite }) }, '', () => {
        setOutfits((current) => current.map((outfit) => (outfit.id === id ? { ...outfit, favorite: !outfit.favorite } : outfit)));
      });
    },
    applyOutfit: (id) => {
      const outfit = outfits.find((item) => item.id === id);
      if (!outfit) return;
      void settle(`/api/outfits/${id}/apply`, { method: 'POST' }, `已套用「${outfit.name}」`, () => {
        bumpWears(outfit.itemIds);
        setActiveOutfitId(id);
      });
    },
    saveSuggestion: () => {
      const headers = { 'idempotency-key': crypto.randomUUID() };
      if (suggestion.itemIds.length === 0) {
        toast('先添加单品，再保存穿搭');
        return;
      }
      void (async () => {
        try {
          const body = await api<{ snapshot: RemoteSnapshot; duplicate?: boolean }>('/api/outfits', {
            method: 'POST', headers,
            body: JSON.stringify({ itemIds: suggestion.itemIds }),
          });
          applyRemote(body.snapshot);
          markOnline(true);
          setSaveState(queueRef.current.length === 0 ? 'saved' : 'unsaved');
          toast(body.duplicate ? '这套已经在穿搭集里' : '已保存到穿搭集');
        } catch (error) {
          if (isRejected(error)) {
            toast('没有保存，请检查填写内容');
            return;
          }
          const exists = outfits.some((outfit) => outfit.itemIds.join() === suggestion.itemIds.join());
          if (exists) {
            toast('这套已经在穿搭集里');
            return;
          }
          await settle('/api/outfits', { method: 'POST', headers, body: JSON.stringify({ itemIds: suggestion.itemIds }) }, '', () => {
            setOutfits((current) => [
              { id: uid('o'), name: `今日推荐 ${current.length + 1}`, itemIds: suggestion.itemIds, favorite: false },
              ...current,
            ]);
          });
        }
      })();
    },
    adoptOutfitSuggestion: () => {
      if (outfitAdopted || suggestion.itemIds.length === 0) return;
      void settle('/api/agent/adopt', {
        method: 'POST',
        body: JSON.stringify({ key: 'outfit', actions: [{ type: 'adopt_outfit', itemIds: suggestion.itemIds }] }),
      }, '已采纳今日穿搭', () => {
        bumpWears(suggestion.itemIds);
        setOutfitAdopted(true);
        markTip('outfit');
      });
    },
    refreshSuggestion: () => {
      void (async () => {
        const headers = { 'idempotency-key': crypto.randomUUID() };
        const bodyText = JSON.stringify({ avoid: suggestion.itemIds });
        setSuggesting(true);
        try {
          try {
            const body = await api<{ snapshot: RemoteSnapshot; suggestion?: { title?: string; reason?: string; itemIds?: string[]; source?: string } }>('/api/wardrobe/suggestion/refresh', {
              method: 'POST', headers,
              body: bodyText,
            });
            applyRemote(body.snapshot);
            takeSuggestion(body.suggestion);
            markOnline(true);
            toast('换了一套建议');
          } catch (error) {
            if (isRejected(error)) {
              toast('没有保存，请检查填写内容');
              return;
            }
            const result = await settle('/api/wardrobe/suggestion/refresh', {
              method: 'POST', headers, body: bodyText,
            }, '', () => {
              setModelSuggestion(null);
              setSuggestionIndex((index) => index + 1);
              setOutfitAdopted(false);
            });
            if (result === 'saved') {
              await pullSuggestion();
              toast('换了一套建议');
            }
          }
        } finally {
          setSuggesting(false);
        }
      })();
    },
    toggleWeather: () => {
      void (async () => {
        setModelSuggestion(null);
        const result = await settle('/api/session/weather', { method: 'POST' }, '', () => {
          setWeatherOn((on) => !on);
          setWeatherLabel((label) => (label === '天气未知' ? '22°C 多云' : '天气未知'));
          setSuggestionIndex(0);
          setOutfitAdopted(false);
        });
        if (result === 'saved') await pullSuggestion();
      })();
    },
    addMeal: (input) => {
      void settle('/api/meals', { method: 'POST', body: JSON.stringify(input) }, `已记下${input.slot}`, () => {
        setMeals((current) => [...current, { ...input, id: uid('m'), date: input.date || DIET_TODAY }]);
      });
    },
    estimateMeal: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      if (onlineRef.current) {
        try {
          const body = await api<{ draft: MealDraft }>('/api/meals/estimate', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
          return body.draft;
        } catch (error) {
          if (!isRejected(error)) markOnline(false);
        }
      }
      return estimateMealText(trimmed, recipes);
    },
    updateMeal: (meal) => {
      void settle(`/api/meals/${meal.id}`, { method: 'PATCH', body: JSON.stringify(meal) }, '餐次已更新', () => {
        setMeals((current) => current.map((row) => (row.id === meal.id ? meal : row)));
      });
    },
    removeMeal: (id) => {
      void settle(`/api/meals/${id}`, { method: 'DELETE' }, '已删除这条餐次', () => {
        setMeals((current) => current.filter((meal) => meal.id !== id));
      });
    },
    addRecipe: (input) => {
      const name = input.name.trim();
      if (!name) return;
      const tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
      void settle('/api/recipes', { method: 'POST', body: JSON.stringify({ ...input, name, tags }) }, `已加入食谱「${name}」`, () => {
        setRecipes((current) => [{ ...input, id: uid('r'), name, tags }, ...current]);
      });
    },
    applyRecipe: (id) => {
      const recipe = recipes.find((item) => item.id === id);
      if (!recipe) return;
      void settle(`/api/recipes/${id}/apply`, { method: 'POST' }, `已把「${recipe.name}」加入${recipe.slot}`, () => {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setMeals((current) => [
          ...current,
          { id: uid('m'), slot: recipe.slot, name: recipe.name, time, date: DIET_TODAY, kcal: recipe.kcal, protein: recipe.protein, carb: recipe.carb, fat: recipe.fat },
        ]);
      });
    },
    setTargets: (next) => {
      const message = next.kcal > 0 ? '营养目标已更新' : '已清除营养目标';
      void settle('/api/nutrition-target', { method: 'PUT', body: JSON.stringify(next) }, message, () => {
        setTargetsState(next);
      });
    },
    toggleDevice: (id) => {
      const device = devices.find((item) => item.id === id);
      if (!device || device.offline) return;
      void settle(`/api/devices/${id}/toggle`, { method: 'POST' }, '', () => {
        setDevices((current) => current.map((item) => (item.id === id ? { ...item, on: !item.on } : item)));
      });
    },
    unbindDevice: (id) => {
      void settle(`/api/devices/${id}`, { method: 'DELETE' }, '设备已解绑', () => {
        setDevices((current) => current.filter((device) => device.id !== id));
      });
    },
    bindSampleDevices: () => {
      void settle('/api/devices/bind-sample', { method: 'POST' }, '已绑定演示设备', () => {
        setDevices((current) => {
          const ids = new Set(current.map((device) => device.id));
          const missing = SEED_DEVICES.filter((device) => !ids.has(device.id)).map((device) => ({ ...device }));
          return [...current, ...missing];
        });
      });
    },
    applyScene: (name) => {
      void settle(`/api/scenes/${encodeURIComponent(name)}`, { method: 'POST' }, `已切换「${name}」`, () => {
        applyScene(name);
      });
    },
    bindScene: (name, target) => {
      void settle(`/api/home/scenes/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ target }) }, target === 'devices' ? `「${name}」改为按设备动作` : `「${name}」已绑到场景`, () => {
        setHomeState((current) => ({ ...current, sceneBindings: { ...current.sceneBindings, [name]: target } }));
      });
    },
    handleAlert: (id) => {
      void settle(`/api/alerts/${id}/handle`, { method: 'POST' }, '已记下，稍后处理', () => {
        setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, handled: true } : alert)));
        if (id === 'a-filter' || id.startsWith('ha-')) markTip('filter');
      });
    },
    selectTrip: (id) => {
      void settle(`/api/trips/${id}/select`, { method: 'POST' }, '', () => {
        setActiveTripId(id);
      });
    },
    togglePack: (tripId, packId) => {
      void settle(`/api/trips/${tripId}/packing/${packId}`, { method: 'POST', body: JSON.stringify({ done: !trips.find(t => t.id === tripId)?.packing.find(p => p.id === packId)?.done }) }, '', () => {
        setTrips((current) =>
          current.map((trip) =>
            trip.id === tripId
              ? { ...trip, packing: trip.packing.map((item) => (item.id === packId ? { ...item, done: !item.done } : item)) }
              : trip,
          ),
        );
      });
    },
    addTrip: (input) => {
      void settle('/api/trips', { method: 'POST', body: JSON.stringify(input) }, '行程已创建', () => {
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
      });
    },
    removeTrip: (id) => {
      void settle(`/api/trips/${id}`, { method: 'DELETE' }, '行程已删除', () => {
        const remaining = trips.filter((trip) => trip.id !== id);
        setTrips(remaining);
        setActiveTripId((selected) => (selected === id ? (remaining[0]?.id ?? '') : selected));
      });
    },
    adoptPrep: (tripId) => {
      const trip = trips.find((item) => item.id === tripId);
      if (!trip || trip.prepAdopted) return;
      void settle(`/api/trips/${tripId}/adopt-prep`, { method: 'POST' }, '已采纳准备包：穿搭沿用今日建议，离家场景已打开', () => {
        setTrips((current) => current.map((item) => (item.id === tripId ? { ...item, prepAdopted: true } : item)));
        applyScene('离家', true);
        markTip('prep');
      });
    },
    addExpense: (input) => {
      void settle('/api/expenses', { method: 'POST', body: JSON.stringify(input) }, '已记上一笔', () => {
        setExpenses((current) => [{ ...input, id: uid('e') }, ...current]);
      });
    },
    previewBills: async (input) => {
      try {
        const body = await api<{ rows: BillDraft[] }>('/api/bills/preview', { method: 'POST', body: JSON.stringify(input) });
        markOnline(true);
        return body.rows;
      } catch (error) {
        if (error instanceof ApiError && error.status === 503) {
          toast('先在设置里接上能看图的模型');
          return null;
        }
        if (isRejected(error)) {
          toast('这份账单没有读出来');
          return null;
        }
        markOnline(false);
        toast('本地服务没开，账单还导不进来');
        return null;
      }
    },
    importExpenses: (rows) => {
      const ready = rows.filter((row): row is BillDraft & { tag: NonNullable<BillDraft['tag']> } => Boolean(row.tag) && !row.duplicate);
      if (ready.length === 0) {
        toast(rows.some((row) => row.duplicate) ? '这些账单都已经记过' : '先给每一笔选好衣食住行');
        return;
      }
      const headers = { 'idempotency-key': crypto.randomUUID() };
      void (async () => {
        try {
          const body = await api<{ snapshot: RemoteSnapshot; imported: number; skipped?: number }>('/api/bills/import', {
            method: 'POST', headers,
            body: JSON.stringify({ rows: ready }),
          });
          applyRemote(body.snapshot);
          markOnline(true);
          setSaveState(queueRef.current.length === 0 ? 'saved' : 'unsaved');
          toast((body.skipped ?? 0) > 0 ? `已导入 ${body.imported} 笔，跳过 ${body.skipped} 笔重复` : `已导入 ${body.imported} 笔，环图和预算已更新`);
        } catch (error) {
          if (isRejected(error)) {
            toast('没有保存，请检查填写内容');
            return;
          }
          await settle('/api/bills/import', { method: 'POST', headers, body: JSON.stringify({ rows: ready }) }, '', () => {
            setExpenses((current) => [...ready.map((row) => ({ ...row, id: uid('e') })), ...current]);
          });
        }
      })();
    },
    removeExpense: (id) => {
      void settle(`/api/expenses/${id}`, { method: 'DELETE' }, '已删除这条流水', () => {
        setExpenses((current) => current.filter((item) => item.id !== id));
      });
    },
    setBudgets: (next) => {
      void settle('/api/budgets', { method: 'PUT', body: JSON.stringify(next) }, '预算已更新', () => {
        setBudgetsState(next);
      });
    },
    setNotice: (key, value) => {
      void settle('/api/notices', { method: 'PUT', body: JSON.stringify({ [key]: value }) }, '', () => {
        setNotices((current) => ({ ...current, [key]: value }));
      });
    },
    setModel: (input) => {
      void settle('/api/model', { method: 'PUT', body: JSON.stringify(input) }, '模型连接已保存');
    },
    setHome: (input) => {
      void settle('/api/home', { method: 'PUT', body: JSON.stringify(input) }, '家居地址已保存');
    },
    syncHome: async () => {
      try {
        const body = await api<{ snapshot: RemoteSnapshot; error?: string }>('/api/home/sync', { method: 'POST' });
        applyRemote(body.snapshot);
        markOnline(true);
        toast(body.snapshot.home.connected ? '已从 Home Assistant 同步设备' : '未连接，仍显示演示数据');
        return body.snapshot.home.connected;
      } catch (error) {
        if (!isRejected(error)) markOnline(false);
        toast('未连接，仍显示演示数据');
        return false;
      }
    },
    parseTrip: async (text) => {
      try {
        const body = await api<{ draft: ItineraryDraft }>('/api/trips/parse', { method: 'POST', body: JSON.stringify({ text }) });
        markOnline(true);
        return body.draft;
      } catch (error) {
        if (!isRejected(error)) {
          markOnline(false);
          toast('本地服务没开，行程还解析不了');
          return null;
        }
        toast('这份短信或邮件没有读出行程');
        return null;
      }
    },
    importTrip: async (draft) => {
      const result = await settle('/api/trips/import', { method: 'POST', body: JSON.stringify({ draft }) }, `已写入「${draft.title}」`);
      return result === 'saved';
    },
    runChain: async (tripId) => {
      try {
        const body = await api<{ snapshot: RemoteSnapshot; chain: TripChain }>(`/api/trips/${tripId}/chain`, { method: 'POST' });
        applyRemote(body.snapshot);
        markOnline(true);
        toast(body.chain.scene.via === 'home-assistant' ? '已按行程串起，离家场景已交给 Home Assistant' : '已按行程串起，离家只记在本机');
        return body.chain;
      } catch (error) {
        if (!isRejected(error)) markOnline(false);
        toast(isRejected(error) ? '这趟行程没有串起来' : '本地服务没开，这趟行程还串不起来');
        return null;
      }
    },
    adoptTripMeal: (tripId, name) => {
      void settle(`/api/trips/${tripId}/meal`, { method: 'POST', body: JSON.stringify({ name }) }, `已记下「${name}」`, () => {
        if (!meals.some((meal) => meal.name === name)) {
          setMeals((current) => [...current, { id: uid('m'), slot: '午餐', name, time: '12:30', date: DIET_TODAY, kcal: 420, protein: 42, carb: 18, fat: 16 }]);
        }
      });
    },
    addPackingLine: (tripId, text) => {
      void settle(`/api/trips/${tripId}/packing`, { method: 'POST', body: JSON.stringify({ text }) }, '', () => {
        setTrips((current) => current.map((trip) => (
          trip.id === tripId && !trip.packing.some((item) => item.text === text)
            ? { ...trip, packing: [...trip.packing, { id: uid('p'), text, done: false }] }
            : trip
        )));
      });
    },
    savePackingTemplate: (tripId, name) => {
      void settle('/api/packing-templates', { method: 'POST', body: JSON.stringify({ tripId, name }) }, `已保存行李模板「${name}」`, () => {
        const trip = trips.find((item) => item.id === tripId);
        if (!trip) return;
        setPackingTemplates((current) => [...current, { id: uid('pack'), name, items: trip.packing.map((item) => item.text) }]);
      });
    },
    applyPackingTemplate: (tripId, templateId) => {
      void settle(`/api/trips/${tripId}/packing-template`, { method: 'POST', body: JSON.stringify({ templateId }) }, '', () => {
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
    addTripExpense: (tripId, input) => {
      void settle(`/api/trips/${tripId}/expenses`, { method: 'POST', body: JSON.stringify(input) }, '已记到这趟行程', () => {
        setExpenses((current) => [{ id: uid('e'), tag: '行', amount: input.amount, date: todayIso(), merchant: input.merchant, note: input.kind, tripId }, ...current]);
      });
    },
    adoptActions: (actions, key) => {
      const message = key === 'cross' ? '已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账' : '已采纳';
      void settle('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key, actions }) }, message, () => {
        if (key !== 'cross') return;
        setItems((current) => current.map((item) => (['w1', 'w2', 'w3'].includes(item.id) ? { ...item, wears: item.wears + 1 } : item)));
        setSuggestionIndex(1);
        setWeatherOn(true);
        setOutfitAdopted(true);
        markTip('cross');
      });
    },
    adoptProteinTip: () => {
      const todayMeals = meals.filter((meal) => (meal.date || DIET_TODAY) === DIET_TODAY);
      const picked = pickRecipe(recipes, todayMeals, targets);
      if (!picked) return;
      void settle('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'protein' }) }, `已按建议补上${picked.name}`, () => {
        if (!meals.some((meal) => meal.name === picked.name)) {
          setMeals((current) => [
            ...current,
            { id: uid('m'), slot: picked.slot, name: picked.name, time: '18:30', date: DIET_TODAY, kcal: picked.kcal, protein: picked.protein, carb: picked.carb, fat: picked.fat },
          ]);
        }
        markTip('protein');
      });
    },
    dismissHomeAlerts: () => {
      void (async () => {
        const ids = alerts.filter((alert) => !alert.handled && alert.id.startsWith('ha-')).map((alert) => alert.id);
        let saved = false;
        for (const id of ids) {
          const result = await send(`/api/alerts/${encodeURIComponent(id)}/handle`, { method: 'POST' }, true);
          if (result === 'rejected') {
            toast('没有保存，请检查填写内容');
            return;
          }
          if (result === 'offline') {
            setAlerts((current) => current.map((alert) => (ids.includes(alert.id) ? { ...alert, handled: true } : alert)));
            toast('未保存，连接恢复后会自动同步');
            return;
          }
          saved = true;
        }
        if (saved) markTip('filter');
      })();
    },
    adoptFilterTip: () => {
      void settle('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'filter' }) }, '已把滤芯更换记进待办', () => {
        setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
        markTip('filter');
      });
    },
    executeCrossPlan: () => {
      if (adoptedTips.includes('cross')) return;
      void settle('/api/agent/adopt', { method: 'POST', body: JSON.stringify({ key: 'cross' }) }, '已按衣食住行支记下：风衣、清淡午餐、离家、北京行李和差旅账', () => {
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
            : [{ id: 'e-cross', tag: '行', amount: 2400, date: todayIso(), merchant: '差旅专账', note: '技术交流会' }, ...current]
        ));
        setAlerts((current) => current.map((alert) => (alert.id === 'a-filter' ? { ...alert, handled: true } : alert)));
        markTip('filter');
        markTip('cross');
      });
    },
    markTip: (id) => {
      void settle('/api/session/tips', { method: 'POST', body: JSON.stringify({ id }) }, '', () => {
        markTip(id);
      });
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
