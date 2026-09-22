import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { MEAL_SLOTS, type Meal, type MealSlot, type NutritionTarget } from '../types';
import { Empty, Field, Modal, PageHead, Progress, SpendCard } from '../components/ui';
import { WEEK_HISTORY } from '../seed';

const EMPTY: Omit<Meal, 'id'> = { slot: '午餐', name: '', time: '12:30', kcal: 0, protein: 0, carb: 0, fat: 0 };

export function DietPage() {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Meal | 'new' | null>(null);
  const [targetOpen, setTargetOpen] = useState(store.targets.kcal <= 0);
  const totals = useMemo(() => store.meals.reduce(
    (sum, meal) => ({
      kcal: sum.kcal + meal.kcal,
      protein: sum.protein + meal.protein,
      carb: sum.carb + meal.carb,
      fat: sum.fat + meal.fat,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  ), [store.meals]);
  const recipes = store.recipes.filter((recipe) => {
    const q = query.trim();
    if (!q) return true;
    return `${recipe.name} ${recipe.tags.join(' ')}`.includes(q);
  });
  const week = [...WEEK_HISTORY, { label: '22', kcal: totals.kcal }];
  const peak = Math.max(2000, ...week.map((day) => day.kcal));

  return (
    <>
      <PageHead
        title="饮食"
        desc="今天吃了什么，离目标还差多少。"
        extra={<button type="button" className="btn" data-testid="add-meal" onClick={() => setEditor('new')}>添加餐次</button>}
      />
      <div className="layout-2">
        <section className="stack">
          <article className="card">
            <h2>今日记录</h2>
            {store.meals.length === 0 ? (
              <Empty title="今天还没记餐" desc="从一顿早餐开始，或者直接把食谱加进来。" action={<button type="button" className="btn" onClick={() => setEditor('new')}>快捷添加</button>} />
            ) : MEAL_SLOTS.map((slot) => {
              const rows = store.meals.filter((meal) => meal.slot === slot);
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
                      <button type="button" className="btn-text small" onClick={() => setEditor(meal)}>编辑</button>
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
                <div className="week-col" key={day.label}>
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
                <Macro label="热量" value={totals.kcal} max={store.targets.kcal} unit="kcal" />
                <Macro label="蛋白质" value={totals.protein} max={store.targets.protein} unit="g" />
                <Macro label="碳水" value={totals.carb} max={store.targets.carb} unit="g" />
                <Macro label="脂肪" value={totals.fat} max={store.targets.fat} unit="g" />
                <p className="muted" style={{ marginTop: 10 }}>还剩 {Math.max(0, store.targets.kcal - totals.kcal)} kcal</p>
                <button type="button" className="btn-text" onClick={() => setTargetOpen(true)}>调整目标</button>
              </>
            )}
          </article>
          <article className="card">
            <h2>食谱库</h2>
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
      {editor ? <MealModal initial={editor} onClose={() => setEditor(null)} /> : null}
      {targetOpen ? <TargetModal onClose={() => setTargetOpen(false)} /> : null}
    </>
  );
}

function Macro({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  return (
    <div className="macro">
      <div className="macro-label"><span>{label}</span><span>{value}/{max} {unit}</span></div>
      <Progress value={value} max={max} />
    </div>
  );
}

function MealModal({ initial, onClose }: { initial: Meal | 'new'; onClose: () => void }) {
  const store = useStore();
  const editing = initial === 'new' ? null : initial;
  const [draft, setDraft] = useState<Omit<Meal, 'id'>>(editing ?? EMPTY);

  function save() {
    if (!draft.name.trim()) return;
    const meal = { ...draft, name: draft.name.trim(), kcal: Number(draft.kcal) || 0, protein: Number(draft.protein) || 0, carb: Number(draft.carb) || 0, fat: Number(draft.fat) || 0 };
    if (editing) store.updateMeal({ ...meal, id: editing.id });
    else store.addMeal(meal);
    onClose();
  }

  return (
    <Modal title={editing ? '编辑餐次' : '添加餐次'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="form-grid">
          <Field label="餐次">
            <select value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: event.target.value as MealSlot })}>
              {MEAL_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </Field>
          <Field label="时间"><input required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></Field>
          <Field label="吃了什么" wide><input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="热量"><input type="number" min={0} value={draft.kcal} onChange={(event) => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field>
          <Field label="蛋白质"><input type="number" min={0} value={draft.protein} onChange={(event) => setDraft({ ...draft, protein: Number(event.target.value) })} /></Field>
          <Field label="碳水"><input type="number" min={0} value={draft.carb} onChange={(event) => setDraft({ ...draft, carb: Number(event.target.value) })} /></Field>
          <Field label="脂肪"><input type="number" min={0} value={draft.fat} onChange={(event) => setDraft({ ...draft, fat: Number(event.target.value) })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">保存</button>
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
