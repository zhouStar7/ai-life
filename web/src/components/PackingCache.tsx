import { useEffect, useState } from 'react';
import { CACHE_CHANGED, clearSnapshot, loadSnapshot, type PackingSnapshot } from '../api/snapshot';
import { useStore } from '../store';

export function PackingCache({ offline = false }: { offline?: boolean }) {
  const store = useStore();
  const [snapshot, setSnapshot] = useState<PackingSnapshot | null | undefined>();
  const [error, setError] = useState('');
  useEffect(() => {
    let revision = 0;
    function refresh() {
      const current = ++revision;
      loadSnapshot().then(value => {
        if (revision === current) { setSnapshot(value); setError(''); }
      }).catch(() => { if (revision === current) setError('浏览器暂时无法读取离线缓存。'); });
    }
    refresh();
    window.addEventListener(CACHE_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      revision++;
      window.removeEventListener(CACHE_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  async function clear() {
    try { await clearSnapshot(); }
    catch { setError('缓存清除失败，请重试。'); }
  }

  const heading = offline ? <h1>离线打包清单</h1> : <h2>离线打包清单</h2>;
  return (
    <section className="card packing-cache">
      {heading}
      <p>{offline ? '离线只读。连接服务后可以编辑。' : '此设备仅缓存当前行程名称、打包物品和勾选状态。'}</p>
      {snapshot && <p>缓存时间 <time dateTime={snapshot.savedAt}>{new Date(snapshot.savedAt).toLocaleString('zh-CN')}</time></p>}
      {offline && snapshot?.trip && <>
        <h2>{snapshot.trip.title}</h2>
        {snapshot.trip.packing.length ? <ul>{snapshot.trip.packing.map((item, index) => (
          <li key={index}><span>{item.text}</span><small>{item.done ? '已装好' : '待装'}</small></li>
        ))}</ul> : <p>这趟行程还没有打包物品。</p>}
      </>}
      {snapshot && !snapshot.trip && <p>上次连接时没有行程。</p>}
      {snapshot === null && <p role="status">本机暂无离线缓存。</p>}
      {error && <p role="alert">{error}</p>}
      {offline && store.writeMessage && <p role="status">{store.writeMessage}</p>}
      <div className="row-actions">
        {offline && <button type="button" className="btn" disabled={store.saving} onClick={() => void store.reconnect()}>{store.saving ? '正在连接…' : '重新连接'}</button>}
        {snapshot && <button type="button" className="btn-ghost" onClick={() => void clear()}>清除离线缓存</button>}
      </div>
    </section>
  );
}
