-- Kategoriträd och produktkopplingar: brödsmulorna flyttar in i vår egen
-- backend. Additivt och säkert att köra medan Shopify fortfarande driver kassan.

CREATE TABLE IF NOT EXISTS "collections" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "shopify_collection_id" text,
  "handle" text NOT NULL,
  "title_sv" text NOT NULL,
  "title_en" text NOT NULL,
  "parent_id" integer,
  "position" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "source_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_collections" (
  "product_id" integer NOT NULL,
  "collection_id" integer NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_collections_pkey" PRIMARY KEY ("product_id", "collection_id")
);

DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_id_collections_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."collections"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk"
    FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- En kategori får inte vara sin egen förälder.
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_not_self"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "collections_handle_key" ON "collections" ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "collections_shopify_collection_id_key"
  ON "collections" ("shopify_collection_id") WHERE "shopify_collection_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "collections_parent_id_idx" ON "collections" ("parent_id");
CREATE INDEX IF NOT EXISTS "product_collections_collection_id_idx"
  ON "product_collections" ("collection_id");
-- Högst en primär kategori per produkt, annars blir brödsmulan godtycklig igen.
CREATE UNIQUE INDEX IF NOT EXISTS "product_collections_primary_key"
  ON "product_collections" ("product_id") WHERE "is_primary";
