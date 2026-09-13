// 入口：仅做启动。所有平台相关代码在 src/platform/，所有 UI 在 src/ui/，纯逻辑在 src/core/ 与各模块 core.js。
import { startApp } from './ui/app.js';

function boot() {
  const root = document.getElementById('app');
  if (!root) return;
  startApp(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
