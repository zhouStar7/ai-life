import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/Login';
import { StoreProvider, useStore } from './store';

function DataGate() {
  const store = useStore();
  if (!store.dataReady) return <div className="loading-screen" role="status">
    <p>{store.loadError ? '暂时连接不上服务，还没有可显示的缓存。' : '正在加载你的生活记录…'}</p>
    {store.loadError ? <button className="btn" onClick={store.retryConnection}>重试连接</button> : null}
  </div>;
  return <Shell />;
}
function Gate() {
  const auth = useAuth();
  if (!auth.authReady) return <div className="loading-screen" role="status">正在连接…</div>;
  if (!auth.member) return <LoginPage />;
  return <StoreProvider key={auth.member.id}><DataGate /></StoreProvider>;
}
export default function App() {
  return <BrowserRouter><AuthProvider><Gate /></AuthProvider></BrowserRouter>;
}
