import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Field } from '../components/ui';

export function LoginPage() {
  const auth = useAuth();
  const needsSetup = auth.session?.needsSetup ?? false;
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const message = needsSetup
      ? await auth.register(username, name, password)
      : await auth.login(username, password);
    setBusy(false);
    setError(message ?? '');
  }

  async function reconnect() {
    setBusy(true);
    setError('');
    await auth.refresh();
    setBusy(false);
  }

  return (
    <main className="login-screen">
      <article className="card">
        <div className="login-brand"><span className="seal-mark" aria-hidden="true">生</span><span>AI 生活管家</span></div>
        <h1 className="display">{needsSetup ? '创建首个账号' : '登录'}</h1>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid login-fields">
            {needsSetup && <Field label="显示名"><input autoComplete="name" value={name} maxLength={20} required onChange={(event) => setName(event.target.value)} /></Field>}
            <Field label="用户名"><input autoComplete="username" autoCapitalize="none" value={username} maxLength={32} required onChange={(event) => setUsername(event.target.value)} /></Field>
            <Field label="密码"><input type="password" autoComplete={needsSetup ? 'new-password' : 'current-password'} value={password} minLength={needsSetup ? 6 : undefined} maxLength={72} required onChange={(event) => setPassword(event.target.value)} /></Field>
          </div>
          {(error || auth.error) && <p className="note" role="alert">{error || auth.error}</p>}
          <div className="modal-actions">
            {auth.error && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void reconnect()}>重新连接</button>}
            <button className="btn" type="submit" disabled={busy}>{busy ? '请稍等…' : needsSetup ? '注册并进入' : '登录'}</button>
          </div>
        </form>
      </article>
    </main>
  );
}
