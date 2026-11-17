import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../../../shared/database/database.js';
import {
  PG_UNIQUE_VIOLATION,
  postgresErrorCode,
} from '../../../shared/database/pg-errors.js';
import { SYSTEM_ACTOR, type Actor } from '../domain/actor.js';
import {
  ListingVersionConflictError,
  ListingVersionNotFoundError,
} from '../domain/listing-errors.js';
import type { ListingStatus } from '../domain/listing-status.js';
import type {
  LatestVersion,
  ListingContent,
  ListingRepository,
  TransitionDetails,
  VersionRef,
} from '../application/listing-repository.js';
import { listingAuditEvents, listingImages, listings } from './schema.js';

const actorId = (actor: Actor): string =>
  actor.type === 'seller' ? actor.sellerId : 'system';

const imagesOf = (ref: VersionRef) =>
  and(
    eq(listingImages.listingId, ref.listingId),
    eq(listingImages.version, ref.version),
  );

const versionIs = (ref: VersionRef) =>
  and(eq(listings.listingId, ref.listingId), eq(listings.version, ref.version));

@Injectable()
export class DrizzleListingRepository implements ListingRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: Outbox<Transaction>,
  ) {}

  createFirstVersion(input: {
    sellerId: string;
    content: ListingContent;
    actor: Actor;
  }): Promise<VersionRef> {
    const { sellerId, content, actor } = input;
    const ref: VersionRef = { listingId: randomUUID(), version: 1 };
    return this.atomically(ref.listingId, async (tx) => {
      await tx.insert(listings).values({
        ...ref,
        sellerId,
        title: content.title,
        description: content.description,
        priceCents: content.priceCents,
        category: content.category,
        status: 'draft',
      });
      await this.insertImages(tx, ref, content.imageUrls);
      await this.recordEvent(tx, ref, null, 'draft', { actor });
      return ref;
    });
  }

  async findLatest(listingId: string): Promise<LatestVersion | null> {
    const [row] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.listingId, listingId))
      .orderBy(desc(listings.version))
      .limit(1);
    if (!row) return null;
    return this.toLatestVersion({ listingId, version: row.version }, row);
  }

  async findVersion(ref: VersionRef): Promise<LatestVersion | null> {
    const [row] = await this.db.select().from(listings).where(versionIs(ref));
    return row ? this.toLatestVersion(ref, row) : null;
  }

  private async toLatestVersion(
    ref: VersionRef,
    row: typeof listings.$inferSelect,
  ): Promise<LatestVersion> {
    const images = await this.db
      .select({ url: listingImages.url })
      .from(listingImages)
      .where(imagesOf(ref))
      .orderBy(asc(listingImages.position));
    return {
      ref,
      sellerId: row.sellerId,
      status: row.status,
      content: {
        title: row.title,
        description: row.description,
        priceCents: row.priceCents,
        category: row.category,
        imageUrls: images.map((i) => i.url),
      },
    };
  }

  createNextVersion(
    from: VersionRef,
    actor: Actor,
    content?: ListingContent,
  ): Promise<VersionRef> {
    return this.atomically(from.listingId, async (tx) => {
      const [source] = await tx.select().from(listings).where(versionIs(from));
      if (!source) {
        throw new ListingVersionNotFoundError(from.listingId, from.version);
      }
      const [latest] = await tx
        .select({ version: sql<number>`max(${listings.version})::int` })
        .from(listings)
        .where(eq(listings.listingId, from.listingId));
      const next: VersionRef = {
        listingId: from.listingId,
        version: (latest?.version ?? from.version) + 1,
      };

      await tx.insert(listings).values({
        ...next,
        sellerId: source.sellerId,
        title: content?.title ?? source.title,
        description: content?.description ?? source.description,
        priceCents: content?.priceCents ?? source.priceCents,
        category: content?.category ?? source.category,
        status: 'draft',
      });
      if (content) {
        await this.insertImages(tx, next, content.imageUrls);
        await this.recordEvent(tx, next, null, 'draft', { actor });
        return next;
      }
      await tx.insert(listingImages).select(
        tx
          .select({
            listingId: sql<string>`${next.listingId}::uuid`.as('listing_id'),
            version: sql<number>`${next.version}::int`.as('version'),
            position: listingImages.position,
            url: listingImages.url,
          })
          .from(listingImages)
          .where(
            and(
              eq(listingImages.listingId, from.listingId),
              eq(listingImages.version, from.version),
            ),
          ),
      );
      await this.recordEvent(tx, next, null, 'draft', { actor });
      return next;
    });
  }

  updateDraft(ref: VersionRef, content: ListingContent): Promise<void> {
    return this.atomically(ref.listingId, async (tx) => {
      const [current] = await tx
        .select({ status: listings.status })
        .from(listings)
        .where(versionIs(ref))
        .for('update');
      if (!current) {
        throw new ListingVersionNotFoundError(ref.listingId, ref.version);
      }
      if (current.status !== 'draft') {
        throw new ListingVersionConflictError(ref.listingId);
      }
      await tx
        .update(listings)
        .set({
          title: content.title,
          description: content.description,
          priceCents: content.priceCents,
          category: content.category,
          updatedAt: new Date(),
        })
        .where(versionIs(ref));
      await tx.delete(listingImages).where(imagesOf(ref));
      await this.insertImages(tx, ref, content.imageUrls);
    });
  }

  submit(ref: VersionRef, actor: Actor): Promise<void> {
    return this.atomically(ref.listingId, async (tx) => {
      await this.applyTransition(tx, ref, 'in_review', {
        actor,
        expectedFrom: 'draft',
      });
      await this.outbox.add(tx, {
        topic: 'listing.submitted',
        payload: { listingId: ref.listingId, version: ref.version },
      });
    });
  }

  recordModerationFailure(
    ref: VersionRef,
    failure: { error: string; attempts: number },
  ): Promise<void> {
    return this.atomically(ref.listingId, (tx) =>
      this.recordEvent(tx, ref, 'in_review', 'in_review', {
        actor: SYSTEM_ACTOR,
        reason: 'moderation_failed',
        metadata: failure,
      }),
    );
  }

  archiveAll(listingId: string, actor: Actor): Promise<void> {
    return this.atomically(listingId, async (tx) => {
      const versions = await tx
        .select({ version: listings.version, status: listings.status })
        .from(listings)
        .where(
          and(
            eq(listings.listingId, listingId),
            ne(listings.status, 'archived'),
          ),
        )
        .orderBy(asc(listings.version))
        .for('update');
      if (
        versions.length === 0 ||
        versions.some((v) => v.status === 'in_review')
      ) {
        throw new ListingVersionConflictError(listingId);
      }
      for (const { version } of versions) {
        await this.applyTransition(tx, { listingId, version }, 'archived', {
          actor,
        });
      }
    });
  }

  transition(
    ref: VersionRef,
    to: ListingStatus,
    details: TransitionDetails,
  ): Promise<void> {
    return this.atomically(ref.listingId, (tx) =>
      this.applyTransition(tx, ref, to, details),
    );
  }

  publishReplacing(ref: VersionRef, details: TransitionDetails): Promise<void> {
    return this.atomically(ref.listingId, async (tx) => {
      // A ordem importa: o índice único parcial é checado a cada comando,
      // então a versão anterior precisa sair de `published` antes da nova entrar.
      const previous = await tx
        .select({ version: listings.version })
        .from(listings)
        .where(
          and(
            eq(listings.listingId, ref.listingId),
            eq(listings.status, 'published'),
            ne(listings.version, ref.version),
          ),
        )
        .for('update');
      for (const { version } of previous) {
        await this.applyTransition(
          tx,
          { listingId: ref.listingId, version },
          'archived',
          {
            actor: SYSTEM_ACTOR,
            metadata: { replacedByVersion: ref.version },
          },
        );
      }
      await this.applyTransition(tx, ref, 'published', details);
    });
  }

  private async applyTransition(
    tx: Transaction,
    ref: VersionRef,
    to: ListingStatus,
    { actor, reason, metadata, expectedFrom }: TransitionDetails,
  ): Promise<void> {
    const [current] = await tx
      .select({ status: listings.status })
      .from(listings)
      .where(versionIs(ref))
      .for('update');
    if (!current) {
      throw new ListingVersionNotFoundError(ref.listingId, ref.version);
    }
    // O status pode ter mudado desde a leitura que motivou a operação.
    if (expectedFrom && current.status !== expectedFrom) {
      throw new ListingVersionConflictError(ref.listingId);
    }

    const now = new Date();
    await tx
      .update(listings)
      .set({
        status: to,
        updatedAt: now,
        ...(to === 'rejected' && { rejectionReason: reason ?? null }),
        ...(to === 'in_review' && { submittedAt: now }),
        ...(to === 'published' && { publishedAt: now }),
      })
      .where(versionIs(ref));
    await this.recordEvent(tx, ref, current.status, to, {
      actor,
      reason,
      metadata,
    });
  }

  private async insertImages(
    tx: Transaction,
    ref: VersionRef,
    urls: string[],
  ): Promise<void> {
    if (urls.length === 0) return;
    await tx
      .insert(listingImages)
      .values(urls.map((url, position) => ({ ...ref, position, url })));
  }

  private async recordEvent(
    tx: Transaction,
    ref: VersionRef,
    from: ListingStatus | null,
    to: ListingStatus,
    { actor, reason, metadata }: TransitionDetails,
  ): Promise<void> {
    await tx.insert(listingAuditEvents).values({
      ...ref,
      fromStatus: from,
      toStatus: to,
      actor: actorId(actor),
      reason: reason ?? null,
      metadata: metadata ?? null,
    });
  }

  /** Roda numa transação e traduz violação de unicidade em conflito de versão. */
  private async atomically<T>(
    listingId: string,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction(work);
    } catch (error) {
      if (postgresErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new ListingVersionConflictError(listingId);
      }
      throw error;
    }
  }
}
