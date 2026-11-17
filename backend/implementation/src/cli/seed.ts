import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { validateEnv } from '../shared/config/env.js';
import { toListingContent, type SeedAd } from './seed-ads.js';

const USAGE = 'Uso: pnpm seed [--force]  (a API precisa estar rodando)';
const SEED_SELLER = 'seed-seller';

/**
 * Cria cada anúncio do seed como `draft` e o envia para revisão pela API,
 * exercitando o fluxo real (outbox → fila → moderação). Recusa rodar se já
 * houver anúncios publicados, para não duplicar; `--force` ignora a checagem.
 */
async function main(args: string[]): Promise<void> {
  const force = args.includes('--force');
  if (args.some((a) => a !== '--force')) throw new Error(USAGE);

  const env = validateEnv(process.env);
  const apiUrl = process.env.API_URL ?? `http://localhost:${env.PORT}`;
  const seedFile = resolve(
    process.env.SEED_FILE ??
      resolve(import.meta.dirname, '../../../api-mock/seed/ads.json'),
  );
  const { ads } = JSON.parse(await readFile(seedFile, 'utf8')) as {
    ads: SeedAd[];
  };
  const token = await new JwtService({ secret: env.JWT_SECRET }).signAsync(
    { sub: SEED_SELLER },
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  if (!force) {
    const page = (await (await call('/listings?limit=1')).json()) as {
      total: number;
    };
    if (page.total > 0) {
      throw new Error(
        `Já existem ${page.total} anúncios publicados; use --force para semear mesmo assim.`,
      );
    }
  }

  let sent = 0;
  for (const ad of ads) {
    const created = await call('/listings', {
      method: 'POST',
      body: JSON.stringify(toListingContent(ad)),
    });
    if (!created.ok) {
      throw new Error(`Falha ao criar "${ad.title}": ${created.status}`);
    }
    const { listingId } = (await created.json()) as { listingId: string };
    const submitted = await call(`/listings/${listingId}/submit`, {
      method: 'POST',
    });
    if (!submitted.ok) {
      throw new Error(`Falha ao enviar "${ad.title}": ${submitted.status}`);
    }
    sent++;
  }
  console.log(
    `${sent} anúncios enviados para moderação; acompanhe no painel da fila (Grafana) ou em GET /listings.`,
  );
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
