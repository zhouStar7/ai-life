import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DIET_TODAY, pickRecipe } from '../dietPlan';
import { useStore } from '../store';
const DietPage = lazy(() => import('../pages/Diet').then(module => ({ default: module.DietPage })));
const HomePage = lazy(() => import('../pages/Home').then(module => ({ default: module.HomePage })));
const OverviewPage = lazy(() => import('../pages/Overview').then(module => ({ default: module.OverviewPage })));
const SettingsPage = lazy(() => import('../pages/Settings').then(module => ({ default: module.SettingsPage })));
const SpendingPage = lazy(() => import('../pages/Spending').then(module => ({ default: module.SpendingPage })));
const TravelPage = lazy(() => import('../pages/Travel').then(module => ({ default: module.TravelPage })));
const WardrobePage = lazy(() => import('../pages/Wardrobe').then(module => ({ default: module.WardrobePage })));
import { Icon } from './Icon';
import { ApiError, arrange } from '../api/client';
import { Modal } from './ui';

const NAV = [
  { to: '/', label: '今日概览', short: '概览', icon: 'overview' as const, page: 'overview' },
  { to: '/wardrobe', label: '衣橱', short: '衣橱', icon: 'wardrobe' as const, page: 'wardrobe' },
  { to: '/diet', label: '饮食', short: '饮食', icon: 'diet' as const, page: 'diet' },
  { to: '/home', label: '家居', short: '家居', icon: 'home' as const, page: 'home' },
  { to: '/travel', label: '出行', short: '出行', icon: 'travel' as const, page: 'travel' },
  { to: '/spending', label: '支出统计', short: '支出', icon: 'spending' as const, page: 'spending' },
  { to: '/settings', label: '设置', short: '设置', icon: 'settings' as const, page: 'settings' },
];

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const [navAt, setNavAt] = useState<string | null>(null);
  const navOpen = navAt === location.key;
  const setNavOpen = (open: boolean) => setNavAt(open ? location.key : null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');
  const [omni, setOmni] = useState('');
  const [omniAt, setOmniAt] = useState<string | null>(null);
  const omniOpen = omniAt === location.key;
  const setOmniOpen = (open: boolean) => setOmniAt(open ? location.key : null);
  const [narrow, setNarrow] = useState(false);
  const viewportRef = useRef<HTMLElement>(null);
  const lifeActive = ['/wardrobe', '/diet', '/home', '/travel'].includes(location.pathname);
  const title = NAV.find((item) => item.to === location.pathname)?.label ?? '今日概览';
  const page = location.pathname === '/' ? 'overview' : location.pathname.slice(1);

  useEffect(() => {
    document.title = `${title} · AI Life`;
    document.documentElement.dataset.theme = 'chinese-ink';
    document.documentElement.dataset.page = page === 'settings' ? 'overview' : page;
    viewportRef.current?.scrollTo({ top: 0 });
  }, [page, title]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
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
    setAiSeed('');
    setAiOpen(true);
  }

  function goFirstHit() {
    const hit = hits[0];
    if (!hit) return;
    setOmniOpen(false);
    setOmni('');
    setNavOpen(false);
    navigate(hit.href);
  }

  return (
    <div className={navOpen ? 'app nav-open' : 'app'}>
      <aside className="side">
        <div>
          <div className="brand">
            <span className="seal-mark">生</span>
            <div><div className="brand-name">AI 生活管家</div><p className="brand-caption">每天，从容一点</p></div>
          </div>
          <nav className="nav-block" aria-label="主导航">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setNavOpen(false)}>
                <span className="left"><Icon name={item.icon} />{item.label}</span><span className="nav-indicator" aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="user">
          <div className="user-id">
            <span className="avatar">{store.member?.name.slice(0, 1) || '家'}</span>
            <strong>{store.member?.name}</strong>
          </div>
          <button type="button" className="btn-text" onClick={() => { void store.logout(); }}>登出</button>
        </div>
      </aside>
      <div className="workspace">
        <header className="top">
          <div className="mobile-brand">
            <span className="mobile-wordmark"><span className="seal-mark">生</span><strong>AI 生活管家</strong></span>
            <NavLink to="/settings" className="mobile-profile" aria-label="我的设置">{store.member?.name.slice(0, 1) || '家'}</NavLink>
          </div>
          <form className="omni" onSubmit={(event) => { event.preventDefault(); goFirstHit(); }}>
            <span className="spark"><Icon name="search" /></span>
            <input
              id="omniInput"
              aria-label="搜索衣橱、食谱、设备或行程"
              enterKeyHint="search"
              placeholder={narrow ? '搜索衣橱、食谱、行程…' : '搜索衣橱、食谱、设备或行程…'}
              value={omni}
              onChange={(event) => { setOmni(event.target.value); setOmniOpen(true); }}
              onFocus={() => setOmniOpen(true)}
            />
            <kbd>⌘K</kbd>
            {omniOpen && hits.length > 0 ? (
              <div className="hits-pop">
                {hits.map((hit) => (
                  <button type="button" className="hit" key={`${hit.kind}-${hit.title}`} onClick={() => { setOmniOpen(false); setOmni(''); setNavOpen(false); navigate(hit.href); }}>
                    <strong>{hit.title}</strong>
                    <small>{hit.kind} · {hit.meta}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
          {store.saveState === 'unsaved' ? <span className="save-state unsaved" data-testid="save-state">有修改尚未保存</span> : null}
          {store.saveState === 'offline' ? <span className="save-state" data-testid="save-state">未连接，显示上次保存的数据</span> : null}
          <div className="top-tools">
            <button type="button" className="quick" data-testid="open-ai" aria-label="今天想安排什么？" onClick={openArrange}><Icon name="spark" /><span>今天想安排什么？</span></button>
          </div>
        </header>
        <main className="viewport" ref={viewportRef}>
          <Suspense fallback={<p role="status" className="page-loading">正在打开页面…</p>}><Routes>
            <Route path="/" element={<OverviewPage onArrange={openArrange} />} />
            <Route path="/wardrobe" element={<WardrobePage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/travel" element={<TravelPage />} />
            <Route path="/spending" element={<SpendingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<OverviewPage onArrange={openArrange} />} />
          </Routes></Suspense>
        </main>
      </div>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((item) => <div className="toast" key={item.id}>{item.message}</div>)}
      </div>
      <nav className="tabbar" aria-label="主导航">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="overview" /><span>今日</span></NavLink>
        <button type="button" className={lifeActive || navOpen ? 'tab active' : 'tab'} aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Icon name="menu" /><span>生活</span></button>
        <button type="button" className="tab tab-ai" aria-label="AI 安排" aria-haspopup="dialog" onClick={openArrange}><span className="ai-orb"><Icon name="spark" /></span><span>AI 安排</span></button>
        <NavLink to="/spending" className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="spending" /><span>账本</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'tab active' : 'tab'}><Icon name="settings" /><span>我的</span></NavLink>
      </nav>
      {navOpen ? <Modal title="我的生活" onClose={() => setNavOpen(false)}>
        <p className="muted">衣食住行，随手打理。</p>
        <nav className="life-grid" aria-label="生活模块">
        {NAV.filter((item) => ['wardrobe', 'diet', 'home', 'travel'].includes(item.page)).map((item) => (
          <NavLink key={item.to} to={item.to} className={`life-entry life-${item.page}`} onClick={() => setNavOpen(false)}>
            <span className="module-icon"><Icon name={item.icon} /></span>
            <strong>{item.label}</strong>
            <small>{{ wardrobe: '穿搭与衣物', diet: '三餐与营养', home: '设备与场景', travel: '行程与行李' }[item.page]}</small>
          </NavLink>
        ))}
        </nav>
      </Modal> : null}
      {aiOpen ? <AiModal seed={aiSeed} onClose={() => setAiOpen(false)} onOpen={(href) => { setAiOpen(false); setNavOpen(false); navigate(href); }} /> : null}
    </div>
  );
}

function AiModal({ seed, onClose, onOpen }: { seed: string; onClose: () => void; onOpen: (href: string) => void }) {
  const store = useStore();
  const [text, setText] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [plan, setPlan] = useState<{ title: string; lines: string[]; href: string; label: string; actions?: unknown[]; key?: string } | null>(null);
  const todayMeals = store.meals.filter((meal) => (meal.date || DIET_TODAY) === DIET_TODAY);
  const proteinGap = Math.max(0, store.targets.protein - todayMeals.reduce((sum, meal) => sum + meal.protein, 0));
  const kcalGap = Math.max(0, store.targets.kcal - todayMeals.reduce((sum, meal) => sum + meal.kcal, 0));
  const mealPick = pickRecipe(store.recipes, todayMeals, store.targets);

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setNotice(''); setPlan(null);
    setText(value);
    try {
      const result = await arrange(value, controller.signal);
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
      if (controller.signal.aborted || (error instanceof ApiError && error.status === -1)) return;
      setNotice('AI 暂时不可用，先按当前记录给你一些建议。');
      localPlan(value);
    } finally { request.current = null; setBusy(false); }
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

  useEffect(() => {
    if (seed) submit(seed);
    // 弹层打开时按顶栏已经写下的话生成一次安排。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="今天想安排什么？" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); submit(text); }}>
        <textarea rows={3} autoFocus placeholder="比如：出差前帮我准备一下" value={text} onChange={(event) => setText(event.target.value)} />
        <div className="pills" style={{ marginTop: 10 }}>
          {['今天上海降温下雨，我要去参加一个技术交流会', '今天穿什么', '补一餐蛋白质', '看看这个月花了多少'].map((item) => (
            <button type="button" className="pill" key={item} disabled={busy} onClick={() => submit(item)}>{item}</button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? '正在安排…' : '生成安排'}</button>
          {busy ? <button type="button" className="btn-ghost" onClick={() => request.current?.abort()}>取消</button> : null}
        </div>
      </form>
      {notice ? <p className="note" role="status">{notice}</p> : null}
      {plan ? (
        <div className="plan">
          <strong>{plan.title}</strong>
          <ul>{plan.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            disabled={plan.label === '已采纳'}
            onClick={() => {
              if (plan.actions && plan.actions.length > 0 && plan.label === '采纳') store.adoptActions(plan.actions, plan.key);
              else if (plan.label === '一键采纳') store.executeCrossPlan();
              onOpen(plan.href);
            }}
          >{plan.label}</button>
        </div>
      ) : null}
    </Modal>
  );
}
