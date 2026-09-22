import { useState } from 'react';
import { useStore } from '../store';
import { SPEND_TAGS, type Budgets } from '../types';
import { Field, PageHead } from '../components/ui';
import { yuan } from '../format';

export function SettingsPage() {
  const store = useStore();
  const [draft, setDraft] = useState<Budgets>(store.budgets);
  const moduleSum = SPEND_TAGS.reduce((sum, tag) => sum + (Number(draft[tag]) || 0), 0);

  function setNumber(key: keyof Budgets, value: string) {
    setDraft((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  }

  return (
    <div className="settings">
      <PageHead title="设置" desc="预算和数据来源先留在这里。账号和主题本期只做占位。" />
      <article className="card">
        <h2>账号</h2>
        <p style={{ marginTop: 8 }}>星宇 · 当前为本地演示，没有登录。</p>
      </article>
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
        <h2>数据接入</h2>
        <div className="toggle-row"><span>账单导入</span><span className="chip">未连接</span></div>
        <div className="toggle-row"><span>智能家居</span><span className="chip">演示数据</span></div>
        <p className="muted">真实账单和设备对接不在这一期。</p>
      </article>
      <article className="card">
        <h2>通知</h2>
        <Notice label="穿搭提醒" name="outfit" />
        <Notice label="预算提醒" name="budget" />
        <Notice label="设备异常" name="device" />
      </article>
      <article className="card">
        <h2>主题</h2>
        <p style={{ marginTop: 8 }}>青绿 · 当前唯一主题</p>
      </article>
    </div>
  );
}

function Notice({ label, name }: { label: string; name: 'outfit' | 'budget' | 'device' }) {
  const store = useStore();
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={store.notices[name]} onChange={(event) => store.setNotice(name, event.target.checked)} />
    </label>
  );
}
