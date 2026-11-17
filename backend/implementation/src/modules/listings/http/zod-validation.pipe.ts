import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida e transforma o corpo com um esquema zod; `ZodError` vira 400 no filtro de exceções. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
