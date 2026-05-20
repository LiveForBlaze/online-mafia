import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

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
  server: {
    port: 5173,
    strictPort: true,
  },
});
