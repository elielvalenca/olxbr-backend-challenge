/** SQLSTATE do Postgres que os adaptadores traduzem. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Extrai o SQLSTATE de um erro do driver. O Drizzle embrulha o erro original
 * em `cause`, então percorre a cadeia.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
