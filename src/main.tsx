import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// initP2PDownloadListener removed in favor of P2PReceiverHandler
console.log('Build Version: 2026-02-11.v267-THREADING-DEPLOY');

// TEMPORARILY DISABLED: Unregister ALL service workers to force fresh load
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
