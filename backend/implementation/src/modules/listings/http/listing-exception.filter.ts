import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import {
  InvalidTransitionError,
  ListingNotEditableError,
  ListingNotFoundError,
  ListingVersionConflictError,
} from '../domain/listing-errors.js';

/**
 * Traduz erros de negócio em respostas HTTP. Qualquer outro erro continua
 * com o tratamento padrão do Nest (500 sem detalhe interno).
 */
@Catch(
  ZodError,
  ListingNotFoundError,
  InvalidTransitionError,
  ListingNotEditableError,
  ListingVersionConflictError,
)
export class ListingExceptionFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Dados inválidos',
        errors: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const statusCode =
      error instanceof ListingNotFoundError
        ? HttpStatus.NOT_FOUND
        : HttpStatus.CONFLICT;
    response.status(statusCode).json({ statusCode, message: error.message });
  }
}
