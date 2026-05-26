// Build-time globals injected via Vite's `define`. See vite.config.ts.

// Версия фронтенд-пакета, читается из packages/frontend/package.json при
// сборке. Используется в футере как vN.N.N-alpha.
declare const __APP_VERSION__: string;
