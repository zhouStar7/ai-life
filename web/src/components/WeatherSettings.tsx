import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';
import { Field } from './ui';

export function WeatherSettings() {
  const store = useStore();
  const [cities, setCities] = useState<string[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const city = choice ?? store.weatherCity;
  useEffect(() => {
    const controller = new AbortController();
    api<{ cities: string[] }>('/api/weather/cities', { signal: controller.signal })
      .then((data) => { setCities(data.cities); setLoadFailed(false); })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [attempt, store.online]);

  return <article className="card">
    <h2>天气</h2>
    <p className="muted" role="status">{store.weatherCity ? `${store.weatherCity} · ` : ''}{store.weatherOn && store.weatherCity ? store.weatherLabel : '天气未知'}{store.weatherSource && ` · ${store.weatherSource}`}{store.weatherUpdatedAt && ` · 上次更新 ${new Date(store.weatherUpdatedAt).toLocaleString('zh-CN')}`}</p>
    <form onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      try { await store.refreshWeather(city); } finally { setBusy(false); }
    }}>
      <Field label="天气城市"><select value={city} required onChange={(event) => setChoice(event.target.value)}>
        <option value="">选择城市</option>
        {(cities.length ? cities : store.weatherCity ? [store.weatherCity] : []).map((name) => <option key={name} value={name}>{name}</option>)}
      </select></Field>
      <div className="modal-actions">
        {loadFailed && <button type="button" className="btn-ghost" onClick={() => setAttempt((n) => n + 1)}>重新加载城市</button>}
        <button type="submit" className="btn" disabled={!city || busy}>{busy ? '正在获取天气…' : '更新天气'}</button>
      </div>
    </form>
  </article>;
}
