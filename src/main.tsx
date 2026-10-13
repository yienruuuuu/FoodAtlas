import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features.css';
import './runner-game.css';
import './home-floating.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if ('serviceWorker' in navigator) window.addEventListener('load', () => {
  navigator.serviceWorker.register('/sw.js').then(registration => {
    const check = () => { if (navigator.onLine && document.visibilityState === 'visible') void registration.update().catch(() => undefined); };
    window.addEventListener('online', check); document.addEventListener('visibilitychange', check);
    check();
  }).catch(() => undefined);
});
