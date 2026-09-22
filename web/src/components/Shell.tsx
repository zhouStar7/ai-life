import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { todayLabel } from '../format';
import { useStore } from '../store';
import { DietPage } from '../pages/Diet';
import { HomePage } from '../pages/Home';
import { OverviewPage } from '../pages/Overview';
import { SettingsPage } from '../pages/Settings';
import { SpendingPage } from '../pages/Spending';
import { TravelPage } from '../pages/Travel';
import { WardrobePage } from '../pages/Wardrobe';
import { Icon } from './Icon';
import { Modal } from './ui';

const THEMES = [
  { id: 'chinese-ink', label: '宣纸水墨 · 宋式风骨' },
  { id: 'chinese-zen', label: '玄墨松青 · 现代禅意' },
  { id: 'mono-minimal', label: '纯粹纯白 · 无彩极简' },
  { id: 'slate-teal', label: '深色极客 · 质感微光' },
  { id: 'warm-nordic', label: '北欧原木 · 暖白温润' },
];

const NAV = [
  { to: '/', label: '今日总览 · 中枢', icon: 'overview' as const, page: 'overview' },
  { to: '/wardrobe', label: '衣 · 衣橱穿搭', icon: 'wardrobe' as const, page: 'wardrobe' },
  { to: '/diet', label: '食 · 饮食调摄', icon: 'diet' as const, page: 'diet' },
  { to: '/home', label: '住 · 空间居所', icon: 'home' as const, page: 'home' },
  { to: '/travel', label: '行 · 行程调度', icon: 'travel' as const, page: 'travel' },
  { to: '/spending', label: '支 · 节度用度', icon: 'spending' as const, page: 'spending' },
];

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');
  const [omni, setOmni] = useState('');
  const [omniOpen, setOmniOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ai_life_theme') || 'chinese-ink');
  const title = NAV.find((item) => item.to === location.pathname)?.label ?? '设置';
  const page = location.pathname === '/' ? 'overview' : location.pathname.slice(1);
  const kcal = store.meals.reduce((sum, meal) => sum + meal.kcal, 0);

  useEffect(() => {
    document.title = `${title} · AI Life`;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.page = page === 'settings' ? 'overview' : page;
    localStorage.setItem('ai_life_theme', theme);
  }, [page, theme, title]);

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

  const counts: Record<string, string> = {
    wardrobe: `${store.items.length} 件`,
    diet: `${kcal} 千卡`,
    home: store.devices.some((device) => device.offline) ? '有异常' : '安适',
    travel: store.trips.find((trip) => trip.status === '即将开始')?.title ?? '无行程',
    spending: '本月',
  };

  function sendOmni() {
    const value = omni.trim();
    if (!value) return;
    setAiSeed(value);
    setAiOpen(true);
    setOmni('');
    setOmniOpen(false);
  }

  return (
    <div className="app">
      {navOpen ? <button type="button" className="scrim" aria-label="关闭菜单" onClick={() => setNavOpen(false)} /> : null}
      <aside className={navOpen ? 'side open' : 'side'}>
        <div>
          <div className="brand">
            <span className="seal-mark">生</span>
            <div>
              <div className="brand-name">AI·生活管家 <span className="seal">貳.零</span></div>
              <p>格物致知 · 智享生活</p>
            </div>
          </div>
          <nav className="nav-block">
            <div className="nav-label">· 日用居止 ·</div>
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setNavOpen(false)}>
                <span className="left"><Icon name={item.icon} />{item.label}</span>
                {item.page === 'overview' ? <i className="dot" /> : <span className="nav-count">{counts[item.page]}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="side-meta">
            <div><span>时序节令</span><strong>{todayLabel()}</strong></div>
            <div><span>地理天候</span><strong>沪上 · 14° 细雨</strong></div>
            <div><span>物联中枢</span><strong>{store.devices.filter((device) => !device.offline).length} 台在线</strong></div>
          </div>
        </div>
        <div className="user">
          <div className="user-id">
            <span className="avatar">星</span>
            <div>
              <strong>星宇的阁子</strong>
              <small>数据自守 · 本地无越</small>
            </div>
          </div>
          <NavLink to="/settings" className="priv">设置</NavLink>
        </div>
      </aside>
      <div className="workspace">
        <header className="top">
          <button type="button" className="nav-toggle" aria-label="打开菜单" onClick={() => setNavOpen(true)}><Icon name="menu" /></button>
          <form className="omni" onSubmit={(event) => { event.preventDefault(); sendOmni(); }}>
            <span className="spark"><Icon name="spark" /></span>
            <input
              id="omniInput"
              data-testid="open-ai"
              placeholder="向管家发付，例：周五飞往燕京出差三日，请备行囊"
              value={omni}
              onChange={(event) => { setOmni(event.target.value); setOmniOpen(true); }}
              onFocus={() => setOmniOpen(true)}
            />
            <kbd>回车发付</kbd>
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
          <div className="top-tools">
            <label className="theme-switch">
              <span>意境风格</span>
              <select aria-label="意境风格" value={theme} onChange={(event) => setTheme(event.target.value)}>
                {THEMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <button type="button" className="quick" onClick={() => navigate('/wardrobe')}><Icon name="wardrobe" /><span>随手录衣</span></button>
            <button type="button" className="quick" data-testid="open-search" onClick={() => navigate('/spending')}><Icon name="spending" /><span>入账理度</span></button>
          </div>
        </header>
        <div className="viewport">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/wardrobe" element={<WardrobePage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/travel" element={<TravelPage />} />
            <Route path="/spending" element={<SpendingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<OverviewPage />} />
          </Routes>
        </div>
      </div>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((item) => <div className="toast" key={item.id}>{item.message}</div>)}
      </div>
      {aiOpen ? <AiModal seed={aiSeed} onClose={() => setAiOpen(false)} onOpen={(href) => { setAiOpen(false); setNavOpen(false); navigate(href); }} /> : null}
    </div>
  );
}

function AiModal({ seed, onClose, onOpen }: { seed: string; onClose: () => void; onOpen: (href: string) => void }) {
  const store = useStore();
  const [text, setText] = useState(seed);
  const [plan, setPlan] = useState<{ title: string; lines: string[]; href: string; label: string } | null>(null);
  const protein = store.meals.reduce((sum, meal) => sum + meal.protein, 0);
  const gap = Math.max(0, store.targets.protein - protein);

  function submit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setText(value);
    if (/穿|衣|搭配/.test(value)) {
      setPlan({ title: '穿搭可以这么定', lines: [store.suggestion.title, store.suggestion.reason], href: '/wardrobe', label: '去衣橱采纳' });
      return;
    }
    if (/吃|餐|食|热量|蛋白/.test(value)) {
      setPlan({ title: '饮食补上这一口', lines: [gap > 0 ? `蛋白质还差 ${gap} g，建议加一份鸡胸肉沙拉。` : '今天蛋白质已经够了。', '外卖偏多的时候，优先从食谱里选自炊。'], href: '/diet', label: '去饮食' });
      return;
    }
    if (/家|灯|空调|滤芯|场景/.test(value)) {
      setPlan({ title: '家里先处理这些', lines: ['净水器滤芯剩余 8%。', '出门前可以切到「离家」。'], href: '/home', label: '去家居' });
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
      lines: [`穿搭：${store.suggestion.title}`, gap > 0 ? `饮食：蛋白质还差 ${gap} g` : '饮食：蛋白质已达标', '家居：滤芯该换了', '出行：北京差旅行李还没勾完'],
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
    <Modal title="AI 管家领命 · 跨域协同已拟定" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); submit(text); }}>
        <textarea rows={3} autoFocus placeholder="比如：出差前帮我准备一下" value={text} onChange={(event) => setText(event.target.value)} />
        <div className="pills" style={{ marginTop: 10 }}>
          {['今天上海降温下雨，我要去参加一个技术交流会', '今天穿什么', '补一餐蛋白质', '看看这个月花了多少'].map((item) => (
            <button type="button" className="pill" key={item} onClick={() => submit(item)}>{item}</button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn">生成安排</button>
        </div>
      </form>
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
              if (plan.label === '一键采纳') store.executeCrossPlan();
              onOpen(plan.href);
            }}
          >{plan.label}</button>
        </div>
      ) : null}
    </Modal>
  );
}
