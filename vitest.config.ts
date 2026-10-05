import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'], env: { APP_SECRET: 'unit-test-secret-that-is-long-enough-0123456789' } },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
