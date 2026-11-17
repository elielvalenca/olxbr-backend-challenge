import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  sellerId?: string;
}

/**
 * Exige `Authorization: Bearer <jwt>` assinado com HS256 e guarda o `sub`
 * (o vendedor) na requisição. Qualquer falha vira 401 sem detalhe.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    try {
      // Algoritmo fixo: bloqueia `alg: none` e troca para outro algoritmo.
      const { sub } = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: ['HS256'],
      });
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new UnauthorizedException();
      }
      request.sellerId = sub;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
