import { useState } from 'react';
import { useStore } from '../store';
import type { Trip, TripStatus } from '../types';
import { Empty, Field, Modal, Progress, SpendCard } from '../components/ui';

export function TravelPage() {
  const store = useStore();
  const [creating, setCreating] = useState(false);
  const trip = store.trips.find((item) => item.id === store.activeTripId) ?? store.trips[0];
  const done = trip ? trip.packing.filter((item) => item.done).length : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">AI Life · Travel</p>
          <h1 className="display">行<br />·<br />出行</h1>
        </div>
        <div className="row-actions">
          <button type="button" className="btn" data-testid="new-trip" onClick={() => setCreating(true)}>新建行程</button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(true)}>导入订单</button>
        </div>
      </header>
      {store.trips.length === 0 || !trip ? (
        <div className="stack">
          <div className="card">
            <Empty title="还没有行程" desc="新建一趟，或者套用周末、出差模板。" action={<button type="button" className="btn" onClick={() => setCreating(true)}>创建行程</button>} />
          </div>
          <SpendCard tag="行" label="本月出行支出" />
        </div>
      ) : (
        <div className="layout-2">
          <section className="stack">
            <div className="trip-list">
              {store.trips.map((item) => (
                <button type="button" key={item.id} className={item.id === trip.id ? 'trip active' : 'trip'} onClick={() => store.selectTrip(item.id)}>
                  <strong>{item.title}</strong>
                  <p>{item.status} · {item.transport}</p>
                  <small>{item.dateLabel}</small>
                </button>
              ))}
            </div>
            <article className="card">
              <div className="page-head">
                <div>
                  <h2>{trip.title}</h2>
                  <p className="muted">{trip.status} · {trip.transport} · {trip.dateLabel}</p>
                </div>
                <button type="button" className="btn-text" onClick={() => store.removeTrip(trip.id)}>删除行程</button>
              </div>
              <h3 className="section-title">时间线</h3>
              <ul className="timeline">
                {trip.timeline.map((node) => (
                  <li key={`${node.time}-${node.title}`}>
                    <strong>{node.title}</strong>
                    <p className="muted">{node.time} · {node.detail}</p>
                  </li>
                ))}
              </ul>
              <h3 className="section-title" style={{ marginTop: 8 }}>票务与酒店</h3>
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
            </article>
          </section>
          <aside className="stack">
            <article className="card suggestion">
              <h2>出行准备包</h2>
              <p className="reason">穿搭沿用今日通勤建议，出发前切到离家，饮食改成附近简餐。</p>
              <button type="button" className="btn" disabled={trip.prepAdopted} onClick={() => store.adoptPrep(trip.id)}>{trip.prepAdopted ? '已采纳' : '采纳准备包'}</button>
            </article>
            <article className="card">
              <h2>行李清单</h2>
              <p className="muted">{done}/{trip.packing.length} 已勾选</p>
              <Progress value={done} max={trip.packing.length || 1} warnAt={1.1} />
              {trip.packing.map((item) => (
                <label className="check" key={item.id}>
                  <input type="checkbox" checked={item.done} onChange={() => store.togglePack(trip.id, item.id)} />
                  <span>{item.text}</span>
                </label>
              ))}
            </article>
            <SpendCard tag="行" label="本月出行支出" />
          </aside>
        </div>
      )}
      {creating ? <TripModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function TripModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Pick<Trip, 'title' | 'status' | 'transport' | 'dateLabel'>>({
    title: '',
    status: '即将开始',
    transport: '高铁',
    dateLabel: '',
  });

  function applyTemplate(kind: 'weekend' | 'work') {
    setDraft(kind === 'weekend'
      ? { title: '周末短途', status: '即将开始', transport: '高铁', dateLabel: '日期待定' }
      : { title: '商务出差', status: '即将开始', transport: '飞机', dateLabel: '日期待定' });
  }

  return (
    <Modal title="新建行程" onClose={onClose}>
      <div className="pills">
        <button type="button" className="pill" onClick={() => applyTemplate('weekend')}>周末模板</button>
        <button type="button" className="pill" onClick={() => applyTemplate('work')}>出差模板</button>
      </div>
      <p className="muted">订单导入还没接通，可以先用模板或手写。</p>
      <form onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim()) return; store.addTrip({ ...draft, title: draft.title.trim(), dateLabel: draft.dateLabel.trim() || '日期待定' }); onClose(); }}>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="名称" wide><input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
          <Field label="状态">
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TripStatus })}>
              <option>即将开始</option>
              <option>进行中</option>
            </select>
          </Field>
          <Field label="交通"><input value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value })} /></Field>
          <Field label="日期" wide><input placeholder="例如 10月2日 – 10月4日" value={draft.dateLabel} onChange={(event) => setDraft({ ...draft, dateLabel: event.target.value })} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn">创建</button>
        </div>
      </form>
    </Modal>
  );
}
