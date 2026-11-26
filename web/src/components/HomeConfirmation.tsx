import { Modal } from './ui';

export interface HomePreview {
  token: string;
  via: string;
  blocked?: string;
  steps: { id: string; label: string; blocked?: string; change?: { on: boolean; paramValue?: string | null }; call?: { service: string; data?: Record<string, number> } }[];
}
export interface HomeResult {
  status: 'done' | 'partial' | 'failed';
  results: { id: string; label: string; action: string; error?: string }[];
  blocked?: string;
}
const verbs: Record<string, string> = { turn_on: '开启', turn_off: '关闭', close_cover: '关闭窗帘', open_cover: '打开窗帘', set_temperature: '设定温度' };
export function HomeConfirmation({ title, preview, result, saving, message, onConfirm, onClose }: {
  title: string; preview: HomePreview; result?: HomeResult; saving: boolean; message: string; onConfirm: () => void; onClose: () => void;
}) {
  return <Modal title={result ? '家居执行结果' : '确认家居动作'} onClose={() => { if (!saving) onClose(); }}>
    <p>{title} · {preview.via === 'local' ? '演示设备' : 'Home Assistant'}</p>
    {result ? <section aria-live="polite"><strong>{{ done: '已完成', partial: '部分完成', failed: '执行失败' }[result.status]}</strong>
      <ul>{result.results.map((r, i) => <li key={i}>{r.label}（{r.id}）· {verbs[r.action] ?? r.action} · {r.error ?? '成功'}</li>)}</ul></section> :
      <ul>{preview.steps.map((s, i) => <li key={i}>{s.label}（{s.id}）· {s.call ? verbs[s.call.service] ?? s.call.service : s.change?.on ? '开启' : '关闭'} {s.call?.data?.temperature != null ? `${s.call.data.temperature}°C` : s.call?.data?.brightness_pct != null ? `${s.call.data.brightness_pct}%` : ''} {s.blocked}</li>)}</ul>}
    {preview.blocked || !preview.steps.length ? <p>{preview.blocked ?? '没有待执行的设备动作'}</p> : null}
    {message && <p role="status">{message}</p>}
    <div className="modal-actions"><button className="btn-ghost" autoFocus disabled={saving} onClick={onClose}>{result ? '关闭' : '取消'}</button>
      {!result && <button className="btn" disabled={saving || !!preview.blocked || !preview.steps.some((s) => !s.blocked)} onClick={onConfirm}>{saving ? '执行中…' : '确认执行'}</button>}</div>
  </Modal>;
}
