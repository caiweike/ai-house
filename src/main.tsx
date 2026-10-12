import React from 'react';
import ReactDOM from 'react-dom/client';
import Home, { HouseErrorBoundary } from './App.tsx';
import './index.css';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HouseErrorBoundary><ConvexClientProvider>
      <Home />
    </ConvexClientProvider></HouseErrorBoundary>
  </React.StrictMode>,
);
