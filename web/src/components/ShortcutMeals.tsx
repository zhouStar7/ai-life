import { useEffect, useState } from 'react';
import { api, errorDetail } from '../api/client';

export type ShortcutMeal = { id: string; text: string; date: string };

export function ShortcutMeals({ revision, onReview }: { revision: number; onReview: (draft: ShortcutMeal) => Promise<void> }) {
  const [drafts, setDrafts] = useState<ShortcutMeal[]>([]);
  const [error, setError] = useState('');
  const [active, setActive] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<{ drafts: ShortcutMeal[] }>('/api/meals/shortcut-drafts', { signal: controller.signal })
      .then((body) => setDrafts(body.drafts))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorDetail(failure));
      });
    return () => controller.abort();
  }, [revision]);

  async function act(draft: ShortcutMeal, discard: boolean) {
    setActive(draft.id);
    setError('');
    try {
      if (discard) {
        await api(`/api/meals/shortcut-drafts/${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
        setDrafts((rows) => rows.filter((row) => row.id !== draft.id));
      } else {
        await onReview(draft);
      }
    } catch (failure) {
      setError(errorDetail(failure));
    } finally {
      setActive('');
    }
  }

  if (!drafts.length && !error) return null;
  return (
    <article className="card">
      <h2>快捷指令草稿</h2>
      {error && <p role="alert">{error}</p>}
      {drafts.map((draft) => (
        <div className="meal" key={draft.id}>
          <time>{draft.date}</time>
          <strong>{draft.text}</strong>
          <button type="button" className="btn-text small" disabled={!!active} onClick={() => void act(draft, false)}>核对餐次</button>
          <button type="button" className="btn-text small" disabled={!!active} onClick={() => void act(draft, true)}>丢弃</button>
        </div>
      ))}
    </article>
  );
}
