import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { yuan } from '../format';
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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const root = document.documentElement;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const count = Number(root.dataset.modalCount ?? '0') + 1;
    root.dataset.modalCount = String(count);
    root.dataset.modal = 'open';
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const next = Number(root.dataset.modalCount ?? '1') - 1;
      if (next <= 0) {
        delete root.dataset.modalCount;
        delete root.dataset.modal;
      } else root.dataset.modalCount = String(next);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        {children}
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

export function SpendCard({ tag, label }: { tag: SpendTag; label: string }) {
  const { spending } = useStore();
  const navigate = useNavigate();
  const amount = spending.byTag[tag];
  return (
    <button type="button" className="card spend-link" onClick={() => navigate(`/spending?tag=${encodeURIComponent(tag)}`)}>
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
