import { defineConfig } from 'vitest/config';

// Testes de integração: Postgres real via Testcontainers (exige Docker).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.int-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // um container por arquivo; arquivos em sequência para não disputar o Docker
    fileParallelism: false,
  },
});
