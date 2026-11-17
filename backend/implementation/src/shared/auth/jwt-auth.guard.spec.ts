import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js';

const SECRET = 's'.repeat(32);
const jwt = new JwtService({ secret: SECRET });
const guard = new JwtAuthGuard(jwt);

const contextFor = (request: AuthenticatedRequest) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const run = (authorization?: string) => {
  const request: AuthenticatedRequest = { headers: { authorization } };
  return { request, result: guard.canActivate(contextFor(request)) };
};

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JwtAuthGuard', () => {
  it('aceita token válido e expõe o sub como vendedor', async () => {
    const token = await jwt.signAsync({ sub: 'seller-1' });
    const { request, result } = run(`Bearer ${token}`);

    await expect(result).resolves.toBe(true);
    expect(request.sellerId).toBe('seller-1');
  });

  it('recusa requisição sem Authorization', async () => {
    await expect(run().result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa esquema que não é Bearer e token malformado', async () => {
    const token = await jwt.signAsync({ sub: 'seller-1' });
    await expect(run(`Basic ${token}`).result).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(run('Bearer abc').result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa assinatura de outro segredo', async () => {
    const token = await new JwtService({ secret: 'o'.repeat(32) }).signAsync({
      sub: 'seller-1',
    });
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token expirado', async () => {
    const token = await jwt.signAsync({ sub: 'seller-1' }, { expiresIn: -10 });
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa alg none', async () => {
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'seller-1' })}.`;
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa outro algoritmo HMAC mesmo com o segredo correto (HS512)', async () => {
    const head = b64({ alg: 'HS512', typ: 'JWT' });
    const body = b64({ sub: 'seller-1' });
    const signature = createHmac('sha512', SECRET)
      .update(`${head}.${body}`)
      .digest('base64url');
    await expect(
      run(`Bearer ${head}.${body}.${signature}`).result,
    ).rejects.toThrow(UnauthorizedException);
  });

  it('recusa token válido sem sub ou com sub vazio', async () => {
    for (const payload of [{}, { sub: '' }, { sub: 42 }]) {
      const token = await jwt.signAsync(payload);
      await expect(run(`Bearer ${token}`).result).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });
});
