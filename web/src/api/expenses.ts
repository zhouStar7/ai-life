import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './client';
import { loadSnapshot, saveSnapshot } from './snapshot';
import { useStore } from '../store';
import type { Expense, SpendingSummary } from '../types';

type Page = { rows: Expense[]; nextCursor: string | null; total: number; amount: number; summary: SpendingSummary };
export function useExpensePage(query: { month?: string; tag?: string; tripId?: string }) {
  const store = useStore();
  const key = new URLSearchParams({ limit: '30', ...query }).toString();
  const [result, setResult] = useState<{ key: string; page: Page } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const activeKey = useRef(key);
  const page = result?.key === key ? result.page : null;
  useEffect(() => { activeKey.current = key; }, [key]);
  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `${store.member!.id}:ledger:${key}`;
    // This state describes the external request started by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true); setError('');
    api<Page>(`/api/expenses?${key}`, { signal: controller.signal }).then(value => {
      setResult({ key, page: value });
      void saveSnapshot(cacheKey, value).catch(() => undefined);
    }).catch(async e => {
      if (controller.signal.aborted || (e instanceof ApiError && e.status === -1)) return;
      const cached = await loadSnapshot<Page>(cacheKey).catch(() => null);
      if (controller.signal.aborted) return;
      if (cached) setResult({ key, page: cached });
      setError(cached ? '连接中断，显示上次保存的账单。' : '账单暂时加载失败，请重试。');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, store.member, store.spending, attempt]);
  async function loadMore() {
    if (!page?.nextCursor || pending.current) return;
    pending.current = true; setLoading(true); setError('');
    try {
      const next = await api<Page>(`/api/expenses?${key}&cursor=${encodeURIComponent(page.nextCursor)}`);
      if (activeKey.current !== key) return;
      setResult(current => current?.key === key ? { key, page: { ...next, rows: [...current.page.rows, ...next.rows.filter(row => !current.page.rows.some(r => r.id === row.id))] } } : current);
    } catch { if (activeKey.current === key) setError('加载更多失败，请重试。'); }
    finally { pending.current = false; if (activeKey.current === key) setLoading(false); }
  }
  const drafts = store.expenses.filter(e => (!query.month || e.date.startsWith(query.month)) && (!query.tag || e.tag === query.tag) && (!query.tripId || e.tripId === query.tripId));
  return { rows: [...drafts, ...(page?.rows ?? [])], page, loading, error, loadMore, retry: () => setAttempt(n => n + 1) };
}
