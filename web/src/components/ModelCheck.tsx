import { useState } from 'react';
import { api, errorDetail } from '../api/client';
import { Field } from './ui';
import { modelDestination } from '../../../shared/modelEndpoint';

type Connection = { baseUrl: string; apiKey: string; model: string };

function request<T>(connection: Connection, capability: 'list' | 'text' | 'image') {
  return api<T>('/api/model/check', { method: 'POST', body: JSON.stringify({ ...connection, capability }) });
}

export function ModelCheck({ connection, onModel }: { connection: Connection; onModel: (name: string) => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  async function discover() {
    setLoading(true);
    setModels([]);
    setStatus('正在读取模型列表…');
    try {
      const result = await request<{ models: string[] }>(connection, 'list');
      setModels(result.models);
      setStatus(result.models.length ? `发现 ${result.models.length} 个模型` : '列表为空，可手动填写模型名称');
    } catch (error) { setStatus(errorDetail(error)); }
    finally { setLoading(false); }
  }
  return <>
    <p className="muted">测试目的地：{modelDestination(connection.baseUrl)}。文字测试发送固定短句，图片测试发送生成的色块。</p>
    <div className="row-actions">
      <button type="button" className="btn-ghost" disabled={loading || !connection.baseUrl.trim()} onClick={discover}>获取模型列表</button>
      <span role="status">{status}</span>
    </div>
    {models.length > 0 && <Field label="可用模型"><select value={models.includes(connection.model) ? connection.model : ''} onChange={event => onModel(event.target.value)}>
      <option value="" disabled>选择模型</option>
      {models.map(name => <option key={name} value={name}>{name}</option>)}
    </select></Field>}
    <Probe key={`text-${connection.model}`} connection={connection} capability="text" />
    <Probe key={`image-${connection.model}`} connection={connection} capability="image" />
  </>;
}

function Probe({ connection, capability }: { connection: Connection; capability: 'text' | 'image' }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const label = capability === 'text' ? '文字' : '图片';
  async function run() {
    setBusy(true);
    setMessage('正在测试…');
    try {
      await request(connection, capability);
      setMessage(`${connection.model} 通过${label}测试`);
    } catch (error) { setMessage(`${label}测试失败：${errorDetail(error)}`); }
    finally { setBusy(false); }
  }
  return <div className="row-actions">
    <button type="button" className="btn-ghost" disabled={busy || !connection.baseUrl.trim() || !connection.model.trim()} onClick={run}>测试{label}能力</button>
    <span role="status">{message}</span>
  </div>;
}
