-- Den egna korgen kör parallellt med Shopify tills hela köpresan är verifierad.
-- Inga befintliga Shopify-tabeller eller integrationer ändras av migrationen.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "minimum_order_quantity" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "order_increment" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "inventory_tracked" boolean DEFAULT true NOT NULL;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_minimum_order_quantity_check"
    CHECK ("minimum_order_quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_order_increment_check"
    CHECK ("order_increment" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "carts" (
  "id" text PRIMARY KEY,
  "status" text DEFAULT 'active' NOT NULL,
  "customer_no" text,
  "locale" text DEFAULT 'sv' NOT NULL,
  "currency" text DEFAULT 'sek' NOT NULL,
  "pricing_version" text DEFAULT 'v1' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL CHECK ("version" > 0),
  "expires_at" timestamp with time zone NOT NULL,
  "checkout_started_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "carts_status_expires_at_idx"
  ON "carts" ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "cart_id" text NOT NULL,
  "variant_id" integer NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk"
    FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_variant_key"
  ON "cart_items" ("cart_id", "variant_id");
CREATE INDEX IF NOT EXISTS "cart_items_cart_id_idx" ON "cart_items" ("cart_id");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cart_id" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cart_version" integer;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk"
    FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_cart_version_key"
  ON "orders" ("cart_id", "cart_version")
  WHERE "cart_id" IS NOT NULL AND "cart_version" IS NOT NULL;
