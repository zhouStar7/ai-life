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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
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
  const { expenses } = useStore();
  const navigate = useNavigate();
  const amount = sumAmount(monthExpenses(expenses, tag));
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
