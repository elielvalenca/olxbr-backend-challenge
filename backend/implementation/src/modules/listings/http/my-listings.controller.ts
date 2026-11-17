import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard.js';
import { SellerId } from '../../../shared/auth/seller-id.decorator.js';
import { GetOwnListing } from '../application/get-own-listing.js';
import type { OwnListingDetail } from '../application/listing-queries.js';
import { OwnListingDetailDto } from './listing.dto.js';
import { ListingExceptionFilter } from './listing-exception.filter.js';

const listingIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException(),
});

/** Leitura do dono, autenticada. */
@ApiTags('listings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou inválido' })
@UseGuards(JwtAuthGuard)
@UseFilters(ListingExceptionFilter)
@Controller('me/listings')
export class MyListingsController {
  constructor(private readonly getOwnListing: GetOwnListing) {}

  @Get(':listingId')
  @ApiOperation({
    summary: 'Detalhe do anúncio para o dono',
    description:
      'Versão mais recente em qualquer status, com `rejectionReason` quando reprovada.',
  })
  @ApiOkResponse({ type: OwnListingDetailDto })
  @ApiNotFoundResponse({
    description: 'Anúncio inexistente ou de outro vendedor',
  })
  detail(
    @SellerId() sellerId: string,
    @Param('listingId', listingIdPipe) listingId: string,
  ): Promise<OwnListingDetail> {
    return this.getOwnListing.execute(sellerId, listingId);
  }
}
