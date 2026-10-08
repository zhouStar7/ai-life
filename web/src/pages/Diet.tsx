import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { DIET_TODAY, pickRecipe, weekFromMeals, type MealDraft } from '../dietPlan';
import { MEAL_SLOTS, type Meal, type MealSlot, type NutritionTarget, type Recipe } from '../types';
import { Empty, Field, Modal, Progress, SpendCard } from '../components/ui';

const EMPTY: Omit<Meal, 'id'> = { slot: '午餐', name: '', time: '12:30', date: DIET_TODAY, kcal: 0, protein: 0, carb: 0, fat: 0 };

export function DietPage() {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [phrase, setPhrase] = useState('');
  const [hint, setHint] = useState('');
  const [editor, setEditor] = useState<Meal | Omit<Meal, 'id'> | 'new' | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(store.targets.kcal <= 0);
  const todayMeals = store.meals.filter((meal) => (meal.date || DIET_TODAY) === DIET_TODAY);
  const totals = useMemo(() => todayMeals.reduce(
    (sum, meal) => ({
      kcal: sum.kcal + meal.kcal,
      protein: sum.protein + meal.protein,
      carb: sum.carb + meal.carb,
      fat: sum.fat + meal.fat,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  ), [todayMeals]);
  const recipes = store.recipes.filter((recipe) => {
    const q = query.trim();
    if (!q) return true;
    return `${recipe.name} ${recipe.tags.join(' ')}`.includes(q);
  });
  const suggestion = pickRecipe(store.recipes, todayMeals, store.targets);
  const week = weekFromMeals(store.meals);
  const peak = Math.max(2000, ...week.map((day) => day.kcal));
  const kcalLeft = Math.max(0, store.targets.kcal - totals.kcal);
  const proteinLeft = Math.max(0, store.targets.protein - totals.protein);

  async function estimate() {
    const draft = await store.estimateMeal(phrase);
    if (!draft) return;
    setHint(draft.note);
    setEditor(draftToMeal(draft));
  }

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 32 }}>饮食</h1>
        <button type="button" className="btn" data-testid="add-meal" onClick={() => { setHint(''); setEditor('new'); }}>添加餐次</button>
      </header>
      <div className="layout-2">
        <section className="stack">
          <article className="card">
            <h2>一句话记餐</h2>
            <form className="form-grid" style={{ marginTop: 8 }} onSubmit={(event) => { event.preventDefault(); void estimate(); }}>
              <Field label="吃了什么" wide>
                <input data-testid="meal-phrase" placeholder="例如：中午一碗牛肉面" value={phrase} onChange={(event) => setPhrase(event.target.value)} />
              </Field>
              <button type="submit" className="btn" data-testid="estimate-meal">估算并确认</button>
            </form>
          </article>
          <article className="card">
            <h2>今日记录</h2>
            {todayMeals.length === 0 ? (
              <Empty title="今天还没记餐" desc="说一句吃了什么，估算后确认入账。" action={<button type="button" className="btn" onClick={() => { setHint(''); setEditor('new'); }}>快捷添加</button>} />
            ) : MEAL_SLOTS.map((slot) => {
              const rows = todayMeals.filter((meal) => meal.slot === slot);
              if (rows.length === 0) return null;
              return (
                <div key={slot}>
                  {rows.map((meal) => (
                    <div className="meal" key={meal.id}>
                      <time>{meal.time}</time>
                      <div>
                        <strong>{meal.slot} · {meal.name}</strong>
                        <p className="muted">{meal.kcal} kcal · 蛋白 {meal.protein} · 碳水 {meal.carb} · 脂肪 {meal.fat}</p>
                      </div>
                      <button type="button" className="btn-text small" onClick={() => { setHint(''); setEditor(meal); }}>编辑</button>
                      <button type="button" className="btn-text small" onClick={() => store.removeMeal(meal.id)}>删除</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </article>
          <article className="card">
            <h2>近 7 日摄入</h2>
            <div className="week">
              {week.map((day) => (
                <div className="week-col" key={day.date}>
                  <b style={{ height: `${Math.max(6, (day.kcal / peak) * 100)}%`, background: store.targets.kcal > 0 && day.kcal > store.targets.kcal ? '#d97706' : undefined }} />
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
        <aside className="stack">
          <article className="card">
            <h2>今日目标</h2>
            {store.targets.kcal <= 0 ? (
              <Empty title="还没设营养目标" desc="先定一个每日热量，进度才有对照。" action={<button type="button" className="btn" onClick={() => setTargetOpen(true)}>设置目标</button>} />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0 12px' }}>
                  <div className="ring-wrap" aria-hidden="true">
                    <svg viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#eee2cf" strokeWidth="10" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#d97706" strokeWidth="10" strokeLinecap="round" strokeDasharray={264} strokeDashoffset={264 * (1 - Math.min(1, totals.kcal / store.targets.kcal))} />
                    </svg>
                    <div className="ring-label"><strong>{totals.kcal}</strong><span className="muted">/ {store.targets.kcal}</span></div>
                  </div>
                  <p className="muted">今日热量进度</p>
                </div>
                <Macro label="热量" value={totals.kcal} max={store.targets.kcal} unit="kcal" />
                <Macro label="蛋白质" value={totals.protein} max={store.targets.protein} unit="g" />
                <Macro label="碳水" value={totals.carb} max={store.targets.carb} unit="g" />
                <Macro label="脂肪" value={totals.fat} max={store.targets.fat} unit="g" />
                <p className="muted" style={{ marginTop: 10 }}>还剩 {kcalLeft} kcal，蛋白质还差 {proteinLeft} g</p>
                <button type="button" className="btn-text" onClick={() => setTargetOpen(true)}>调整目标</button>
              </>
            )}
          </article>
          <article className="card">
            <h2>按缺口推荐</h2>
            {suggestion ? (
              <>
                <strong>{suggestion.name}</strong>
                <p className="muted">热量还剩 {kcalLeft} kcal，蛋白质还差 {proteinLeft} g。这份大约 {suggestion.kcal} kcal、蛋白 {suggestion.protein} g。</p>
                <div className="chips">{suggestion.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div>
                <button type="button" className="btn" data-testid="apply-suggestion" onClick={() => store.applyRecipe(suggestion.id)}>加入{suggestion.slot}</button>
              </>
            ) : (
              <p className="muted">{store.targets.kcal <= 0 && store.targets.protein <= 0 ? '先设好热量和蛋白质目标。' : '今日热量和蛋白质已经够用。'}</p>
            )}
          </article>
          <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>食谱库</h2>
              <button type="button" className="btn-text" data-testid="add-recipe" onClick={() => setRecipeOpen(true)}>添加食谱</button>
            </div>
            <input className="select" style={{ width: '100%', margin: '8px 0' }} placeholder="搜索食谱或标签" value={query} onChange={(event) => setQuery(event.target.value)} />
            {recipes.length === 0 ? <p className="muted">没有匹配的食谱。</p> : recipes.map((recipe) => (
              <div className="recipe" key={recipe.id}>
                <div>
                  <strong>{recipe.name}</strong>
                  <div className="chips">{recipe.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}<span className="chip">{recipe.kcal} kcal</span></div>
                </div>
                <button type="button" className="btn small" onClick={() => store.applyRecipe(recipe.id)}>加入</button>
              </div>
            ))}
          </article>
          <SpendCard tag="食" label="本月饮食支出" />
        </aside>
      </div>
      {editor ? <MealModal initial={editor} hint={hint} onClose={() => setEditor(null)} /> : null}
      {recipeOpen ? <RecipeModal onClose={() => setRecipeOpen(false)} /> : null}
      {targetOpen ? <TargetModal onClose={() => setTargetOpen(false)} /> : null}
    </>
  );
}

function draftToMeal(draft: MealDraft): Omit<Meal, 'id'> {
  return {
    slot: draft.slot,
    name: draft.name,
    time: draft.time,
    date: draft.date,
    kcal: draft.kcal,
    protein: draft.protein,
    carb: draft.carb,
    fat: draft.fat,
  };
}

function Macro({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  return (
    <div className="macro">
      <div className="macro-label"><span>{label}</span><span>{value}/{max} {unit}</span></div>
      <Progress value={value} max={max} />
    </div>
  );
}

function MealModal({ initial, hint, onClose }: { initial: Meal | Omit<Meal, 'id'> | 'new'; hint: string; onClose: () => void }) {
  const store = useStore();
  const editing = typeof initial === 'object' && 'id' in initial ? initial : null;
  const [draft, setDraft] = useState<Omit<Meal, 'id'>>(editing ?? (initial === 'new' ? EMPTY : initial));

  function save() {
    if (!draft.name.trim()) return;
    const meal = {
      ...draft,
      name: draft.name.trim(),
      date: draft.date || DIET_TODAY,
      kcal: Number(draft.kcal) || 0,
      protein: Number(draft.protein) || 0,
      carb: Number(draft.carb) || 0,
      fat: Number(draft.fat) || 0,
    };
    if (editing) store.updateMeal({ ...meal, id: editing.id });
    else store.addMeal(meal);
    onClose();
  }

  return (
    <Modal title={editing ? '编辑餐次' : '确认餐次'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        {hint ? <p className="muted">{hint}</p> : null}
        <div className="form-grid">
          <Field label="餐次">
            <select value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: event.target.value as MealSlot })}>
              {MEAL_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </Field>
          <Field label="时间"><input required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></Field>
          <Field label="日期" wide><input required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
          <Field label="吃了什么" wide><input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="热量"><input type="number" min={0} value={draft.kcal} onChange={(event) => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field>
          <Field label="蛋白质"><input type="number" min={0} value={draft.protein} onChange={(event) => setDraft({ ...draft, protein: Number(event.target.value) })} /></Field>
          <Field label="碳水"><input type="number" min={0} value={draft.carb} onChange={(event) => setDraft({ ...draft, carb: Number(event.target.value) })} /></Field>
          <Field label="脂肪"><input type="number" min={0} value={draft.fat} onChange={(event) => setDraft({ ...draft, fat: Number(event.target.value) })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">确认入账</button>
        </div>
      </form>
    </Modal>
  );
}

function RecipeModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Omit<Recipe, 'id'>>({ name: '', tags: [], slot: '晚餐', kcal: 400, protein: 25, carb: 40, fat: 12 });
  const [tagText, setTagText] = useState('');

  function save() {
    if (!draft.name.trim()) return;
    store.addRecipe({
      ...draft,
      name: draft.name.trim(),
      tags: tagText.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean),
      kcal: Number(draft.kcal) || 0,
      protein: Number(draft.protein) || 0,
      carb: Number(draft.carb) || 0,
      fat: Number(draft.fat) || 0,
    });
    onClose();
  }

  return (
    <Modal title="添加食谱" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="form-grid">
          <Field label="名称" wide><input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="餐次">
            <select value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: event.target.value as MealSlot })}>
              {MEAL_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </Field>
          <Field label="标签" wide><input placeholder="减脂 快手" value={tagText} onChange={(event) => setTagText(event.target.value)} /></Field>
          <Field label="热量"><input type="number" min={0} value={draft.kcal} onChange={(event) => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field>
          <Field label="蛋白质"><input type="number" min={0} value={draft.protein} onChange={(event) => setDraft({ ...draft, protein: Number(event.target.value) })} /></Field>
          <Field label="碳水"><input type="number" min={0} value={draft.carb} onChange={(event) => setDraft({ ...draft, carb: Number(event.target.value) })} /></Field>
          <Field label="脂肪"><input type="number" min={0} value={draft.fat} onChange={(event) => setDraft({ ...draft, fat: Number(event.target.value) })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">保存食谱</button>
        </div>
      </form>
    </Modal>
  );
}

function TargetModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<NutritionTarget>(store.targets.kcal > 0 ? store.targets : { kcal: 1800, protein: 120, carb: 200, fat: 60 });
  function set<K extends keyof NutritionTarget>(key: K, value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  return (
    <Modal title="营养目标" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); store.setTargets(draft); onClose(); }}>
        <div className="form-grid">
          <Field label="热量 kcal"><input type="number" min={0} value={draft.kcal} onChange={(event) => set('kcal', Number(event.target.value))} /></Field>
          <Field label="蛋白质 g"><input type="number" min={0} value={draft.protein} onChange={(event) => set('protein', Number(event.target.value))} /></Field>
          <Field label="碳水 g"><input type="number" min={0} value={draft.carb} onChange={(event) => set('carb', Number(event.target.value))} /></Field>
          <Field label="脂肪 g"><input type="number" min={0} value={draft.fat} onChange={(event) => set('fat', Number(event.target.value))} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-text" onClick={() => { store.setTargets({ kcal: 0, protein: 0, carb: 0, fat: 0 }); onClose(); }}>清除目标</button>
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">保存</button>
        </div>
      </form>
    </Modal>
  );
}
