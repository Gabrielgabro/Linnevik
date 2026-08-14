-- Ordrar. Stripe äger betalningen, vi äger ordern.
-- Additivt och säkert att köra medan Shopify fortfarande driver kassan.

CREATE TABLE IF NOT EXISTS "orders" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "stripe_session_id" text NOT NULL,
  "stripe_payment_intent_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "email" text,
  "customer_name" text,
  "shipping_address" jsonb,
  "subtotal_minor" integer DEFAULT 0 NOT NULL CHECK (subtotal_minor >= 0),
  "tax_minor" integer DEFAULT 0 NOT NULL CHECK (tax_minor >= 0),
  "total_minor" integer DEFAULT 0 NOT NULL CHECK (total_minor >= 0),
  "currency" text DEFAULT 'sek' NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  "locale" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "order_id" integer NOT NULL,
  "variant_id" integer,
  "sku" text NOT NULL,
  "title" text NOT NULL,
  "quantity" integer NOT NULL CHECK (quantity > 0),
  "unit_amount_minor" integer NOT NULL CHECK (unit_amount_minor >= 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- En omsänd webhook får inte skapa en andra order.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_stripe_session_id_key" ON "orders" ("stripe_session_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status");
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items" ("order_id");
