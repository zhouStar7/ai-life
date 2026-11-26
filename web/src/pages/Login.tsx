import { useState, type FormEvent } from 'react';
import { Field } from '../components/ui';
import { useAuth } from '../auth';

export function LoginPage() {
  const store = useAuth();
  const [username, setUsername] = useState('xingyu');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const message = store.canRegister
      ? await store.register(username, name, password)
      : await store.login(username, password);
    setBusy(false);
    setError(message ?? '');
  }

  return (
    <div className="login-screen">
      <article className="card">
        <div className="login-brand"><span className="seal-mark">生</span><span>AI 生活管家</span></div>
        <h1 className="display" style={{ fontSize: 32 }}>{store.canRegister ? '开启从容生活' : '欢迎回家'}</h1>
        <p className="muted">衣食住行的小事，在这里慢慢理顺。</p>
        <form onSubmit={(event) => { void submit(event); }} style={{ marginTop: 16 }}>
          <div className="form-grid login-fields">
            {store.canRegister ? <Field label="显示名"><input value={name} onChange={(event) => setName(event.target.value)} /></Field> : null}
            <Field label="用户名"><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
            <Field label="密码"><input type="password" autoComplete={store.canRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          </div>
          {error || store.authError ? <p className="note" role="alert">{error || store.authError}</p> : null}
          <div className="modal-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? '请稍等…' : store.canRegister ? '注册并进入' : '进入生活管家'}</button>
          </div>
        </form>
        <p className="login-demo">演示账号 <code>xingyu</code> · 密码 <code>life-local</code></p>
      </article>
    </div>
  );
}
