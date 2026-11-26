import { SCENES, type SceneName } from '../types';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useLocalDate } from '../localDate';
import { pickRecipe } from '../dietPlan';
import { modelDestination } from '../../../shared/modelEndpoint';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { arrange, errorDetail } from '../api/client';
import { Modal, SaveStatus } from './ui';

const DietPage = lazy(() => import('../pages/Diet').then(module => ({ default: module.DietPage })));
const HomePage = lazy(() => import('../pages/Home').then(module => ({ default: module.HomePage })));
const OverviewPage = lazy(() => import('../pages/Overview').then(module => ({ default: module.OverviewPage })));
const SettingsPage = lazy(() => import('../pages/Settings').then(module => ({ default: module.SettingsPage })));
const SpendingPage = lazy(() => import('../pages/Spending').then(module => ({ default: module.SpendingPage })));
const TravelPage = lazy(() => import('../pages/Travel').then(module => ({ default: module.TravelPage })));
const WardrobePage = lazy(() => import('../pages/Wardrobe').then(module => ({ default: module.WardrobePage })));

const LIFE_NAV = [
  { to: '/wardrobe', label: '衣橱', icon: 'wardrobe', description: '穿搭与衣物' },
  { to: '/diet', label: '饮食', icon: 'diet', description: '三餐与营养' },
  { to: '/home', label: '家居', icon: 'home', description: '设备与场景' },
  { to: '/travel', label: '出行', icon: 'travel', description: '行程与行李' },
] as const;

const NAV = [
  { to: '/', label: '今日概览', icon: 'overview' },
  ...LIFE_NAV,
  { to: '/spending', label: '支出统计', icon: 'spending' },
  { to: '/settings', label: '设置', icon: 'settings' },
] as const;

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const { session, offlineAccount, logout } = useAuth();
  const [navAt, setNavAt] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [omni, setOmni] = useState('');
  const [omniAt, setOmniAt] = useState<string | null>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const navOpen = navAt === location.key;
  const omniOpen = omniAt === location.key;
  const activePage = NAV.find((item) => item.to === location.pathname) ?? NAV[0];
  const page = activePage.to === '/settings' || activePage.to === '/' ? 'overview' : activePage.to.slice(1);
  const lifeActive = LIFE_NAV.some((item) => item.to === location.pathname);
  const account = session?.member;
  const accountName = account?.name ?? (offlineAccount ? '离线账号' : '演示账号');
  const avatar = Array.from(accountName)[0];

  useEffect(() => {
    document.title = `${activePage.label} · AI Life`;
    document.documentElement.dataset.theme = 'chinese-ink';
    document.documentElement.dataset.page = page;
    viewportRef.current?.scrollTo({ top: 0 });
  }, [activePage, location.pathname, page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!document.documentElement.dataset.modal && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('omniInput')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo(() => {
    const q = omni.trim().toLowerCase();
    if (!q) return [];
    const all = [
      ...store.items.map((item) => ({ href: '/wardrobe', kind: '衣橱', title: item.name, meta: `${item.category} · ${item.color}` })),
      ...store.recipes.map((item) => ({ href: '/diet', kind: '食谱', title: item.name, meta: item.tags.join(' / ') })),
      ...store.devices.map((item) => ({ href: '/home', kind: '设备', title: item.name, meta: item.room })),
      ...store.trips.map((item) => ({ href: '/travel', kind: '行程', title: item.title, meta: item.dateLabel })),
    ];
    return all.filter((item) => `${item.title} ${item.meta} ${item.kind}`.toLowerCase().includes(q)).slice(0, 6);
  }, [omni, store.devices, store.items, store.recipes, store.trips]);

  function openArrange() {
    setAiOpen(true);
  }

  function openHit(href: string) {
    setOmniAt(null);
    setOmni('');
    navigate(href);
  }

  return (
    <div className="app">
      <aside className="side">
        <div>
          <div className="brand">
            <span className="seal-mark" aria-hidden="true">生</span>
            <div className="brand-name">AI 生活管家</div>
          </div>
          <nav className="nav-block" aria-label="主导航">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <span className="left"><Icon name={item.icon} />{item.label}</span>
                <span className="nav-indicator" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="user">
          <NavLink to="/settings" className="user-id">
            <span className="avatar" aria-hidden="true">{avatar}</span>
            <span><strong>{accountName}</strong>{account && <small>{account.username}</small>}</span>
          </NavLink>
          {(account || offlineAccount) && <button type="button" className="btn-text" onClick={() => void logout()}>退出登录</button>}
        </div>
      </aside>
      <div className="workspace">
        <header className="top">
          <div className="mobile-brand">
            <span className="mobile-wordmark"><span className="seal-mark" aria-hidden="true">生</span><strong>AI 生活管家</strong></span>
            <NavLink to="/settings" className="mobile-profile" aria-label={`${accountName} · 我的设置`}>{avatar}</NavLink>
          </div>
          <form
            className="omni"
            role="search"
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOmniAt(null); }}
            onKeyDown={(event) => { if (event.key === 'Escape') setOmniAt(null); }}
            onSubmit={(event) => { event.preventDefault(); if (hits[0]) openHit(hits[0].href); }}
          >
            <span className="spark"><Icon name="search" /></span>
            <input
              id="omniInput"
              aria-label="搜索衣橱、食谱、设备或行程"
              enterKeyHint="search"
              placeholder="搜索衣橱、食谱、设备或行程…"
              value={omni}
              onChange={(event) => { setOmni(event.target.value); setOmniAt(location.key); }}
              onFocus={() => setOmniAt(location.key)}
            />
            <kbd>⌘K</kbd>
            {omniOpen && hits.length > 0 ? (
              <div className="hits-pop">
                {hits.map((hit) => (
                  <button type="button" className="hit" key={`${hit.kind}-${hit.title}`} onClick={() => openHit(hit.href)}>
                    <strong>{hit.title}</strong>
                    <small>{hit.kind} · {hit.meta}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
          <div className="top-tools">
            <button type="button" className="quick" data-testid="open-ai" aria-haspopup="dialog" onClick={openArrange}><Icon name="spark" /><span>今天想安排什么？</span></button>
          </div>
        </header>
        <main className="viewport" ref={viewportRef}>
          <SaveStatus />
          <Suspense fallback={<p role="status" className="page-loading">正在打开页面…</p>}>
            <Routes>
              <Route path="/" element={<OverviewPage onArrange={openArrange} />} />
              <Route path="/wardrobe" element={<WardrobePage />} />
              <Route path="/diet" element={<DietPage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/travel" element={<TravelPage />} />
              <Route path="/spending" element={<SpendingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<OverviewPage onArrange={openArrange} />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((item) => <div className="toast" key={item.id}>{item.message}</div>)}
      </div>
      <nav className="tabbar" aria-label="主导航">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="overview" /><span>今日</span></NavLink>
        <button type="button" className={lifeActive || navOpen ? 'tab active' : 'tab'} aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavAt(location.key)}><Icon name="menu" /><span>生活</span></button>
        <button type="button" className="tab tab-ai" aria-haspopup="dialog" onClick={openArrange}><span className="ai-orb"><Icon name="spark" /></span><span>AI 安排</span></button>
        <NavLink to="/spending" className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="spending" /><span>账本</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="settings" /><span>我的</span></NavLink>
      </nav>
      {navOpen && (
        <Modal title="我的生活" onClose={() => setNavAt(null)}>
          <nav className="life-grid" aria-label="生活模块">
            {LIFE_NAV.map(({ to, icon, label, description }) => (
              <NavLink key={to} to={to} className={`life-entry life-${icon}`} onClick={() => setNavAt(null)}>
                <span className="module-icon"><Icon name={icon} /></span>
                <strong>{label}</strong>
                <small>{description}</small>
              </NavLink>
            ))}
          </nav>
        </Modal>
      )}
      {aiOpen && <AiModal onClose={() => setAiOpen(false)} onOpen={(href) => { setAiOpen(false); navigate(href); }} />}
    </div>
  );
}

function AiModal({ onClose, onOpen }: { onClose: () => void; onOpen: (href: string) => void }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [planError, setPlanError] = useState('');
  const [plan, setPlan] = useState<{ title: string; lines: string[]; href: string; label: string; actions?: unknown[]; key?: string } | null>(null);
  const today = useLocalDate();
  const todayMeals = store.meals.filter((meal) => meal.date === today);
  const proteinGap = Math.max(0, store.targets.protein - todayMeals.reduce((sum, meal) => sum + meal.protein, 0));
  const kcalGap = Math.max(0, store.targets.kcal - todayMeals.reduce((sum, meal) => sum + meal.kcal, 0));
  const mealPick = pickRecipe(store.recipes, todayMeals, store.targets);

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setText(raw);
    setPlan(null);
    setPlanError('');
    try {
      const result = await arrange(value, controller.signal);
      if (controller.signal.aborted) return;
      setPlan({
        title: result.title,
        lines: result.lines,
        href: result.href,
        actions: result.actions,
        key: result.key,
        label: result.adopted ? '已采纳' : result.actions.length > 0 ? '采纳' : '打开',
      });
      return;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (store.demoMode) localPlan(value);
      else setPlanError(`无法生成安排：${errorDetail(error)}。可以修改内容或重试。`);
    } finally {
      request.current = null;
      setBusy(false);
    }
  }

  function localPlan(value: string) {
    const liveAlerts = store.alerts.filter((alert) => !alert.handled && alert.id.startsWith('ha-'));
    const filterTitle = store.home.connected
      ? (liveAlerts.length > 0 ? liveAlerts.map((alert) => alert.title).slice(0, 3).join('、') : '家里没有待处理的提醒')
      : (store.alerts.find((alert) => alert.id === 'a-filter')?.title ?? '净水器滤芯该换了');
    if (/穿|衣|搭配/.test(value) && !/下雨|降温|交流会|出差/.test(value)) {
      setPlan({ title: '穿搭可以这么定', lines: [store.suggestion.title, store.suggestion.reason], href: '/wardrobe', label: '去衣橱采纳' });
      return;
    }
    if (/吃|餐|食|热量|蛋白/.test(value)) {
      setPlan({ title: '饮食补上这一口', lines: [mealPick ? `热量还剩 ${kcalGap} kcal，蛋白质还差 ${proteinGap} g，可以加一份${mealPick.name}。` : '今天热量和蛋白质已经够了。', '外卖偏多的时候，优先从食谱里选自炊。'], href: '/diet', label: '去饮食' });
      return;
    }
    if (/家|灯|空调|滤芯|场景/.test(value)) {
      setPlan({ title: '家里先处理这些', lines: [filterTitle, '出门前可以切到「离家」。'], href: '/home', label: '去家居' });
      return;
    }
    if (/下雨|降温|交流会|出差|北京|哈尔滨|燕京/.test(value)) {
      setPlan({
        title: '衣食住行支已经串在一起',
        lines: [
          '衣：米色风衣、白衬衫、牛仔裤，适合下雨降温。',
          '食：午餐换成鸡胸温蔬藜麦，把蛋白质补上。',
          '住：出发前切换离家，灯和空调关掉。',
          '行：北京差旅的行李加上防风风衣和保暖内胆。',
          '支：记一笔差旅 ¥2,400，归到「行」。',
        ],
        href: '/',
        label: store.adoptedTips.includes('cross') ? '已采纳' : '一键采纳',
      });
      return;
    }
    if (/出行|行程|行李|飞机/.test(value)) {
      setPlan({ title: '出行准备包', lines: ['穿搭沿用今日通勤建议。', '出发前一晚切换离家。', '北京差旅还有行李没勾完。'], href: '/travel', label: '去出行' });
      return;
    }
    if (/花|钱|预算|支出|账/.test(value)) {
      setPlan({ title: '先看这个月的账', lines: ['支出按衣食住行分开。', '餐饮和出行是目前的大头。'], href: '/spending', label: '去支出统计' });
      return;
    }
    setPlan({
      title: '今天可以这样安排',
      lines: [`穿搭：${store.suggestion.title}`, mealPick ? `饮食：热量还剩 ${kcalGap} kcal，蛋白质还差 ${proteinGap} g，可以加一份${mealPick.name}。` : '饮食：热量和蛋白质已达标', `家居：${store.home.connected ? filterTitle : '滤芯该换了'}`, '出行：北京差旅行李还没勾完'],
      href: '/',
      label: '回到概览',
    });
  }

  return (
    <Modal title="今天想安排什么？" onClose={onClose}>
      <p className="muted">生成安排或选择示例时，会处理输入文字及衣食住行支摘要。处理位置：{modelDestination(store.model.baseUrl)}。</p>
      <form onSubmit={(event) => { event.preventDefault(); submit(text); }}>
        <textarea rows={3} autoFocus aria-label="安排内容" placeholder="比如：出差前帮我准备一下" value={text} onChange={(event) => setText(event.target.value)} />
        <div className="pills" style={{ marginTop: 10 }}>
          {['今天上海降温下雨，我要去参加一个技术交流会', '今天穿什么', '补一餐蛋白质', '看看这个月花了多少'].map((item) => (
            <button type="button" className="pill" key={item} disabled={busy} onClick={() => submit(item)}>{item}</button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? '正在安排…' : '生成安排'}</button>
          {busy && <button type="button" className="btn-ghost" onClick={() => request.current?.abort()}>取消安排</button>}
        </div>
      </form>
      {planError && <p className="note" role="alert">{planError}</p>}
      {plan ? (
        <div className="plan">
          <strong>{plan.title}</strong>
          <ul>{plan.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            disabled={store.saving || plan.label === '已采纳'}
            onClick={async () => {
              if (plan.actions && plan.actions.length > 0 && plan.label === '采纳') {
                if (!await store.adoptActions(plan.actions, plan.key)) return;
              } else if (plan.label === '一键采纳' && !await store.executeCrossPlan()) return;
              const scene = plan.actions?.find((action): action is { type: 'apply_scene'; name: SceneName } => !!action && typeof action === 'object' && 'type' in action && action.type === 'apply_scene' && 'name' in action && SCENES.includes(action.name as SceneName));
              onOpen(plan.href);
              if (scene || plan.label === '一键采纳') await store.applyScene(scene?.name ?? '离家');
            }}
          >{plan.label}</button>
        </div>
      ) : null}
    </Modal>
  );
}
