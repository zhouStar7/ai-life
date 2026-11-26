import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { monthExpenses, percentChange, reportMonth, share, yuan } from '../format';
import { isMonth, spendingSummary } from '../../../shared/spending';
import { localDate, useLocalDate } from '../localDate';
import { TAG_COLOR } from '../seed';
import { modelDestination } from '../../../shared/modelEndpoint';
import { useStore } from '../store';
import { SPEND_TAGS, type BillDraft, type BillImportReceipt, type Expense, type SpendTag } from '../types';
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
  const today = useLocalDate();
  const requestedMonth = params.get('month');
  const period = isMonth(requestedMonth) ? requestedMonth : reportMonth(today);
  const { monthTotal: total, byTag, trend } = spendingSummary(store.expenses, period, (row) => BigInt(Math.round(row.amount * 100)));
  const ledgerParams = new URLSearchParams({ month: period, limit: String(LEDGER_PAGE_SIZE) });
  if (tag !== '全部') ledgerParams.set('tag', tag);
  const previous = trend[4].amount;
  const change = previous > 0 ? percentChange(total, previous) : null;
  const remain = store.budgets.total - total;
  const parts = SPEND_TAGS.map((tag) => ({ tag, amount: byTag[tag] }));
  const gradient = donut(parts.map((part) => ({ color: TAG_COLOR[part.tag], value: part.amount })));
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

  function selectFilter(key: 'tag' | 'month', value: string) {
    const next = new URLSearchParams(params);
    if (key === 'tag' && value === '全部') next.delete(key);
    else next.set(key, value);
    setParams(next);
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
          <Field label="统计月份">
            <input type="month" value={period} onChange={(event) => { if (isMonth(event.target.value)) selectFilter('month', event.target.value); }} />
          </Field>
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
          <strong className={change ? (change > 0 ? 'up' : 'down') : undefined}>{change === null ? '上月无支出' : `${change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}${Math.abs(change)}%`}</strong>
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
          <button type="button" key={part.tag} className="card stat link-card" onClick={() => selectFilter('tag', part.tag)}>
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
              <div className={item.month === period ? 'trend-col now' : 'trend-col'} key={item.month} title={`${item.month} · ${yuan(item.amount)}`}>
                <b aria-hidden="true" style={{ height: `${(item.amount / peak) * 100}%`, minHeight: 0 }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <details><summary>查看每月金额</summary>
            <dl>{trend.map((item) => <div className="macro-label" key={item.month}><dt>{item.month}</dt><dd>{yuan(item.amount)}</dd></div>)}</dl>
          </details>
        </article>
      </section>
      <article className="card" style={{ marginBottom: 14 }}>
        <h2>分模块预算</h2>
        {SPEND_TAGS.map((item) => {
          const spent = byTag[item];
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
          <button type="button" className={tag === '全部' ? 'pill active' : 'pill'} onClick={() => selectFilter('tag', '全部')}>全部</button>
          {SPEND_TAGS.map((item) => (
            <button type="button" key={item} data-testid={`filter-${item}`} className={tag === item ? 'pill active' : 'pill'} onClick={() => selectFilter('tag', item)}>{item}</button>
          ))}
        </div>
        <ExpenseLedger key={ledgerParams.toString()} query={ledgerParams.toString()} month={period} tag={tag} onAdd={() => setAdding(true)} />
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
                disabled={done || store.saving}
                onClick={async () => { if (await store.markTip(tip.id)) navigate(tip.href); }}
              >{done ? '已采纳' : tip.action}</button>
            </div>
          );
        })}
      </article>
      {adding ? <ExpenseModal onClose={() => setAdding(false)} onSaved={(month) => { selectFilter('month', month); setAdding(false); }} /> : null}
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

const LEDGER_PAGE_SIZE = 30;
type LedgerPage = { rows: Expense[]; nextCursor: string | null; total: number };

function ExpenseLedger({ query, month, tag, onAdd }: { query: string; month: string; tag: SpendTag | '全部'; onAdd: () => void }) {
  const { expenses, online, removeExpense } = useStore();
  const requests = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ version: Expense[]; page: LedgerPage } | null>(null);
  const [visible, setVisible] = useState(LEDGER_PAGE_SIZE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const page = online && result?.version === expenses ? result.page : null;
  const local = monthExpenses(expenses, tag === '全部' ? undefined : tag, month)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  const rows = page?.rows ?? local.slice(0, visible);

  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    requests.current = controller;
    void api<LedgerPage>(`/api/expenses?${query}`, { signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) { setResult({ version: expenses, page }); setError(''); }
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    return () => controller.abort();
  }, [expenses, online, query]);

  async function more() {
    if (!page) { setVisible((count) => count + LEDGER_PAGE_SIZE); return; }
    const signal = requests.current?.signal;
    if (!page.nextCursor || pending || !signal || signal.aborted) return;
    setPending(true);
    setError('');
    try {
      const next = await api<LedgerPage>(`/api/expenses?${query}&cursor=${encodeURIComponent(page.nextCursor)}`, { signal });
      if (!signal.aborted) setResult({ version: expenses, page: { ...next, rows: [...page.rows, ...next.rows] } });
    } catch {
      if (!signal.aborted) setError('加载更多流水失败，请重试。');
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }

  if (!rows.length) return <Empty title={tag === '全部' ? '还没有流水' : `「${tag}」下面还没有流水`} desc="记一笔就能出现在这里。" action={<button type="button" className="btn" onClick={onAdd}>记一笔</button>} />;
  return <>
    {rows.map((item) => (
      <div className="txn" key={item.id}>
        <span className={`tag tag-${item.tag}`}>{item.tag}</span>
        <div><strong>{item.merchant}</strong><p className="muted">{item.date.slice(5)} · {item.note}</p></div>
        <strong>{yuan(item.amount)}</strong>
        <button type="button" className="btn-text small" onClick={() => removeExpense(item.id)}>删除</button>
      </div>
    ))}
    {error && <p role="status">{error}</p>}
    {(page ? page.nextCursor : local.length > visible) && <button type="button" className="btn-ghost small" disabled={pending && !!page} onClick={() => void more()}>加载更多流水</button>}
  </>;
}

function readBill(file: File, kind: 'data' | 'text') {
  if (kind === 'text') return file.arrayBuffer().then((buffer) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('gb18030').decode(buffer); }
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
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
  const [receipt, setReceipt] = useState<BillImportReceipt | null>(null);
  const ready = rows.length > 0 && rows.every((row) => row.status === 'duplicate' || (row.tag && row.date && (row.status !== 'review' || row.decision)));
  if (receipt) return (
    <Modal title="导入回执" onClose={onClose}>
      <p role="status">新增 {receipt.imported} 笔，合计 {yuan(receipt.amount)}</p>
      <p>重复 {receipt.duplicates} 笔 · 已跳过 {receipt.skipped} 笔 · 待补全 {receipt.incomplete} 笔</p>
      <button type="button" className="btn" onClick={onClose}>完成</button>
    </Modal>
  );

  function setTag(index: number, tag: string) {
    onChange(rows.map((row, item) => (item === index ? { ...row, tag: tag ? tag as SpendTag : null } : row)));
  }

  return (
    <Modal title="导入账单" onClose={onClose}>
      <p className="muted">CSV 在本机按衣食住行归类。选取截图后立即识别，处理位置：{modelDestination(store.model.baseUrl)}。请核对日期和分类，确认后按每笔交易的日期入账。</p>
      <div className="row-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn-ghost" disabled={reading || store.saving} onClick={onCsv}>选择 CSV</button>
        <button type="button" className="btn-ghost" disabled={reading || store.saving} onClick={onShot}>选择截图</button>
      </div>
      {rows.length === 0 ? <p className="note" style={{ marginTop: 12 }}>{reading ? '正在读取…' : '还没有读到支出。收入行会跳过。'}</p> : rows.map((row, index) => (
        <div className="txn" key={`${row.merchant}-${index}`}>
          <select disabled={row.status === 'duplicate'} aria-label={`${row.merchant}的分类`} value={row.tag ?? ''} onChange={(event) => setTag(index, event.target.value)}>
            <option value="">选择</option>
            {SPEND_TAGS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div>
            <strong>{row.merchant}</strong>
            <label className="field"><span>交易日期</span><input aria-label={`${row.merchant}的交易日期`} disabled={row.status === 'duplicate'} required type="date" value={row.date} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} /></label>
            <p className="muted">{row.note}{row.transactionId && ` · 流水号 ${row.transactionId}`}</p>
            <span>{row.status === 'duplicate' ? '重复 · 自动跳过' : row.status === 'review' ? '疑似重复 · 同日商户和金额相同' : !row.date || !row.tag ? '待补全' : '新增'}</span>
            {row.status === 'review' && <label className="field"><span>确认这笔交易</span>
              <select aria-label={`${row.merchant}的重复交易处理`} value={row.decision ?? ''} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, decision: event.target.value as BillDraft['decision'] } : item))}>
                <option value="">请选择</option><option value="skip">跳过</option><option value="import">作为另一笔导入</option>
              </select></label>}
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
          disabled={!ready || reading || store.saving}
          onClick={async () => {
             const result = await store.importExpenses(rows);
             if (result && 'reviewRows' in result) onChange(result.reviewRows);
             else setReceipt(result);
           }}
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

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: (month: string) => void }) {
  const store = useStore();
  const [draft, setDraft] = useState({ tag: '食' as SpendTag, amount: '', date: localDate(), merchant: '', note: '' });

  async function save() {
    const amount = Number(draft.amount);
    if (!draft.merchant.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const saved = await store.addExpense({ tag: draft.tag, amount, date: draft.date, merchant: draft.merchant.trim(), note: draft.note.trim() || '手动记账' });
    if (saved) onSaved(draft.date.slice(0, 7));
  }

  return (
    <Modal title="记一笔" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <Field label="模块">
            <select value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value as SpendTag })}>
              {SPEND_TAGS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="金额"><input autoFocus required type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></Field>
          <Field label="日期"><input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
          <Field label="商户"><input required value={draft.merchant} onChange={(event) => setDraft({ ...draft, merchant: event.target.value })} /></Field>
          <Field label="备注" wide><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn" disabled={store.saving}>保存</button>
        </div>
      </form>
    </Modal>
  );
}
