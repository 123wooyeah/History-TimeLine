import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径，部署到任意子目录都能正常加载资源
  build: {
    outDir: 'dist',
  },
});
