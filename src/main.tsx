/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { useEditorStore } from './store';

// 仅开发环境暴露 store，供浏览器冒烟检查驱动。
// import.meta.env.DEV 在生产构建时为常量 false，整段会被 tree-shaking 掉。
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useEditorStore }).__store = useEditorStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
