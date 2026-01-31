import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initP2PDownloadListener } from "./lib/p2pDownloadListener";

initP2PDownloadListener();
console.log("[App] Build Version: 2026-01-31.v7");

// TEMPORARILY DISABLED: Unregister ALL service workers to force fresh load
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      console.log('[SW] Unregistering old service worker:', registration.scope);
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
