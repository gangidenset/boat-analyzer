import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ホーム画面に追加したときのオフライン表示用（本番ビルドのみ。開発中はキャッシュの混乱を避ける）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 登録できなくてもアプリは通常どおり動作する
    });
  });
}
