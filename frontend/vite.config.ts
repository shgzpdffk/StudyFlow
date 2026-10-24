import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Префикс /api существует только на фронтенде. Vite убирает его перед FastAPI.
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') } };
  return { plugins: [react()], server: { port: 5173, strictPort: true, proxy }, preview: { proxy } };
});
