import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { monthExpenses, percentChange, PREV_MONTH_SPEND, share, sumAmount, yuan } from '../format';
import { PAST_TREND, TAG_COLOR } from '../seed';
import { useStore } from '../store';
import { SPEND_TAGS, type BillDraft, type SpendTag } from '../types';
import { Empty, Field, Modal, Progress } from '../components/ui';

export function SpendingPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tagParam = params.get('tag');
  const tag = SPEND_TAGS.includes(tagParam as SpendTag) ? (tagParam as SpendTag) : '全部';
  const [adding, setAdding] = useState(false);
  const [billRows, setBillRows] = useState<BillDraft[] | null>(null);
  const [readingBill, setReadingBill] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const month = monthExpenses(store.expenses);
  const total = sumAmount(month);
  const filtered = tag === '全部' ? month : monthExpenses(store.expenses, tag);
  const rows = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  const change = percentChange(total, PREV_MONTH_SPEND);
  const remain = store.budgets.total - total;
  const parts = SPEND_TAGS.map((item) => ({ tag: item, amount: sumAmount(monthExpenses(store.expenses, item)) }));
  const gradient = donut(parts.map((part) => ({ color: TAG_COLOR[part.tag], value: part.amount })));
  const trend = [...PAST_TREND, { label: '9月', amount: total }];
  const peak = Math.max(...trend.map((item) => item.amount), 1);

  async function onBillFile(file: File | undefined, kind: 'csv' | 'image') {
    if (!file) return;
    setReadingBill(true);
    const payload = kind === 'csv'
      ? { csv: await readBill(file, 'text') }
      : { image: await readBill(file, 'data') };
    const rows = await store.previewBills(payload);
    setReadingBill(false);
    if (csvRef.current) csvRef.current.value = '';
    if (shotRef.current) shotRef.current.value = '';
    if (rows) setBillRows(rows);
  }

  function selectTag(next: '全部' | SpendTag) {
    if (next === '全部') setParams({});
    else setParams({ tag: next });
  }

  const showFilter = !store.home.connected && store.alerts.some((alert) => alert.id === 'a-filter' && !alert.handled);
  const tips = [
    { id: 'save-food', text: '餐饮里外卖偏多，本周可以换成两顿自炊。', href: '/diet', action: '去饮食' },
    { id: 'save-trip', text: '北京差旅的酒店已经确认，出发前把行李勾完。', href: '/travel', action: '去出行' },
    ...(showFilter ? [{ id: 'save-filter', text: '净水器滤芯剩余 8%，更换前可以先比价。', href: '/home', action: '去家居' }] : []),
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="display" style={{ fontSize: 32 }}>支出统计</h1>
          <p className="muted">2026 年 9 月</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn-ghost" data-testid="import-bills" disabled={readingBill} onClick={() => { setBillRows([]); }}>
            {readingBill ? '读取中…' : '导入账单'}
          </button>
          <button type="button" className="btn" data-testid="add-expense" onClick={() => setAdding(true)}>记一笔</button>
        </div>
      </header>
      <section className="grid-4">
        <article className="card kpi"><span>本月总支出</span><strong>{yuan(total)}</strong></article>
        <article className="card kpi">
          <span>环比上月</span>
          <strong className={change > 0 ? 'up' : 'down'}>{change > 0 ? '↑' : '↓'} {Math.abs(change)}%</strong>
        </article>
        <article className="card kpi">
          <span>{store.budgets.total > 0 ? '预算剩余 / 总预算' : '月预算'}</span>
          <strong>{store.budgets.total > 0 ? `${yuan(Math.max(0, remain))} / ${yuan(store.budgets.total)}` : '未设置'}</strong>
        </article>
        <article className="card kpi">
          <span>整体进度</span>
          <strong>{store.budgets.total > 0 ? `${Math.min(100, Math.round((total / store.budgets.total) * 100))}%` : '—'}</strong>
          {store.budgets.total > 0 ? <Progress value={total} max={store.budgets.total} /> : <p className="muted">先在设置里写下月预算。</p>}
        </article>
      </section>
      {store.budgets.total <= 0 ? <p className="note" style={{ marginBottom: 14 }}>还没有月预算。下面先按实际支出展示，预算可以去设置里补。</p> : null}
      <section className="grid-4">
        {parts.map((part) => (
          <button type="button" key={part.tag} className="card stat link-card" onClick={() => selectTag(part.tag)}>
            <span className={`tag tag-${part.tag}`}>{part.tag}</span>
            <strong>{yuan(part.amount)}</strong>
            <span>占 {share(part.amount, total)}%</span>
          </button>
        ))}
      </section>
      <section className="grid-2">
        <article className="card">
          <h2>本月占比</h2>
          {total === 0 ? <Empty title="这个月还没有流水" desc="记一笔之后，环图会按衣食住行分开。" /> : (
            <>
              <div className="donut" style={{ background: gradient }}>
                <div className="donut-hole"><strong>{yuan(total)}</strong><span>本月</span></div>
              </div>
              <div className="legend">
                {parts.map((part) => (
                  <span key={part.tag}><i style={{ background: TAG_COLOR[part.tag] }} />{part.tag} {share(part.amount, total)}%</span>
                ))}
              </div>
            </>
          )}
        </article>
        <article className="card">
          <h2>近 6 个月</h2>
          <div className="trend">
            {trend.map((item) => (
              <div className={item.label === '9月' ? 'trend-col now' : 'trend-col'} key={item.label}>
                <b style={{ height: `${Math.max(8, (item.amount / peak) * 100)}%` }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
      <article className="card" style={{ marginBottom: 14 }}>
        <h2>分模块预算</h2>
        {SPEND_TAGS.map((item) => {
          const spent = sumAmount(monthExpenses(store.expenses, item));
          const budget = store.budgets[item];
          return (
            <div className="macro" key={item}>
              <div className="macro-label"><span>{item}</span><span>{yuan(spent)} / {budget > 0 ? yuan(budget) : '未设'}</span></div>
              <Progress value={spent} max={budget || spent || 1} />
            </div>
          );
        })}
      </article>
      <article className="card" style={{ marginBottom: 14 }}>
        <div className="page-head">
          <h2>流水</h2>
        </div>
        <div className="pills">
          <button type="button" className={tag === '全部' ? 'pill active' : 'pill'} onClick={() => selectTag('全部')}>全部</button>
          {SPEND_TAGS.map((item) => (
            <button type="button" key={item} data-testid={`filter-${item}`} className={tag === item ? 'pill active' : 'pill'} onClick={() => selectTag(item)}>{item}</button>
          ))}
        </div>
        {rows.length === 0 ? (
          <Empty title={tag === '全部' ? '还没有流水' : `「${tag}」下面还没有流水`} desc="记一笔就能出现在这里。" action={<button type="button" className="btn" onClick={() => setAdding(true)}>记一笔</button>} />
        ) : rows.map((item) => (
          <div className="txn" key={item.id}>
            <span className={`tag tag-${item.tag}`}>{item.tag}</span>
            <div>
              <strong>{item.merchant}</strong>
              <p className="muted">{item.date.slice(5)} · {item.note}</p>
            </div>
            <strong>{yuan(item.amount)}</strong>
            <button type="button" className="btn-text small" onClick={() => store.removeExpense(item.id)}>删除</button>
          </div>
        ))}
      </article>
      <article className="card">
        <h2>省钱建议</h2>
        {tips.map((tip) => {
          const done = store.adoptedTips.includes(tip.id);
          return (
            <div className="alert" key={tip.id}>
              <p>{tip.text}</p>
              <button
                type="button"
                className="btn small"
                disabled={done}
                onClick={() => { store.markTip(tip.id); navigate(tip.href); }}
              >{done ? '已采纳' : tip.action}</button>
            </div>
          );
        })}
      </article>
      {adding ? <ExpenseModal onClose={() => setAdding(false)} /> : null}
      {billRows ? (
        <ImportModal
          rows={billRows}
          reading={readingBill}
          onChange={setBillRows}
          onCsv={() => csvRef.current?.click()}
          onShot={() => shotRef.current?.click()}
          onClose={() => setBillRows(null)}
        />
      ) : null}
      <input ref={csvRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => { void onBillFile(event.target.files?.[0], 'csv'); }} />
      <input ref={shotRef} hidden type="file" accept="image/*" onChange={(event) => { void onBillFile(event.target.files?.[0], 'image'); }} />
    </>
  );
}

function readBill(file: File, kind: 'data' | 'text') {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    if (kind === 'data') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function ImportModal({
  rows,
  reading,
  onChange,
  onCsv,
  onShot,
  onClose,
}: {
  rows: BillDraft[];
  reading: boolean;
  onChange: (rows: BillDraft[]) => void;
  onCsv: () => void;
  onShot: () => void;
  onClose: () => void;
}) {
  const store = useStore();
  const ready = rows.length > 0 && rows.every((row) => row.tag);

  function setTag(index: number, tag: string) {
    onChange(rows.map((row, item) => (item === index ? { ...row, tag: tag ? tag as SpendTag : null } : row)));
  }

  return (
    <Modal title="导入账单" onClose={onClose}>
      <p className="muted">CSV 按衣食住行归类。截图交给已连接的模型。确认后计入本月环图和预算进度。</p>
      <div className="row-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn-ghost" disabled={reading} onClick={onCsv}>选择 CSV</button>
        <button type="button" className="btn-ghost" disabled={reading} onClick={onShot}>选择截图</button>
      </div>
      {rows.length === 0 ? <p className="note" style={{ marginTop: 12 }}>{reading ? '正在读取…' : '还没有读到支出。收入行会跳过。'}</p> : rows.map((row, index) => (
        <div className="txn" key={`${row.merchant}-${row.date}-${index}`}>
          <select aria-label={`${row.merchant}的分类`} value={row.tag ?? ''} onChange={(event) => setTag(index, event.target.value)}>
            <option value="">选择</option>
            {SPEND_TAGS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div>
            <strong>{row.merchant}</strong>
            <p className="muted">{row.date.slice(5)} · {row.note}</p>
          </div>
          <strong>{yuan(row.amount)}</strong>
        </div>
      ))}
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
        <button
          type="button"
          className="btn"
          data-testid="confirm-import"
          disabled={!ready}
          onClick={() => { store.importExpenses(rows); onClose(); }}
        >确认导入</button>
      </div>
    </Modal>
  );
}

function donut(parts: { color: string; value: number }[]) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) return 'conic-gradient(#e2e8f0 0 100%)';
  let cursor = 0;
  const stops = parts.map((part) => {
    const start = cursor;
    cursor += (part.value / total) * 100;
    return `${part.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(',')})`;
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState({ tag: '食' as SpendTag, amount: '', date: '2026-09-22', merchant: '', note: '' });

  function save() {
    const amount = Number(draft.amount);
    if (!draft.merchant.trim() || !Number.isFinite(amount) || amount <= 0) return;
    store.addExpense({ tag: draft.tag, amount, date: draft.date, merchant: draft.merchant.trim(), note: draft.note.trim() || '手动记账' });
    onClose();
  }

  return (
    <Modal title="记一笔" onClose={onClose}>
      <p className="muted">统计页只汇总 2026 年 9 月。</p>
      <form onSubmit={(event) => { event.preventDefault(); save(); }} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <Field label="模块">
            <select value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value as SpendTag })}>
              {SPEND_TAGS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="金额"><input autoFocus required type="number" min={1} step="1" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></Field>
          <Field label="日期"><input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
          <Field label="商户"><input required value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} /></Field>
          <Field label="备注" wide><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">保存</button>
        </div>
      </form>
    </Modal>
  );
}
