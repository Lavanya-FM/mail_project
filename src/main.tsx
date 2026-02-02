import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initP2PDownloadListener } from "./lib/p2pDownloadListener";

initP2PDownloadListener();
console.log("[App] Build Version: 2026-02-02.v27");

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
