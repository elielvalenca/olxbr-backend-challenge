import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Env } from '../../../shared/config/env.js';
import { GetPublicListing } from '../application/get-public-listing.js';
import {
  ListPublishedListings,
  listingQuerySchema,
} from '../application/list-published-listings.js';
import { LISTING_CATEGORIES } from '../application/listing-content.js';
import type {
  ListingDetail,
  ListingPage,
} from '../application/listing-queries.js';
import { ListingDetailDto, ListingPageDto } from './listing.dto.js';
import { ListingExceptionFilter } from './listing-exception.filter.js';

// `:listingId` que não é UUID responde como anúncio inexistente.
const listingIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException(),
});

/** Leitura pública: sem autenticação, só anúncios publicados. */
@ApiTags('listings')
@UseFilters(ListingExceptionFilter)
@Controller('listings')
export class ListingQueriesController {
  private readonly querySchema: ReturnType<typeof listingQuerySchema>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly listPublished: ListPublishedListings,
    private readonly getPublicListing: GetPublicListing,
  ) {
    this.querySchema = listingQuerySchema({
      defaultLimit: config.get('LISTINGS_DEFAULT_PAGE_SIZE', { infer: true }),
      maxLimit: config.get('LISTINGS_MAX_PAGE_SIZE', { infer: true }),
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Lista anúncios publicados',
    description: 'Mais recentes primeiro. Pública.',
  })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Padrão e máximo vêm da configuração.',
  })
  @ApiQuery({ name: 'category', required: false, enum: LISTING_CATEGORIES })
  @ApiOkResponse({ type: ListingPageDto })
  @ApiBadRequestResponse({ description: 'Parâmetros inválidos' })
  list(@Query() query: Record<string, unknown>): Promise<ListingPage> {
    return this.listPublished.execute(this.querySchema.parse(query));
  }

  @Get(':listingId')
  @ApiOperation({
    summary: 'Detalhe público do anúncio',
    description:
      'Só a versão publicada. Sem versão publicada responde 404. Ignora `Authorization`; o dono usa `/me/listings/{listingId}`.',
  })
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiNotFoundResponse({ description: 'Anúncio sem versão publicada' })
  detail(
    @Param('listingId', listingIdPipe) listingId: string,
  ): Promise<ListingDetail> {
    return this.getPublicListing.execute(listingId);
  }
}
