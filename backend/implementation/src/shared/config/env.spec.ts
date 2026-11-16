import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('aplica os valores padrão', () => {
    expect(validateEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('converte PORT de string para número', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('falha no boot com valor inválido', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/Configuração inválida/);
  });
});
