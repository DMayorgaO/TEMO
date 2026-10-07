import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './pages/App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {(import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_APP_ENV === 'preview' && (
      <div className="preview-banner" style={{ background: '#ffe477', color: '#17272b', padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>
        PRUEBAS LOCALES · Datos de ejemplo · No es producción
      </div>
    )}
    <App />
  </React.StrictMode>,
);
