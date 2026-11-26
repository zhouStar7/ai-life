import { useState } from 'react';
import { useStore } from '../store';
import { SPEND_TAGS, type Budgets } from '../types';
import { Field } from '../components/ui';
import { localOllamaBase } from '../../../shared/modelEndpoint';
import { ModelCheck } from '../components/ModelCheck';
import { PackingCache } from '../components/PackingCache';
import { WeatherSettings } from '../components/WeatherSettings';
import { yuan } from '../format';

export function SettingsPage() {
  const store = useStore();
  const [budgetEdits, setBudgetEdits] = useState<Partial<Budgets>>({});
  const draft = { ...store.budgets, ...budgetEdits };
  const [modelDraft, setModelDraft] = useState<{ baseUrl?: string; model?: string; apiKey: string }>({ apiKey: '' });
  const [testDevice, setTestDevice] = useState('');
  const [credentialRevision, setCredentialRevision] = useState(0);
  const [homeDraft, setHomeDraft] = useState<{ baseUrl?: string; token: string }>({ token: '' });
  const modelBase = modelDraft.baseUrl ?? (store.model.baseUrl || localOllamaBase);
  const modelName = modelDraft.model ?? store.model.model;
  const moduleSum = SPEND_TAGS.reduce((sum, tag) => sum + (Number(draft[tag]) || 0), 0);

  function setNumber(key: keyof Budgets, value: string) {
    setBudgetEdits((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  }

  return (
    <div className="settings">
      <header className="page-head">
        <div>
          <h1 className="display" style={{ fontSize: 32 }}>设置</h1>
          <p className="muted">预算和数据来源留在这里。</p>
        </div>
      </header>
      <article className="card">
        <h2>月预算</h2>
        <p className="muted">支出统计和各模块预算条会读这里的数字。</p>
        <form onSubmit={async (event) => { event.preventDefault(); if (await store.setBudgets(draft)) setBudgetEdits({}); }} style={{ marginTop: 12 }}>
          <div className="form-grid">
            <Field label="月预算总额"><input type="number" step="0.01" min={0} value={draft.total} onChange={(event) => setNumber('total', event.target.value)} /></Field>
            {SPEND_TAGS.map((tag) => (
              <Field key={tag} label={`${tag}模块预算`}>
                <input type="number" step="0.01" min={0} value={draft[tag]} onChange={(event) => setNumber(tag, event.target.value)} />
              </Field>
            ))}
          </div>
          {Math.round(100 * moduleSum) !== Math.round(100 * draft.total) ? <p className="note" style={{ marginTop: 12 }}>四个模块合计 {yuan(moduleSum)}，月预算是 {yuan(draft.total)}。</p> : null}
          <div className="modal-actions">
            <button type="submit" disabled={store.saving} className="btn" data-testid="save-budget">保存预算</button>
          </div>
        </form>
      </article>
      <PackingCache />
      <WeatherSettings />
      <article className="card">
        <h2>模型连接</h2>
        <p className="muted">地址留在本机。密钥保存后不会再显示。</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await store.setModel({ baseUrl: modelBase, model: modelName, apiKey: modelDraft.apiKey })) setModelDraft({ apiKey: '' });
          }}
          style={{ marginTop: 12 }}
        >
          <div className="form-grid">
            <Field label="接口地址" wide>
              <input placeholder="http://127.0.0.1:11434/v1" value={modelBase} onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value, apiKey: '' })} />
            </Field>
            <Field label="模型名称">
              <input placeholder="llama3.1" value={modelName} onChange={(event) => setModelDraft({ ...modelDraft, model: event.target.value })} />
            </Field>
            <Field label="API Key">
              <input type="password" autoComplete="off" placeholder={store.model.configured && modelBase === store.model.baseUrl ? '留空沿用此地址的凭据' : '本地模型可以留空'} value={modelDraft.apiKey} onChange={(event) => { setCredentialRevision(n => n + 1); setModelDraft({ ...modelDraft, apiKey: event.target.value }); }} />
            </Field>
          </div>
          <ModelCheck key={`${credentialRevision}-${modelBase}`} connection={{ baseUrl: modelBase, apiKey: modelDraft.apiKey, model: modelName }} onModel={model => setModelDraft({ ...modelDraft, model })} />
          <div className="modal-actions">
            <button type="submit" disabled={store.saving} className="btn">保存连接</button>
          </div>
        </form>
      </article>
      <article className="card">
        <h2>数据接入</h2>
        <div className="toggle-row"><span>账单导入</span><span className="chip">CSV / 截图</span></div>
        <div className="toggle-row"><span>智能家居</span><span className="chip">{store.home.connected ? '已连接' : '未连接'}</span></div>
        <p className="muted">同步读取设备清单。选择测试设备后可预览动作。令牌保存在本机服务中。</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await store.setHome({ baseUrl: homeDraft.baseUrl ?? store.home.baseUrl, token: homeDraft.token })) setHomeDraft({ token: '' });
          }}
          style={{ marginTop: 12 }}
        >
          <div className="form-grid">
            <Field label="Home Assistant 地址" wide>
              <input value={homeDraft.baseUrl ?? store.home.baseUrl} onChange={(event) => setHomeDraft({ ...homeDraft, baseUrl: event.target.value })} />
            </Field>
            <Field label="长期令牌" wide>
              <input type="password" autoComplete="off" placeholder={store.home.configured ? '已保存，留空则不改' : '只保存在服务端'} value={homeDraft.token} onChange={(event) => setHomeDraft({ ...homeDraft, token: event.target.value })} />
            </Field>
          </div>
          <div className="modal-actions">
            <button type="submit" disabled={store.saving} className="btn">保存家居</button>
            <button type="button" className="btn-ghost" onClick={() => { void store.syncHome(); }}>同步并检查连接</button>
          </div>
        </form>
        {store.home.connected && <div className="row-actions"><label>测试设备 <select value={testDevice} onChange={(e) => setTestDevice(e.target.value)}>
          <option value="">选择设备</option>{store.devices.map((d) => <option key={d.id} value={d.id} disabled={d.offline}>{d.name}（{d.id}）{d.offline ? ' · 离线' : ''}</option>)}
        </select></label><button className="btn-ghost" disabled={!store.devices.some((d) => d.id === testDevice && !d.offline) || store.saving} onClick={() => store.toggleDevice(testDevice)}>预览测试动作</button></div>}
      </article>
    </div>
  );
}
