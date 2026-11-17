import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard.js';
import { SellerId } from '../../../shared/auth/seller-id.decorator.js';
import { ArchiveListing } from '../application/archive-listing.js';
import { CreateListing } from '../application/create-listing.js';
import { EditListing } from '../application/edit-listing.js';
import {
  listingChangesSchema,
  listingContentSchema,
  type ListingChanges,
} from '../application/listing-content.js';
import type { ListingContent } from '../application/listing-repository.js';
import type { ListingSummary } from '../application/listing-summary.js';
import { SubmitListing } from '../application/submit-listing.js';
import {
  CreateListingDto,
  EditListingDto,
  ListingSummaryDto,
} from './listing.dto.js';
import { ListingExceptionFilter } from './listing-exception.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// `:listingId` que não é UUID responde como anúncio inexistente.
const listingIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException(),
});

@ApiTags('listings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
@UseGuards(JwtAuthGuard)
@UseFilters(ListingExceptionFilter)
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly createListing: CreateListing,
    private readonly editListing: EditListing,
    private readonly submitListing: SubmitListing,
    private readonly archiveListing: ArchiveListing,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cria um anúncio (versão 1 em draft)' })
  @ApiBody({ type: CreateListingDto })
  @ApiCreatedResponse({ type: ListingSummaryDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos' })
  create(
    @SellerId() sellerId: string,
    @Body(new ZodValidationPipe(listingContentSchema)) content: ListingContent,
  ): Promise<ListingSummary> {
    return this.createListing.execute(sellerId, content);
  }

  @Patch(':listingId')
  @ApiOperation({
    summary: 'Edita o anúncio',
    description:
      'Altera o rascunho no lugar; para versão publicada ou rejeitada, cria uma nova versão em draft a partir da mais recente.',
  })
  @ApiBody({ type: EditListingDto })
  @ApiOkResponse({ type: ListingSummaryDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos' })
  @ApiNotFoundResponse({
    description: 'Anúncio inexistente ou de outro vendedor',
  })
  @ApiConflictResponse({
    description: 'Versão em revisão, anúncio arquivado ou edição concorrente',
  })
  edit(
    @SellerId() sellerId: string,
    @Param('listingId', listingIdPipe) listingId: string,
    @Body(new ZodValidationPipe(listingChangesSchema)) changes: ListingChanges,
  ): Promise<ListingSummary> {
    return this.editListing.execute(sellerId, listingId, changes);
  }

  @Post(':listingId/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Envia o rascunho para moderação (draft → in_review)',
  })
  @ApiOkResponse({ type: ListingSummaryDto })
  @ApiNotFoundResponse({
    description: 'Anúncio inexistente ou de outro vendedor',
  })
  @ApiConflictResponse({
    description: 'A versão mais recente não é um rascunho',
  })
  submit(
    @SellerId() sellerId: string,
    @Param('listingId', listingIdPipe) listingId: string,
  ): Promise<ListingSummary> {
    return this.submitListing.execute(sellerId, listingId);
  }

  @Post(':listingId/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Arquiva o anúncio inteiro',
    description:
      'Todas as versões não arquivadas vão para archived. Recusado se houver versão em revisão.',
  })
  @ApiOkResponse({ type: ListingSummaryDto })
  @ApiNotFoundResponse({
    description: 'Anúncio inexistente ou de outro vendedor',
  })
  @ApiConflictResponse({
    description: 'Versão em revisão ou anúncio já arquivado',
  })
  archive(
    @SellerId() sellerId: string,
    @Param('listingId', listingIdPipe) listingId: string,
  ): Promise<ListingSummary> {
    return this.archiveListing.execute(sellerId, listingId);
  }
}
