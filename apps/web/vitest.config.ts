import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Отдельный конфиг без PWA-плагина. Логика таймера и ввода — чистые функции, поэтому окружение node.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'] },
});
