CREATE TABLE "listing_audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listing_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"listing_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"listing_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"position" integer NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "listing_images_listing_id_version_position_pk" PRIMARY KEY("listing_id","version","position"),
	CONSTRAINT "listing_images_position_non_negative" CHECK ("listing_images"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"listing_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"seller_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_listing_id_version_pk" PRIMARY KEY("listing_id","version"),
	CONSTRAINT "listings_price_positive" CHECK ("listings"."price_cents" > 0),
	CONSTRAINT "listings_status_known" CHECK ("listings"."status" IN ('draft', 'in_review', 'rejected', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "listing_audit_events" ADD CONSTRAINT "listing_audit_events_version_fk" FOREIGN KEY ("listing_id","version") REFERENCES "public"."listings"("listing_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_version_fk" FOREIGN KEY ("listing_id","version") REFERENCES "public"."listings"("listing_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_audit_events_by_version" ON "listing_audit_events" USING btree ("listing_id","version","id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_one_published" ON "listings" USING btree ("listing_id") WHERE "listings"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "listings_one_open" ON "listings" USING btree ("listing_id") WHERE "listings"."status" IN ('draft', 'in_review');--> statement-breakpoint
CREATE INDEX "listings_published_by_category" ON "listings" USING btree ("category","published_at" DESC NULLS LAST) WHERE "listings"."status" = 'published';--> statement-breakpoint
CREATE INDEX "listings_published_recent" ON "listings" USING btree ("published_at" DESC NULLS LAST) WHERE "listings"."status" = 'published';--> statement-breakpoint
CREATE INDEX "listings_by_seller" ON "listings" USING btree ("seller_id","listing_id");