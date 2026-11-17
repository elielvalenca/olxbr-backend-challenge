import { validateEnv } from './env.js';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';
const JWT_SECRET = 'x'.repeat(32);
const base = { DATABASE_URL, JWT_SECRET };

describe('validateEnv', () => {
  it('aplica os valores padrão', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      JWT_SECRET,
    });
  });

  it('converte PORT de string para número', () => {
    expect(validateEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falha no boot com valor inválido', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(
      /Configuração inválida/,
    );
  });

  it('falha no boot sem DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejeita DATABASE_URL que não é de Postgres', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'mysql://u:p@localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('aceita o esquema postgresql://', () => {
    expect(
      validateEnv({ ...base, DATABASE_URL: 'postgresql://u:p@localhost/db' })
        .DATABASE_URL,
    ).toContain('postgresql://');
  });

  it('falha no boot sem JWT_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres', () => {
    expect(() => validateEnv({ DATABASE_URL, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
