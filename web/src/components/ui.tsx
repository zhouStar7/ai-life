import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);
  const [previousFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => { closeRef.current = onClose; savingRef.current = saving; }, [onClose, saving]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const selector = '.modal[role="dialog"]';
    root.dataset.modal = 'open';
    if (!dialog.contains(document.activeElement)) dialog.focus();

    function onKey(event: KeyboardEvent) {
      const dialogs = document.querySelectorAll(selector);
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex="0"]'))
        .filter((element) => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first || !dialog.contains(active) || active === dialog || active === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? dialog : first ?? dialog).focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!Array.from(document.querySelectorAll(selector)).some((other) => other !== dialog)) delete root.dataset.modal;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [previousFocus]);

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
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
