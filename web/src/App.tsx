import { BrowserRouter } from 'react-router-dom';
import { Shell } from './components/Shell';
import { StoreProvider } from './store';

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </BrowserRouter>
  );
}
