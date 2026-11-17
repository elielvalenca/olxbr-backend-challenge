import { validateEnv } from './env.js';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';

describe('validateEnv', () => {
  it('aplica os valores padrão', () => {
    expect(validateEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('converte PORT de string para número', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falha no boot com valor inválido', () => {
    expect(() => validateEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(
      /Configuração inválida/,
    );
  });

  it('falha no boot sem DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejeita DATABASE_URL que não é de Postgres', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'mysql://u:p@localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('aceita o esquema postgresql://', () => {
    expect(
      validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost/db' })
        .DATABASE_URL,
    ).toContain('postgresql://');
  });
});
