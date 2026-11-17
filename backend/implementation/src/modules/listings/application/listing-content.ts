import { z } from 'zod';
import type { ListingContent } from './listing-repository.js';

export const LISTING_CATEGORIES = [
  'eletronicos',
  'moveis',
  'veiculos',
  'imoveis',
  'esportes',
  'colecionaveis',
] as const;

/** Limites de negócio ajustáveis aqui, sem migration (o banco não os conhece). */
export const LISTING_LIMITS = {
  titleMin: 10,
  titleMax: 100,
  descriptionMax: 5000,
  imagesMin: 1,
  imagesMax: 10,
} as const;

const httpsUrl = z
  .url()
  .refine(
    (value) => URL.canParse(value) && new URL(value).protocol === 'https:',
    {
      message: 'A URL deve usar https',
    },
  );

export const listingContentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LISTING_LIMITS.titleMin)
    .max(LISTING_LIMITS.titleMax),
  description: z.string().trim().min(1).max(LISTING_LIMITS.descriptionMax),
  priceCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  category: z.enum(LISTING_CATEGORIES),
  imageUrls: z
    .array(httpsUrl)
    .min(LISTING_LIMITS.imagesMin)
    .max(LISTING_LIMITS.imagesMax),
});

/** Edição: qualquer subconjunto dos campos, mas ao menos um. */
export const listingChangesSchema = listingContentSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Informe ao menos um campo',
  });

export type ListingChanges = z.infer<typeof listingChangesSchema>;

/**
 * Aplica as alterações ao conteúdo atual e valida o resultado inteiro com as
 * mesmas regras da criação.
 * @throws ZodError se o conteúdo resultante for inválido.
 */
export function mergeContent(
  current: ListingContent,
  changes: ListingChanges,
): ListingContent {
  return listingContentSchema.parse({ ...current, ...changes });
}
