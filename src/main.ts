import './style.css';
import { App } from './app';

let app: App;

function initApp() {
  // 再等一帧，确保 DOM 布局完成，ECharts 能拿到正确尺寸
  requestAnimationFrame(() => {
    app = new App(document.querySelector<HTMLDivElement>('#app')!);
    window.addEventListener('resize', () => {
      app.resize();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
