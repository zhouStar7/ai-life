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

const NAV = [
  { to: '/', label: '今日概览', icon: 'overview' as const },
  { to: '/wardrobe', label: '衣橱', icon: 'wardrobe' as const },
  { to: '/diet', label: '饮食', icon: 'diet' as const },
  { to: '/home', label: '家居', icon: 'home' as const },
  { to: '/travel', label: '出行', icon: 'travel' as const },
  { to: '/spending', label: '支出统计', icon: 'spending' as const },
  { to: '/settings', label: '设置', icon: 'settings' as const },
];

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const title = NAV.find((item) => item.to === location.pathname)?.label ?? '今日概览';

  useEffect(() => {
    document.title = `${title} · AI Life`;
  }, [title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      {navOpen ? <button type="button" className="scrim" aria-label="关闭菜单" onClick={() => setNavOpen(false)} /> : null}
      <aside className={navOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <span className="logo">AI</span>
          <div>
            <strong>AI Life</strong>
            <small>生活管家</small>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setNavOpen(false)}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="avatar">星</span>
          <div>
            <strong>星宇</strong>
            <small>{todayLabel()}</small>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="nav-toggle" aria-label="打开菜单" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <button type="button" className="search-launch" data-testid="open-search" onClick={() => setSearchOpen(true)}>
            <Icon name="search" />
            <span>搜索衣橱、食谱、设备或行程…</span>
            <kbd>⌘K</kbd>
          </button>
          <button type="button" className="ai-launch" data-testid="open-ai" onClick={() => setAiOpen(true)}>
            <Icon name="spark" />
            <span>今天想安排什么？</span>
          </button>
        </header>
        <main className="content">
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
        </main>
      </div>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((item) => (
          <div className="toast" key={item.id}>{item.message}</div>
        ))}
      </div>
      {searchOpen ? <SearchModal onClose={() => setSearchOpen(false)} onOpen={(href) => { setSearchOpen(false); setNavOpen(false); navigate(href); }} /> : null}
      {aiOpen ? <AiModal onClose={() => setAiOpen(false)} onOpen={(href) => { setAiOpen(false); setNavOpen(false); navigate(href); }} /> : null}
    </div>
  );
}

function SearchModal({ onClose, onOpen }: { onClose: () => void; onOpen: (href: string) => void }) {
  const { items, recipes, devices, trips } = useStore();
  const [query, setQuery] = useState('');
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      ...items.map((item) => ({ href: '/wardrobe', kind: '衣橱', title: item.name, meta: `${item.category} · ${item.color} · ${item.occasion}` })),
      ...recipes.map((item) => ({ href: '/diet', kind: '食谱', title: item.name, meta: item.tags.join(' / ') })),
      ...devices.map((item) => ({ href: '/home', kind: '设备', title: item.name, meta: `${item.room} · ${item.offline ? '离线' : item.on ? '开启' : '关闭'}` })),
      ...trips.map((item) => ({ href: '/travel', kind: '行程', title: item.title, meta: `${item.transport} · ${item.dateLabel}` })),
    ];
    if (!q) return all.slice(0, 6);
    return all.filter((item) => `${item.title} ${item.meta} ${item.kind}`.toLowerCase().includes(q)).slice(0, 8);
  }, [devices, items, query, recipes, trips]);

  return (
    <Modal title="搜索" onClose={onClose}>
      <input className="select search-input" style={{ width: '100%' }} autoFocus placeholder="衣橱、食谱、设备或行程" value={query} onChange={(event) => setQuery(event.target.value)} />
      {hits.length === 0 ? <p className="empty">没有匹配的衣橱、食谱、设备或行程。</p> : hits.map((hit) => (
        <button type="button" className="hit" key={`${hit.kind}-${hit.title}`} onClick={() => onOpen(hit.href)}>
          <strong>{hit.title}</strong>
          <small>{hit.kind} · {hit.meta}</small>
        </button>
      ))}
    </Modal>
  );
}

function AiModal({ onClose, onOpen }: { onClose: () => void; onOpen: (href: string) => void }) {
  const store = useStore();
  const [text, setText] = useState('');
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

  return (
    <Modal title="今天想安排什么？" onClose={onClose}>
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
