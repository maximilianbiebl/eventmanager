import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';
import './styles/modal.css';
import './styles/toolbar.css';
import './styles/notiz.css';
import { leseDarstellung, wendeDarstellungAn } from './utils/darstellung';

// Vor dem ersten Zeichnen setzen, sonst springt die Schrift beim Laden.
wendeDarstellungAn(leseDarstellung());

/*
 * Service Worker beim Start registrieren, nicht erst beim Aktivieren der
 * Benachrichtigungen. Er bringt jetzt auch den Offline-Betrieb mit - wer
 * keine Benachrichtigungen will, soll die App trotzdem ohne Netz oeffnen
 * koennen.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service Worker konnte nicht registriert werden:', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
