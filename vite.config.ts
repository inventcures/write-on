import { defineConfig } from 'vite';

export default defineConfig({
  test: { include: ['tests/core/**/*.test.ts'], environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
