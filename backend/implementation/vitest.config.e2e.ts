import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // o e2e do /health não fala com o banco, mas o boot valida a config
    env: {
      DATABASE_URL: 'postgres://listings:listings@localhost:5432/listings',
      JWT_SECRET: 'e2e-secret-com-mais-de-32-caracteres-abc',
    },
  },
});
