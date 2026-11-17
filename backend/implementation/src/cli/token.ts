import { JwtService } from '@nestjs/jwt';
import { validateEnv } from '../shared/config/env.js';

const USAGE = 'Uso: pnpm auth:token <sellerId> [--expires-in 24h]';

/** Emite um JWT HS256 para o vendedor informado (não há cadastro de usuário). */
async function main(args: string[]): Promise<void> {
  const [sellerId, flag, expiresIn = '24h'] = args;
  if (
    !sellerId ||
    sellerId.startsWith('--') ||
    (flag && flag !== '--expires-in')
  ) {
    throw new Error(USAGE);
  }
  const { JWT_SECRET } = validateEnv(process.env);
  const token = await new JwtService({ secret: JWT_SECRET }).signAsync(
    { sub: sellerId },
    { algorithm: 'HS256', expiresIn: expiresIn as never },
  );
  console.log(token);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
