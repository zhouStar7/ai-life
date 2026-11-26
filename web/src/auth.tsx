import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, resetApiSession, setUnauthorizedHandler } from './api/client';
import { clearSnapshot, demoMode, readSessionHint } from './api/snapshot';

type Member = { id: string; username: string; name: string; isOwner: boolean };
type Session = { demo: boolean; member: Member | null; needsSetup: boolean; cacheSession?: string };
type OfflineAccount = { memberId: string; hint: string };
type AuthState = {
  session: Session;
  offlineAccount: OfflineAccount | null;
  checking: boolean;
  error: string;
};
type Auth = AuthState & {
  refresh: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<string | null>;
  register: (username: string, name: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};
const ACTIVE_ACCOUNT = 'ai-life-active-account';
const SIGNED_OUT = 'ai-life-signed-out';
const AuthContext = createContext<Auth | null>(null);

function stored(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function updateStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* Browsers can block persistent storage. */ }
}

function accountForOffline(): OfflineAccount | null {
  try {
    const account = JSON.parse(stored(ACTIVE_ACCOUNT) ?? 'null');
    return typeof account?.memberId === 'string' && typeof account.hint === 'string' && account.hint === readSessionHint() ? account : null;
  } catch { return null; }
}

function anonymous(needsSetup = false, error = ''): AuthState {
  return { session: { demo: false, member: null, needsSetup }, offlineAccount: null, checking: false, error };
}

function requestError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '用户名或密码不对';
    if (error.status === 429) return '登录请求较多，请稍后重试';
    if (error.status === 408) return '连接超时，请重试';
    if (error.status === 403) return '操作未获允许，请刷新页面或使用 HTTPS 连接';
    if (error.status < 500) return '请核对填写内容后重试';
  }
  return '无法连接本地服务，请检查连接后重试';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...anonymous(), checking: true });
  const revision = useRef(0);
  const browserHint = useRef<string | null>(null);

  const acceptSession = useCallback((session: Session) => {
    resetApiSession(session.cacheSession);
    browserHint.current = readSessionHint();
    if (session.member && session.cacheSession === browserHint.current) {
      updateStored(ACTIVE_ACCOUNT, JSON.stringify({ memberId: session.member.id, hint: session.cacheSession }));
    }
    setState({ session, offlineAccount: null, checking: false, error: '' });
  }, []);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    const signOut = stored(SIGNED_OUT);
    if (signOut) {
      try {
        await api('/api/auth/logout', { method: 'POST', headers: signOut === '1' ? undefined : { 'x-account-session': signOut } });
        if (stored(SIGNED_OUT) === signOut) updateStored(SIGNED_OUT, null);
      } catch { /* Keep the local sign-out in force while the server cannot be reached. */ }
      if (current === revision.current) setState(anonymous());
      return false;
    }
    try {
      const session = await api<Session>('/api/auth/session');
      if (current !== revision.current) return false;
      if (session.demo !== true && !session.member) throw new Error('服务未返回账号状态');
      acceptSession(session);
      return true;
    } catch (error) {
      if (current !== revision.current) return false;
      if (error instanceof ApiError && error.status === 401) {
        resetApiSession();
        updateStored(ACTIVE_ACCOUNT, null);
        setState(anonymous(error.needsSetup));
      } else if (demoMode) {
        acceptSession({ demo: true, member: null, needsSetup: false });
      } else {
        const offlineAccount = accountForOffline();
        browserHint.current = readSessionHint();
        setState({ ...anonymous(false, requestError(error)), offlineAccount });
      }
      return false;
    }
  }, [acceptSession]);

  useEffect(() => {
    let disposed = false;
    function resync() {
      resetApiSession();
      if (stored(SIGNED_OUT)) {
        revision.current++;
        setState(anonymous());
        return;
      }
      setState({ ...anonymous(), checking: true });
      void refresh();
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === ACTIVE_ACCOUNT || event.key === SIGNED_OUT || event.key === null) resync();
    }
    function handleFocus() {
      if (browserHint.current !== readSessionHint()) resync();
    }
    setUnauthorizedHandler(() => {
      if (browserHint.current === readSessionHint()) updateStored(ACTIVE_ACCOUNT, null);
      resync();
    });
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    void Promise.resolve().then(() => { if (!disposed) void refresh(); });
    return () => {
      disposed = true;
      resetApiSession();
      setUnauthorizedHandler();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  async function authenticate(path: string, input: object) {
    const current = ++revision.current;
    resetApiSession();
    try {
      const session = await api<Session>(path, { method: 'POST', body: JSON.stringify(input) });
      if (current !== revision.current) return null;
      updateStored(SIGNED_OUT, null);
      acceptSession(session);
      return null;
    } catch (error) {
      if (path.endsWith('/register') && error instanceof ApiError && error.status === 403) void refresh();
      return requestError(error);
    }
  }

  async function logout() {
    const memberId = state.session.member?.id ?? state.offlineAccount?.memberId;
    if (!memberId) return;
    const hint = state.session.cacheSession ?? state.offlineAccount?.hint;
    const cookieHint = readSessionHint();
    resetApiSession();
    if (hint && cookieHint && hint !== cookieHint) {
      setState({ ...anonymous(), checking: true });
      await refresh();
      return;
    }
    const current = ++revision.current;
    const signOut = hint ?? '1';
    updateStored(SIGNED_OUT, signOut);
    updateStored(ACTIVE_ACCOUNT, null);
    document.cookie = 'ailife-context=; Path=/; Max-Age=0; SameSite=Lax';
    browserHint.current = null;
    setState({ ...anonymous(), checking: true });
    await Promise.allSettled([
      clearSnapshot(memberId),
      api('/api/auth/logout', { method: 'POST', headers: hint ? { 'x-account-session': hint } : undefined }).then(() => {
        if (stored(SIGNED_OUT) === signOut) updateStored(SIGNED_OUT, null);
      }),
    ]);
    if (current === revision.current) setState(anonymous());
  }

  return <AuthContext.Provider value={{
    ...state, refresh, logout,
    login: (username, password) => authenticate('/api/auth/login', { username, password }),
    register: (username, name, password) => authenticate('/api/auth/register', { username, name, password }),
  }}>{children}</AuthContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider missing');
  return auth;
}
