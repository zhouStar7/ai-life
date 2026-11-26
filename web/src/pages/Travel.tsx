import { useState } from 'react';
import { useLocalDate } from '../localDate';
import { reportMonth, monthExpenses, sumAmount, yuan } from '../format';
import { modelDestination } from '../../../shared/modelEndpoint';
import { tripDateLabel, tripStatus, type TripDates } from '../../../shared/trips';
import { useStore } from '../store';
import type { ItineraryDraft, Trip, TripChain } from '../types';
import { Empty, Field, Modal, Progress, SpendCard } from '../components/ui';

export function TravelPage() {
  const store = useStore();
  const [creating, setCreating] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [chain, setChain] = useState<TripChain | null>(null);
  const trip = store.trips.find((item) => item.id === store.activeTripId) ?? store.trips[0];
  const today = useLocalDate();
  const [month, setMonth] = useState(reportMonth(today));
  const done = trip ? trip.packing.filter((item) => item.done).length : 0;

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 32 }}>出行</h1>
        <div className="row-actions">
          <label>支出月份 <input type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label>
          <button type="button" className="btn-ghost" onClick={() => setPasting(true)}>粘贴行程</button>
          <button type="button" className="btn" data-testid="new-trip" onClick={() => setCreating(true)}>新建行程</button>
        </div>
      </header>
      {store.trips.length === 0 || !trip ? (
        <div className="stack">
          <div className="card">
            <Empty title="还没有行程" desc="可以新建，也可以直接粘贴短信或邮件。" action={<div className="row-actions"><button type="button" className="btn-ghost" onClick={() => setPasting(true)}>粘贴行程</button><button type="button" className="btn" onClick={() => setCreating(true)}>创建行程</button></div>} />
          </div>
          <SpendCard tag="行" month={month} label={`${month} 出行支出`} />
        </div>
      ) : (
        <div className="layout-2">
          <section className="stack">
            <div className="trip-list">
              {store.trips.map((item) => (
                <button type="button" key={item.id} className={item.id === trip.id ? 'trip active' : 'trip'} onClick={() => store.selectTrip(item.id)}>
                  <strong>{item.title}</strong>
                  <p>{tripStatus(item, today)} · {item.transport}</p>
                  <small>{item.dateLabel}</small>
                </button>
              ))}
            </div>
            <article className="card travel-detail">
              <div className="page-head">
                <div>
                  <h2>{trip.title}</h2>
                  <p className="muted">{tripStatus(trip, today)} · {trip.transport} · {trip.dateLabel}</p>
                </div>
                <button type="button" className="btn-text" onClick={() => store.removeTrip(trip.id)}>删除行程</button>
              </div>
              <div className="travel-columns">
                <section>
                  <h3 className="section-title">时间线</h3>
                  <ul className="timeline">
                    {trip.timeline.map((node) => (
                      <li key={`${node.time}-${node.title}`}>
                        <strong>{node.title}</strong>
                        <p className="muted">{node.time} · {node.detail}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="section-title">票务与酒店</h3>
                  {trip.tickets.length === 0 ? (
                    <p className="callout">还没有票务或酒店订单。行李清单和准备建议仍然可以用。</p>
                  ) : (
                    <div className="tickets">
                      {trip.tickets.map((ticket) => (
                        <div className="ticket" key={ticket.label}>
                          <strong>{ticket.label}</strong>
                          <p><small>{ticket.status}</small></p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </article>
          </section>
          <aside className="stack">
            <article className="card suggestion">
              <h2>出行准备包</h2>
              <button type="button" className="btn" onClick={() => { void store.runChain(trip.id, month).then(setChain); }}>预览准备包</button>
              {chain && chain.trip.id === trip.id && chain.budget.month === month ? (
                <div className="note" style={{ marginTop: 12 }}>
                  <p>穿搭：{chain.outfit.title}</p>
                  <p className="muted">{chain.outfit.reason}</p>
                  <p>行李：{chain.packing.join('、') || '清单为空'}</p>
                  <button className="btn" disabled={trip.prepAdopted || store.saving} onClick={() => store.adoptPrep(trip.id, chain.confirmation)}>{trip.prepAdopted ? '准备包已采纳' : '确认采纳准备包'}</button>
                  <p>离家场景需要单独确认。</p>
                  <button className="btn-ghost" onClick={() => store.applyScene('离家')}>预览离家动作</button>
                  <p>这一顿：{chain.meal.name}</p>
                  <button type="button" className="btn small" onClick={() => store.adoptTripMeal(trip.id, chain.meal.name)}>采纳这顿</button>
                  <p>本趟票务食宿 {yuan(chain.budget.trip)} · {chain.budget.month} 出行 {yuan(chain.budget.spent)} / {yuan(chain.budget.budget)}</p>
                </div>
              ) : null}
            </article>
            <article className="card">
              <h2>行李清单</h2>
              <p className="muted">{done}/{trip.packing.length} 已勾选</p>
              <Progress value={done} max={trip.packing.length || 1} warnAt={1.1} />
              {trip.packing.map((item) => (
                <PackingLine key={item.id} tripId={trip.id} item={item} />
              ))}
              <PackingTools trip={trip} />
            </article>
            <TripSpend trip={trip} month={month} />
          </aside>
        </div>
      )}
      {creating ? <TripModal today={today} onClose={() => setCreating(false)} /> : null}
      {pasting ? <PasteModal onClose={() => setPasting(false)} /> : null}
    </>
  );
}

function PasteModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ItineraryDraft | null>(null);
  const [reading, setReading] = useState(false);

  async function read() {
    setReading(true);
    const next = await store.parseTrip(text);
    setReading(false);
    if (next) setDraft(next);
  }

  return (
    <Modal title="粘贴行程" onClose={onClose}>
      <p className="muted">短信或邮件先由本机规则解析。规则无法识别时，原文的处理位置：{modelDestination(store.model.baseUrl)}。</p>
      <textarea aria-label="行程短信或邮件" disabled={reading} value={text} onChange={(event) => { setText(event.target.value); setDraft(null); }} rows={6} style={{ width: '100%', marginTop: 12 }} />
      {draft ? (
        <div className="note" style={{ marginTop: 12 }}>
          {draft.existingTrip ? <p role="status">已导入「{draft.existingTrip.title}」</p> : <>
            <div className="form-grid">
              <Field label="行程名称" wide><input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></Field>
              <Field label="交通方式"><input value={draft.transport} onChange={e => setDraft({ ...draft, transport: e.target.value })} /></Field>
              <Field label="行程日期"><input value={draft.dateLabel} onChange={e => setDraft({ ...draft, dateLabel: e.target.value })} /></Field>
              <TripDateFields dates={draft} onChange={dates => setDraft({ ...draft, ...dates, dateLabel: tripDateLabel(dates) })} />
            </div>
            {draft.timeline.map((node, i) => <fieldset key={i} className="form-grid"><legend>时间线 {i + 1}</legend>
              {(['title', 'time', 'detail'] as const).map((field, j) => <Field key={field} label={['事件', '时间', '地点'][j]}><input value={node[field]} onChange={e => setDraft({ ...draft, timeline: draft.timeline.map((other, k) => i === k ? { ...node, [field]: e.target.value } : other) })} /></Field>)}
            </fieldset>)}
            {draft.tickets.map((ticket, i) => <fieldset key={i} className="form-grid"><legend>预订 {i + 1}</legend>
              <Field label="预订名称"><input value={ticket.label} onChange={e => setDraft({ ...draft, tickets: draft.tickets.map((other, k) => i === k ? { ...ticket, label: e.target.value } : other) })} /></Field>
              <Field label="预订状态"><input value={ticket.status} onChange={e => setDraft({ ...draft, tickets: draft.tickets.map((other, k) => i === k ? { ...ticket, status: e.target.value } : other) })} /></Field>
            </fieldset>)}
            <Field label="行李（每行一项）" wide><textarea value={draft.packing.join('\n')} onChange={e => setDraft({ ...draft, packing: e.target.value.split('\n') })} /></Field>
          </>}
          {draft.source === 'model' ? <p className="muted">这是模型读出的时间线、交通和酒店，确认后再写入。</p> : null}
        </div>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
        <button type="button" className="btn-ghost" disabled={reading || !text.trim()} onClick={() => { void read(); }}>{reading ? '读取中…' : '生成'}</button>
        <button type="button" className="btn" disabled={store.saving || !draft?.title.trim() || invalidDateRange(draft) || !draft.timeline.every(node => node.title.trim() && node.time.trim() && node.detail.trim())} onClick={() => { if (!draft) return; void store.importTrip(draft).then((ok) => { if (ok) onClose(); }); }}>{draft?.existingTrip ? '打开已有行程' : '写入行程'}</button>
      </div>
    </Modal>
  );
}

function PackingLine({ tripId, item }: { tripId: string; item: Trip['packing'][number] }) {
  const store = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  return edit === null ? <div className="row-actions">
    <label className="check"><input type="checkbox" checked={item.done} onChange={() => store.togglePack(tripId, item.id)} /><span>{item.text}</span></label>
    <button type="button" className="btn-ghost small" aria-label={`编辑${item.text}`} onClick={() => setEdit(item.text)}>编辑</button>
  </div> : <form className="row-actions" onSubmit={async e => { e.preventDefault(); if (edit.trim() && await store.editPackingLine(tripId, item.id, edit.trim())) setEdit(null); }}>
    <input autoFocus aria-label="行李名称" value={edit} onChange={e => setEdit(e.target.value)} />
    <button type="submit" className="btn small" disabled={!edit.trim() || store.saving}>保存</button>
    <button type="button" className="btn-ghost small" onClick={() => setEdit(null)}>取消</button>
  </form>;
}

function PackingTools({ trip }: { trip: Trip }) {
  const store = useStore();
  const [text, setText] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <form className="row-actions" onSubmit={async (event) => { event.preventDefault(); if (!text.trim()) return; if (await store.addPackingLine(trip.id, text.trim())) setText(''); }}>
        <input aria-label="行李一行" value={text} placeholder="加一行行李" onChange={(event) => setText(event.target.value)} />
        <button type="submit" disabled={store.saving} className="btn-ghost small">添加</button>
      </form>
      <form className="row-actions" onSubmit={async (event) => { event.preventDefault(); if (!name.trim()) return; if (await store.savePackingTemplate(trip.id, name.trim())) setName(''); }}>
        <input aria-label="模板名称" value={name} placeholder="模板名称" onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={store.saving} className="btn-ghost small">存成模板</button>
      </form>
      {store.packingTemplates.length > 0 ? (
        <div className="pills">
          {store.packingTemplates.map((template) => (
            <button type="button" key={template.id} className="pill" onClick={() => store.applyPackingTemplate(trip.id, template.id)}>{template.name}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TripSpend({ trip, month }: { trip: Trip; month: string }) {
  const store = useStore();
  const rows = store.expenses.filter((item) => item.tripId === trip.id && item.tag === '行');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [kind, setKind] = useState<'票务' | '食宿'>('票务');
  const total = sumAmount(rows);
  const spent = sumAmount(monthExpenses(store.expenses, '行', month));

  return (
    <article className="card">
      <h2>这一趟的票务和食宿</h2>
      <p>本趟合计 {yuan(total)}</p>
      <p>{month} 出行支出 {yuan(spent)} / 预算 {yuan(store.budgets.行)}</p>
      {rows.map((item) => (
        <p key={item.id}>{item.note} · {item.merchant} · {yuan(item.amount)}</p>
      ))}
      <form className="stack" style={{ marginTop: 8 }} onSubmit={async (event) => {
        event.preventDefault();
        const value = Number(amount);
        if (!merchant.trim() || !Number.isFinite(value) || value <= 0) return;
        if (!await store.addTripExpense(trip.id, { amount: value, merchant: merchant.trim(), kind })) return;
        setAmount('');
        setMerchant('');
      }}>
        <div className="row-actions">
          <select aria-label="费用种类" value={kind} onChange={(event) => setKind(event.target.value as '票务' | '食宿')}>
            <option value="票务">票务</option>
            <option value="食宿">食宿</option>
          </select>
          <input aria-label="金额" inputMode="decimal" type="number" min="0.01" step="0.01" placeholder="金额" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <input aria-label="商户" placeholder="商户" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
          <button type="submit" disabled={store.saving} className="btn-ghost small">记到这趟</button>
        </div>
      </form>
    </article>
  );
}

function invalidDateRange({ startDate, endDate }: TripDates) {
  return Boolean(startDate && endDate && endDate < startDate);
}

function TripDateFields({ dates, onChange }: { dates: TripDates; onChange: (dates: TripDates) => void }) {
  const { startDate, endDate } = dates;
  return <>
    <Field label="出发日期"><input type="date" value={startDate || ''} onChange={event => onChange({ startDate: event.target.value, endDate })} /></Field>
    <Field label="结束日期"><input type="date" min={startDate || undefined} value={endDate || ''} onChange={event => onChange({ startDate, endDate: event.target.value })} /></Field>
    {invalidDateRange(dates) && <p role="alert" className="muted">结束日期须为出发当天或之后。</p>}
  </>;
}

function TripModal({ today, onClose }: { today: string; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Pick<Trip, 'title' | 'transport'> & TripDates>({ title: '', transport: '高铁' });

  function applyTemplate(kind: 'weekend' | 'work') {
    setDraft(kind === 'weekend' ? { title: '周末短途', transport: '高铁' } : { title: '商务出差', transport: '飞机' });
  }

  return (
    <Modal title="新建行程" onClose={onClose}>
      <div className="pills">
        <button type="button" className="pill" onClick={() => applyTemplate('weekend')}>周末模板</button>
        <button type="button" className="pill" onClick={() => applyTemplate('work')}>出差模板</button>
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const title = draft.title.trim();
        if (!title || invalidDateRange(draft)) return;
        const dates = { startDate: draft.startDate || draft.endDate || null, endDate: draft.endDate || draft.startDate || null };
        if (await store.addTrip({ ...draft, ...dates, title, status: tripStatus(dates, today), dateLabel: tripDateLabel(dates) })) onClose();
      }}>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="名称" wide><input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label="交通"><input value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value })} /></Field>
          <TripDateFields dates={draft} onChange={dates => setDraft({ ...draft, ...dates })} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" disabled={store.saving || invalidDateRange(draft)} className="btn">创建</button>
        </div>
      </form>
    </Modal>
  );
}
