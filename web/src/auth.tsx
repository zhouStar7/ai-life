import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, resetApiSession, setUnauthorizedHandler } from './api/client';

type Member = { id: string; username: string; name: string };
type Auth = {
  member: Member | null; authReady: boolean; canRegister: boolean; authError: string;
  login: (username: string, password: string) => Promise<string | null>;
  register: (username: string, name: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
function message(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) return '暂时连接不上服务，请检查连接后重试';
  if (error.status === 408) return '连接超时，请重试';
  if (error.status === 401) return '用户名或密码不对';
  if (error.status === -1) return '请求已取消，请重试';
  return '没有成功，请检查填写内容后重试';
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setUnauthorizedHandler(() => { resetApiSession(); setMember(null); });
    api<{ member: Member }>('/api/auth/session').then(body => {
      if (!cancelled) setMember(body.member);
    }).catch(error => {
      if (cancelled) return;
      if (error instanceof ApiError && error.status === 401) setCanRegister(Boolean(error.detail?.register));
      else setAuthError(message(error));
    }).finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; setUnauthorizedHandler(() => {}); };
  }, []);
  async function authenticate(path: string, input: object) {
    resetApiSession();
    try {
      const body = await api<{ member: Member }>(path, { method: 'POST', body: JSON.stringify(input) });
      setAuthError(''); setCanRegister(false); setMember(body.member);
      return null;
    } catch (error) { return message(error); }
  }
  return <Context.Provider value={{ member, authReady, canRegister, authError,
    login: (username, password) => authenticate('/api/auth/login', { username, password }),
    register: (username, name, password) => authenticate('/api/auth/register', { username, name, password }),
    logout: async () => {
      resetApiSession();
      // Finish the cookie change before accepting another login.
      try { await api('/api/auth/logout', { method: 'POST' }); }
      finally { setMember(null); }
    },
  }}>{children}</Context.Provider>;
}
// The hook intentionally lives beside its provider; this module is the complete auth boundary.
// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider missing');
  return auth;
}
