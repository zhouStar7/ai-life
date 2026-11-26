import { useNavigate } from 'react-router-dom';
import { useLocalDate } from '../localDate';
import { pickRecipe } from '../dietPlan';
import { monthExpenses, share, sumAmount, todayLabel, yuan } from '../format';
import { defaultSpendingMonth } from '../../../shared/spending';
import { tripStatus } from '../../../shared/trips';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { SPEND_TAGS } from '../types';
import { Icon } from '../components/Icon';
import { Progress } from '../components/ui';

export function OverviewPage({ onArrange }: { onArrange: () => void }) {
  const store = useStore();
  const { session } = useAuth();
  const navigate = useNavigate();
  const today = useLocalDate();
  const period = defaultSpendingMonth(today, store.demoMode);
  const expenses = monthExpenses(store.expenses, undefined, period);
  const total = sumAmount(expenses);
  const left = store.budgets.total - total;
  const todayMeals = store.meals.filter((meal) => meal.date === today);
  const protein = todayMeals.reduce((sum, meal) => sum + meal.protein, 0);
  const kcal = todayMeals.reduce((sum, meal) => sum + meal.kcal, 0);
  const proteinGap = Math.max(0, store.targets.protein - protein);
  const kcalGap = Math.max(0, store.targets.kcal - kcal);
  const mealPick = pickRecipe(store.recipes, todayMeals, store.targets);
  const online = store.devices.filter((device) => !device.offline).length;
  const abnormal = new Set([
    ...store.devices.filter((device) => device.offline).map((device) => `ha-offline-${device.id}`),
    ...store.alerts.filter((alert) => !alert.handled && alert.level === '高').map((alert) => alert.id),
  ]).size;
  const upcoming = store.trips
    .filter((trip) => {
      const status = tripStatus(trip, today);
      return status === '进行中' || status === '即将开始';
    })
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0];
  const filterAlert = store.alerts.find((alert) => alert.id === 'a-filter');
  const liveAlerts = store.home.connected ? store.alerts.filter((alert) => !alert.handled && alert.id.startsWith('ha-')) : [];

  const tips = [
    {
      id: 'outfit',
      icon: 'wardrobe' as const,
      title: store.weatherOn ? `今天 ${store.weatherLabel}，有一套通勤穿搭` : '天气暂时拿不到，先按通勤场合穿',
      detail: store.suggestion.title,
      done: store.adoptedTips.includes('outfit') || store.outfitAdopted,
      action: async () => { if (await store.adoptOutfitSuggestion()) navigate('/wardrobe'); },
    },
    {
      id: 'protein',
      icon: 'diet' as const,
      title: mealPick ? `还可以补一顿${mealPick.slot}` : '今日热量和蛋白质已达标',
      detail: mealPick ? `热量还剩 ${kcalGap} kcal，蛋白质还差 ${proteinGap} g，可以加一份${mealPick.name}。` : '三餐结构已经够用。',
      done: !mealPick,
      action: async () => { if (mealPick && await store.applyRecipe(mealPick.id)) navigate('/diet'); },
    },
    ...(store.home.connected
      ? (liveAlerts.length > 0 ? [{
        id: 'filter',
        icon: 'home' as const,
        title: liveAlerts.length > 1 ? `${liveAlerts.length} 项家居异常` : liveAlerts[0].title,
        detail: liveAlerts.map((alert) => alert.title).join('、'),
        done: false,
        action: async () => { if (await store.dismissHomeAlerts()) navigate('/home'); },
      }] : [])
      : [{
        id: 'filter',
        icon: 'home' as const,
        title: filterAlert?.title ?? '净水器滤芯该换了',
        detail: filterAlert?.detail ?? '处理前可以先比价。',
        done: store.adoptedTips.includes('filter') || filterAlert?.handled === true,
        action: async () => { if (await store.adoptFilterTip()) navigate('/home'); },
      }]),
    {
      id: 'prep',
      icon: 'travel' as const,
      title: upcoming ? `${upcoming.title}出发前记得离家` : '最近没有待出发的行程',
      detail: '查看准备包，离家动作单独确认。',
      done: store.adoptedTips.includes('prep') || !upcoming || upcoming.prepAdopted,
      action: async () => { if (upcoming && await store.selectTrip(upcoming.id)) navigate('/travel'); },
    },
  ];

  const budgetUrl = `/spending?month=${period}`;

  return (
    <div className="overview-page">
      <header className="page-head overview-greeting">
        <div>
          <h1 className="display">今日概览</h1>
          {session?.member && <p className="muted greeting-sub">你好，{session.member.name}。</p>}
        </div>
        <time className="overview-date" dateTime={today}>{todayLabel()}</time>
      </header>
      <section className="daily-hero" aria-labelledby="daily-heading">
        <div className="hero-copy">
          <h2 id="daily-heading">AI 生活安排</h2>
          <p>从今天穿什么，到下一趟出发。</p>
          <button type="button" aria-haspopup="dialog" onClick={onArrange}><Icon name="spark" /> 帮我安排今天 <span aria-hidden="true">→</span></button>
        </div>
        <button type="button" className="today-note" onClick={() => navigate('/wardrobe')} aria-label="查看今日穿搭">
          <span className="today-note-head"><span>今日穿搭</span><Icon name="wardrobe" /></span>
          <strong>{store.weatherOn ? store.weatherLabel : '按今天的场合穿'}</strong>
          <span className="today-note-outfit">{store.suggestion.title.split(' · ').map((item, index) => <span key={`${index}-${item}`}>{item}</span>)}</span>
          <span className="today-note-footer">{store.outfitAdopted ? '已采纳这套穿搭' : '去衣橱看看'}<span aria-hidden="true">→</span></span>
        </button>
      </section>
      <section className="grid-4 overview-modules" aria-label="生活概览">
        <button type="button" className="card stat link-card life-wardrobe" onClick={() => navigate('/wardrobe')}>
          <span className="module-top"><span className="module-icon"><Icon name="wardrobe" /></span><span>衣橱</span><span className="module-arrow" aria-hidden="true">→</span></span>
          <strong>{store.items.length}<small>件单品</small></strong>
          <span>{store.outfitAdopted ? '今日穿搭已采纳' : '有一套待采纳的穿搭'}</span>
        </button>
        <button type="button" className="card stat link-card life-diet" onClick={() => navigate('/diet')}>
          <span className="module-top"><span className="module-icon"><Icon name="diet" /></span><span>饮食</span><span className="module-arrow" aria-hidden="true">→</span></span>
          <strong>{kcal}<small>kcal</small></strong>
          <span>{store.targets.kcal > 0 ? `目标 ${store.targets.kcal}` : '还没设目标'}</span>
        </button>
        <button type="button" className="card stat link-card life-home" onClick={() => navigate('/home')}>
          <span className="module-top"><span className="module-icon"><Icon name="home" /></span><span>家居</span><span className="module-arrow" aria-hidden="true">→</span></span>
          <strong>{online}<small>台在线</small></strong>
          <span className={abnormal > 0 ? 'module-warning' : undefined}>{abnormal > 0 ? `${abnormal} 项异常` : '状态正常'}</span>
        </button>
        <button type="button" className="card stat link-card life-travel" onClick={() => navigate('/travel')}>
          <span className="module-top"><span className="module-icon"><Icon name="travel" /></span><span>出行</span><span className="module-arrow" aria-hidden="true">→</span></span>
          <strong>{upcoming?.title ?? '无行程'}</strong>
          <span>{upcoming?.dateLabel ?? '可以新建一趟'}</span>
        </button>
      </section>

      <div className="grid-2 overview-detail">
        <article className="card daily-tips">
          <header className="overview-section-head"><h2>AI 建议</h2></header>
          {tips.map((tip) => (
            <div className="alert" key={tip.id}>
              <span className={`tip-icon tip-${tip.id}`}><Icon name={tip.icon} /></span>
              <div>
                <strong>{tip.title}</strong>
                <p className="muted">{tip.detail}</p>
              </div>
              <button type="button" className="btn small" disabled={tip.done} onClick={tip.action}>{tip.done ? '已采纳' : '采纳'}</button>
            </div>
          ))}
        </article>
        <article className="card overview-budget">
          <header className="overview-section-head"><h2>生活账本</h2><time dateTime={period}>{period.replace('-', ' 年 ')} 月</time></header>
          <p className="budget-label muted">本月累计支出</p>
          <p className="stat"><strong>{yuan(total)}</strong></p>
          <p className="muted">{store.budgets.total > 0 ? `预算还剩 ${yuan(Math.max(0, left))} / ${yuan(store.budgets.total)}` : '还没设月预算'}</p>
          {store.budgets.total > 0 && <Progress value={total} max={store.budgets.total} />}
          <div className="legend">
            {SPEND_TAGS.map((tag) => {
              const amount = sumAmount(expenses.filter((entry) => entry.tag === tag));
              return (
                <button type="button" className="hit" key={tag} onClick={() => navigate(`${budgetUrl}&tag=${encodeURIComponent(tag)}`)}>
                  <strong><span className={`tag tag-${tag}`}>{tag}</span> {yuan(amount)}</strong>
                  <small>占 {share(amount, total)}% <span aria-hidden="true">→</span></small>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-text" onClick={() => navigate(budgetUrl)}>查看完整账本 <span aria-hidden="true">→</span></button>
        </article>
      </div>
    </div>
  );
}
