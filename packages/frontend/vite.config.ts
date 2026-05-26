import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

// Vite is the dev server and bundler.
// Tailwind v4 is wired through @tailwindcss/vite — no separate postcss config needed.
// The path alias `@` maps to ./src for cleaner imports.
export default defineConfig({
  plugins: [react(), tailwind()],
  // Load env vars from the monorepo root so a single .env serves backend and frontend.
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Версия пакета доступна в коде как глобал `__APP_VERSION__`. Используем
  // в футере, чтобы один источник правды (package.json) определял отображение.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
