import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initP2PDownloadListener } from "./lib/p2pDownloadListener";

initP2PDownloadListener();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/p2p-sw.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
