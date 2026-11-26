import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Shell } from './components/Shell';
import { StoreProvider, useStore } from './store';
import { PackingCache } from './components/PackingCache';
import { LoginPage } from './pages/Login';

function ConnectedApp() {
  const store = useStore();
  const auth = useAuth();
  if (store.offlineViewer) return <main className="offline-page">
    <PackingCache offline />
    <button type="button" className="btn-ghost" onClick={() => void auth.logout()}>退出登录</button>
  </main>;
  if (store.source === 'loading') return <main className="offline-page" role="status">正在读取本机记录…</main>;
  return <Shell />;
}

function AccountApp() {
  const { session, offlineAccount, checking, refresh } = useAuth();
  if (checking) return <main className="loading-screen" role="status">正在连接本地服务…</main>;
  if (offlineAccount) return <StoreProvider key={`offline:${offlineAccount.hint}`} cacheMemberId={offlineAccount.memberId} cacheSession={offlineAccount.hint} reconnectSession={refresh}>
    <ConnectedApp />
  </StoreProvider>;
  if (session?.demo || session?.member) return <StoreProvider key={session.cacheSession ?? session.member?.id ?? 'demo'} cacheMemberId={session.member?.id ?? null} cacheSession={session.cacheSession} demoMode={session.demo}>
    <ConnectedApp />
  </StoreProvider>;
  return <LoginPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
