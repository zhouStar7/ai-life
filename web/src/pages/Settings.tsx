import { useState } from 'react';
import { useStore } from '../store';
import { SPEND_TAGS, type Budgets } from '../types';
import { Field } from '../components/ui';
import { yuan } from '../format';

export function SettingsPage() {
  const store = useStore();
  const [draft, setDraft] = useState<Budgets>(store.budgets);
  const [modelDraft, setModelDraft] = useState({ baseUrl: '', model: '', apiKey: '' });
  const modelBase = modelDraft.baseUrl || store.model.baseUrl;
  const modelName = modelDraft.model || store.model.model;
  const moduleSum = SPEND_TAGS.reduce((sum, tag) => sum + (Number(draft[tag]) || 0), 0);

  function setNumber(key: keyof Budgets, value: string) {
    setDraft((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
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
        <form onSubmit={(event) => { event.preventDefault(); store.setBudgets(draft); }} style={{ marginTop: 12 }}>
          <div className="form-grid">
            <Field label="月预算总额"><input type="number" min={0} value={draft.total} onChange={(event) => setNumber('total', event.target.value)} /></Field>
            {SPEND_TAGS.map((tag) => (
              <Field key={tag} label={`${tag}模块预算`}>
                <input type="number" min={0} value={draft[tag]} onChange={(event) => setNumber(tag, event.target.value)} />
              </Field>
            ))}
          </div>
          {moduleSum !== draft.total ? <p className="note" style={{ marginTop: 12 }}>四个模块合计 {yuan(moduleSum)}，月预算是 {yuan(draft.total)}。</p> : null}
          <div className="modal-actions">
            <button type="submit" className="btn" data-testid="save-budget">保存预算</button>
          </div>
        </form>
      </article>
      <article className="card">
        <h2>模型连接</h2>
        <p className="muted">地址留在本机。密钥保存后不会再显示。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            store.setModel({ baseUrl: modelBase, model: modelName, apiKey: modelDraft.apiKey });
          }}
          style={{ marginTop: 12 }}
        >
          <div className="form-grid">
            <Field label="接口地址" wide>
              <input placeholder="http://127.0.0.1:11434/v1" value={modelBase} onChange={(event) => setModelDraft({ ...modelDraft, baseUrl: event.target.value })} />
            </Field>
            <Field label="模型名称">
              <input placeholder="llama3.1" value={modelName} onChange={(event) => setModelDraft({ ...modelDraft, model: event.target.value })} />
            </Field>
            <Field label="API Key">
              <input type="password" autoComplete="off" placeholder={store.model.configured ? '已保存，留空则不改' : '本地模型可以留空'} value={modelDraft.apiKey} onChange={(event) => setModelDraft({ ...modelDraft, apiKey: event.target.value })} />
            </Field>
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn">保存连接</button>
          </div>
        </form>
      </article>
      <article className="card">
        <h2>数据接入</h2>
        <div className="toggle-row"><span>账单导入</span><span className="chip">未连接</span></div>
        <div className="toggle-row"><span>智能家居</span><span className="chip">演示数据</span></div>
        <p className="muted">真实账单和设备对接不在这一期。</p>
      </article>
    </div>
  );
}
