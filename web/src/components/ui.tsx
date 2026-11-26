import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { monthExpenses, sumAmount, yuan } from '../format';
import { useStore } from '../store';
import type { SpendTag } from '../types';

export function PageHead({ title, desc, extra }: { title: string; desc?: string; extra?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {desc ? <p>{desc}</p> : null}
      </div>
      {extra}
    </div>
  );
}

export function Empty({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{desc}</p>
      {action ? <div className="row-actions" style={{ justifyContent: 'center', marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function SaveStatus({ compact = false }: { compact?: boolean }) {
  const { source, demoMode, saving, writeMessage, reconnect } = useStore();
  const labels = {
    loading: '正在连接本地服务…', api: demoMode ? '演示数据库 · 已连接' : '本机数据库 · 已连接',
    cached: '缓存 · 显示上次读取的记录', offline: '离线 · 暂时无法读取个人记录',
    demo: '演示模式 · 更改仅在本页有效',
  };
  const reconnectable = source === 'cached' || source === 'offline' || source === 'demo';
  if (!saving && !writeMessage && (!labels[source] || (compact && source === 'api'))) return null;
  return (
    <div className="note" role="status" aria-live="polite" style={{ marginBottom: 12 }}>
      {labels[source] && <strong>{labels[source]} </strong>}
      {saving ? '正在等待本地服务…' : writeMessage}
      {reconnectable && <button type="button" className="btn-text small" disabled={saving} onClick={() => void reconnect()}>重新连接并刷新记录</button>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { saving } = useStore();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!saving && event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" disabled={saving} onClick={onClose} aria-label="关闭">×</button>
        </header>
        <SaveStatus compact />
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>
      </div>
    </div>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field full' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SpendCard({ tag, label, month }: { tag: SpendTag; label: string; month?: string }) {
  const { expenses } = useStore();
  const navigate = useNavigate();
  const amount = sumAmount(monthExpenses(expenses, tag, month));
  const params = new URLSearchParams({ tag });
  if (month) params.set('month', month);
  return (
    <button type="button" className="card spend-link" onClick={() => navigate(`/spending?${params}`)}>
      <span className="muted">{label}</span>
      <strong>{yuan(amount)}</strong>
      <em>查看支出统计 · 筛「{tag}」</em>
    </button>
  );
}

export function Progress({ value, max, warnAt = 0.85 }: { value: number; max: number; warnAt?: number }) {
  const ratio = max > 0 ? value / max : 0;
  return (
    <div className={ratio >= warnAt ? 'bar warn' : 'bar'} aria-hidden="true">
      <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}
