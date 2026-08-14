-- Owned commerce operations. Additive while Shopify remains the official shop.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;
UPDATE "products" SET "status" = CASE WHEN "active" THEN 'active' ELSE 'draft' END;
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_status_check"
    CHECK ("status" IN ('active', 'draft', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "products_status_idx" ON "products" ("status");

CREATE TABLE IF NOT EXISTS "customers" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "email" text NOT NULL,
  "stripe_customer_id" text,
  "shopify_customer_id" text,
  "customer_no" text,
  "first_name" text,
  "last_name" text,
  "company" text,
  "phone" text,
  "tax_id" text,
  "default_billing_address" jsonb,
  "default_shipping_address" jsonb,
  "accepts_marketing" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_key" ON "customers" (lower("email"));
CREATE UNIQUE INDEX IF NOT EXISTS "customers_stripe_customer_id_key" ON "customers" ("stripe_customer_id") WHERE "stripe_customer_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "customers_shopify_customer_id_key" ON "customers" ("shopify_customer_id") WHERE "shopify_customer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "customers_customer_no_idx" ON "customers" ("customer_no");

CREATE TABLE IF NOT EXISTS "discount_codes" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "kind" text NOT NULL,
  "value" integer DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'sek' NOT NULL,
  "minimum_subtotal_minor" integer DEFAULT 0 NOT NULL,
  "usage_limit" integer,
  "usage_limit_per_customer" integer,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "stripe_coupon_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_key" ON "discount_codes" (upper("code"));
DO $$ BEGIN
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_kind_check"
    CHECK ("kind" IN ('percentage', 'fixed_amount', 'free_shipping'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipping_rules" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" text NOT NULL,
  "country_codes" text[] DEFAULT ARRAY['SE']::text[] NOT NULL,
  "postal_code_prefixes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "minimum_subtotal_minor" integer DEFAULT 0 NOT NULL,
  "maximum_subtotal_minor" integer,
  "price_minor" integer DEFAULT 0 NOT NULL,
  "free_above_minor" integer,
  "currency" text DEFAULT 'sek' NOT NULL,
  "estimated_min_days" integer,
  "estimated_max_days" integer,
  "priority" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shipping_rules_active_priority_idx" ON "shipping_rules" ("active", "priority");

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "customer_id" integer,
  ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
  ADD COLUMN IF NOT EXISTS "discount_code_id" integer,
  ADD COLUMN IF NOT EXISTS "discount_code" text,
  ADD COLUMN IF NOT EXISTS "discount_minor" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "shipping_rule_id" integer,
  ADD COLUMN IF NOT EXISTS "shipping_method" text,
  ADD COLUMN IF NOT EXISTS "shipping_minor" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "refunded_minor" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk"
    FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_rule_id_shipping_rules_id_fk"
    FOREIGN KEY ("shipping_rule_id") REFERENCES "public"."shipping_rules"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "orders_customer_id_idx" ON "orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "orders_fulfillment_status_idx" ON "orders" ("fulfillment_status");

CREATE TABLE IF NOT EXISTS "discount_redemptions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "discount_code_id" integer NOT NULL REFERENCES "discount_codes"("id") ON DELETE restrict,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "customer_id" integer REFERENCES "customers"("id") ON DELETE set null,
  "email" text,
  "amount_minor" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "discount_redemptions_order_key" ON "discount_redemptions" ("order_id");
CREATE INDEX IF NOT EXISTS "discount_redemptions_code_idx" ON "discount_redemptions" ("discount_code_id");

CREATE TABLE IF NOT EXISTS "refunds" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE restrict,
  "stripe_refund_id" text NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'sek' NOT NULL,
  "reason" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "note" text,
  "actor" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_stripe_refund_id_key" ON "refunds" ("stripe_refund_id");
CREATE INDEX IF NOT EXISTS "refunds_order_id_idx" ON "refunds" ("order_id");

CREATE TABLE IF NOT EXISTS "fulfillments" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE restrict,
  "status" text DEFAULT 'pending' NOT NULL,
  "carrier" text,
  "tracking_number" text,
  "tracking_url" text,
  "note" text,
  "shipped_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fulfillments_order_id_idx" ON "fulfillments" ("order_id");

CREATE TABLE IF NOT EXISTS "fulfillment_items" (
  "fulfillment_id" integer NOT NULL REFERENCES "fulfillments"("id") ON DELETE cascade,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id") ON DELETE restrict,
  "quantity" integer NOT NULL,
  PRIMARY KEY ("fulfillment_id", "order_item_id")
);

CREATE TABLE IF NOT EXISTS "order_events" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "actor" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "order_events_order_id_idx" ON "order_events" ("order_id", "created_at");

INSERT INTO "shipping_rules" ("name", "country_codes", "price_minor", "currency", "priority")
SELECT 'Standardleverans', ARRAY['SE']::text[], 0, 'sek', 100
WHERE NOT EXISTS (SELECT 1 FROM "shipping_rules");
