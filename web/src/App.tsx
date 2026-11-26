import { BrowserRouter } from 'react-router-dom';
import { Shell } from './components/Shell';
import { StoreProvider, useStore } from './store';
import { PackingCache } from './components/PackingCache';

function ConnectedApp() {
  const store = useStore();
  if (store.offlineViewer) return <main className="offline-page"><PackingCache offline /></main>;
  if (store.source === 'loading') return <main className="offline-page" role="status">正在读取本机记录…</main>;
  return <Shell />;
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ConnectedApp />
      </StoreProvider>
    </BrowserRouter>
  );
}
