-- Prislogiken blir databasstyrd. Innan den här migreringen låg trapporna
-- hårdkodade i DEFAULT_PRICING_CONFIG (pricingRules.ts); nu läses de ur en
-- enda rad (id = 1) som prislogiksidan i /admin skriver till.
--
-- Grundraden sätts till exakt det sajten redan lovar kunden: samma trappor
-- som stod i DEFAULT_PRICING_CONFIG, progressive, bara för MTO. Ingen prisändring
-- sker av att den här migreringen körs.

CREATE TABLE IF NOT EXISTS "pricing_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "strategy" text NOT NULL DEFAULT 'progressive',
  "tiers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "linear_start_quantity" integer NOT NULL DEFAULT 50,
  "linear_quantity_step" integer NOT NULL DEFAULT 100,
  "linear_percent_per_step" integer NOT NULL DEFAULT 2,
  "linear_max_percent" integer NOT NULL DEFAULT 20,
  "minimum_order_quantity" integer NOT NULL DEFAULT 50,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text
);

DO $$ BEGIN
  ALTER TABLE "pricing_config"
    ADD CONSTRAINT "pricing_config_singleton_check" CHECK ("id" = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_config"
    ADD CONSTRAINT "pricing_config_strategy_check" CHECK ("strategy" in ('progressive', 'linear'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "pricing_config" (
  "id", "strategy", "tiers",
  "linear_start_quantity", "linear_quantity_step", "linear_percent_per_step", "linear_max_percent",
  "minimum_order_quantity"
)
VALUES (
  1, 'progressive',
  '[
    {"minQuantity": 50, "discountPercent": 0},
    {"minQuantity": 200, "discountPercent": 5},
    {"minQuantity": 400, "discountPercent": 10},
    {"minQuantity": 600, "discountPercent": 15},
    {"minQuantity": 1000, "discountPercent": 20}
  ]'::jsonb,
  50, 100, 2, 20,
  50
)
ON CONFLICT ("id") DO NOTHING;
