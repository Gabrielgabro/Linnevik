-- Local catalog boundary for the staged Shopify -> Stripe migration.
-- Additive and safe to apply while Shopify remains the live checkout.

CREATE TABLE IF NOT EXISTS "products" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "shopify_product_id" text NOT NULL,
  "handle" text NOT NULL,
  "title" text NOT NULL,
  "stripe_product_id" text,
  "active" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'shopify' NOT NULL,
  "source_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "product_id" integer NOT NULL,
  "shopify_variant_id" text NOT NULL,
  "sku" text NOT NULL,
  "option_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "price_minor" integer NOT NULL CHECK (price_minor >= 0),
  "currency" text DEFAULT 'sek' NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  "inventory_quantity" integer DEFAULT 0 NOT NULL,
  "available_for_sale" boolean DEFAULT false NOT NULL,
  "stripe_price_id" text,
  "stripe_lookup_key" text,
  "active" boolean DEFAULT true NOT NULL,
  "source_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "products_shopify_product_id_key" ON "products" ("shopify_product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "products_handle_key" ON "products" ("handle");
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" ("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_shopify_variant_id_key" ON "product_variants" ("shopify_variant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_key" ON "product_variants" ("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_stripe_price_id_key"
  ON "product_variants" ("stripe_price_id") WHERE "stripe_price_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_stripe_lookup_key_key"
  ON "product_variants" ("stripe_lookup_key") WHERE "stripe_lookup_key" IS NOT NULL;
