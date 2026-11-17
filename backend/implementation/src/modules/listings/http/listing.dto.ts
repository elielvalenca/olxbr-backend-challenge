import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LISTING_CATEGORIES,
  LISTING_LIMITS,
} from '../application/listing-content.js';
import { LISTING_STATUSES } from '../domain/listing-status.js';

/** Classes só para documentar o contrato no Swagger; a validação é do esquema zod. */
export class CreateListingDto {
  @ApiProperty({
    minLength: LISTING_LIMITS.titleMin,
    maxLength: LISTING_LIMITS.titleMax,
    description: 'Espaços nas pontas são removidos antes de validar.',
  })
  title!: string;

  @ApiProperty({ maxLength: LISTING_LIMITS.descriptionMax })
  description!: string;

  @ApiProperty({
    description: 'Preço em centavos (inteiro > 0).',
    example: 150000,
  })
  priceCents!: number;

  @ApiProperty({ enum: LISTING_CATEGORIES })
  category!: string;

  @ApiProperty({
    type: [String],
    minItems: LISTING_LIMITS.imagesMin,
    maxItems: LISTING_LIMITS.imagesMax,
    description: 'URLs https.',
  })
  imageUrls!: string[];
}

export class EditListingDto {
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ example: 150000 }) priceCents?: number;
  @ApiPropertyOptional({ enum: LISTING_CATEGORIES }) category?: string;
  @ApiPropertyOptional({ type: [String] }) imageUrls?: string[];
}

export class ListingSummaryDto {
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: LISTING_STATUSES }) status!: string;
}
