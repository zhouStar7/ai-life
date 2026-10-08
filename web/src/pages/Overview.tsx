import { useNavigate } from 'react-router-dom';
import { DIET_TODAY, pickRecipe } from '../dietPlan';
import { monthExpenses, share, sumAmount, yuan } from '../format';
import { useStore } from '../store';
import { SPEND_TAGS } from '../types';
export function OverviewPage() {
  const store = useStore();
  const navigate = useNavigate();
  const month = monthExpenses(store.expenses);
  const total = sumAmount(month);
  const left = store.budgets.total - total;
  const todayMeals = store.meals.filter((meal) => (meal.date || DIET_TODAY) === DIET_TODAY);
  const protein = todayMeals.reduce((sum, meal) => sum + meal.protein, 0);
  const kcal = todayMeals.reduce((sum, meal) => sum + meal.kcal, 0);
  const proteinGap = Math.max(0, store.targets.protein - protein);
  const kcalGap = Math.max(0, store.targets.kcal - kcal);
  const mealPick = pickRecipe(store.recipes, todayMeals, store.targets);
  const online = store.devices.filter((device) => !device.offline).length;
  const abnormal = store.alerts.filter((alert) => !alert.handled && alert.level === '高').length + store.devices.filter((device) => device.offline).length;
  const upcoming = store.trips.find((trip) => trip.status === '即将开始') ?? store.trips[0];
  const filterAlert = store.alerts.find((alert) => alert.id === 'a-filter');
  const liveAlerts = store.home.connected ? store.alerts.filter((alert) => !alert.handled && alert.id.startsWith('ha-')) : [];

  const tips = [
    {
      id: 'outfit',
      title: store.weatherOn ? `今天 ${store.weatherLabel}，有一套通勤穿搭` : '天气暂时拿不到，先按通勤场合穿',
      detail: store.suggestion.title,
      done: store.adoptedTips.includes('outfit') || store.outfitAdopted,
      action: () => { store.adoptOutfitSuggestion(); navigate('/wardrobe'); },
    },
    {
      id: 'protein',
      title: mealPick ? `还可以补一顿${mealPick.slot}` : '今日热量和蛋白质已达标',
      detail: mealPick ? `热量还剩 ${kcalGap} kcal，蛋白质还差 ${proteinGap} g，可以加一份${mealPick.name}。` : '三餐结构已经够用。',
      done: !mealPick,
      action: () => { if (mealPick) store.applyRecipe(mealPick.id); navigate('/diet'); },
    },
    ...(store.home.connected
      ? (liveAlerts.length > 0 ? [{
        id: 'filter',
        title: liveAlerts.length > 1 ? `${liveAlerts.length} 项家居异常` : liveAlerts[0].title,
        detail: liveAlerts.map((alert) => alert.title).join('、'),
        done: false,
        action: () => { store.dismissHomeAlerts(); navigate('/home'); },
      }] : [])
      : [{
        id: 'filter',
        title: filterAlert?.title ?? '净水器滤芯该换了',
        detail: filterAlert?.detail ?? '处理前可以先比价。',
        done: store.adoptedTips.includes('filter') || filterAlert?.handled === true,
        action: () => { store.adoptFilterTip(); navigate('/home'); },
      }]),
    {
      id: 'prep',
      title: upcoming ? `${upcoming.title}出发前记得离家` : '最近没有待出发的行程',
      detail: '准备包会带上穿搭、关家电和行李清单。',
      done: store.adoptedTips.includes('prep') || !upcoming || upcoming.prepAdopted,
      action: () => { if (upcoming) store.adoptPrep(upcoming.id); navigate('/travel'); },
    },
  ];

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 32 }}>今日概览</h1>
      </header>
      <section className="grid-4">
        <button type="button" className="card stat link-card" onClick={() => navigate('/wardrobe')}>
          <span>衣橱</span>
          <strong>{store.items.length} 件</strong>
          <span>{store.outfitAdopted ? '今日穿搭已采纳' : '有一套待采纳的穿搭'}</span>
        </button>
        <button type="button" className="card stat link-card" onClick={() => navigate('/diet')}>
          <span>饮食</span>
          <strong>{kcal} kcal</strong>
          <span>{store.targets.kcal > 0 ? `目标 ${store.targets.kcal}` : '还没设目标'}</span>
        </button>
        <button type="button" className="card stat link-card" onClick={() => navigate('/home')}>
          <span>家居</span>
          <strong>{online} 台在线</strong>
          <span>{abnormal > 0 ? `${abnormal} 项异常` : '状态正常'}</span>
        </button>
        <button type="button" className="card stat link-card" onClick={() => navigate('/travel')}>
          <span>出行</span>
          <strong>{upcoming?.title ?? '无行程'}</strong>
          <span>{upcoming?.dateLabel ?? '可以新建一趟'}</span>
        </button>
      </section>

      <section className="grid-2">
        <article className="card">
          <h2>AI 建议</h2>
          <p className="muted">采纳之后会写进对应模块。</p>
          {tips.map((tip) => (
            <div className="alert" key={tip.id}>
              <div>
                <strong>{tip.title}</strong>
                <p className="muted">{tip.detail}</p>
              </div>
              <button type="button" className="btn small" disabled={tip.done} onClick={tip.action}>{tip.done ? '已采纳' : '采纳'}</button>
            </div>
          ))}
        </article>
        <article className="card">
          <h2>本月支出</h2>
          <p className="stat"><strong>{yuan(total)}</strong></p>
          <p className="muted">{store.budgets.total > 0 ? `预算还剩 ${yuan(Math.max(0, left))} / ${yuan(store.budgets.total)}` : '还没设月预算'}</p>
          <div className="legend">
            {SPEND_TAGS.map((tag) => {
              const amount = sumAmount(monthExpenses(store.expenses, tag));
              return (
                <button type="button" className="hit" key={tag} onClick={() => navigate(`/spending?tag=${encodeURIComponent(tag)}`)}>
                  <strong><span className={`tag tag-${tag}`}>{tag}</span> {yuan(amount)}</strong>
                  <small>占 {share(amount, total)}% · 打开支出统计并筛选</small>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-text" onClick={() => navigate('/spending')}>打开支出统计</button>
        </article>
      </section>

    </>
  );
}
