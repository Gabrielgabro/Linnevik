-- Tredje strategin på prislogiksidan: rabatt på ordervärde i stället för på
-- antalet i en enskild rad.
--
-- Bakgrunden är prisanalysen 2026-08. Med per-SKU-trappan får ett komplett
-- 50-rumshotell (45 700 kr över fyra produkter) 0 % rabatt, medan 1 000
-- kuddskydd (35 200 kr, sortimentets högsta marginal) får fulla 20 %. Trappan
-- belönar alltså fel order. Den här strategin mäter i stället hela orderns
-- värde och begränsar varje produkt med ett eget tak.
--
-- Taken är satta efter frakten: sändning HTL26-01 låg på 2 294 SEK/CBM, och
-- det är den kostnaden som faller när en order blir stor nog att konsolideras.
-- Skrymmande produkter (Kudde Eric −41 % landad kostnad vid full container)
-- tål djupare rabatt än kompakta (Kuddskydd −5 %).
--
-- Grundraden byter INTE strategi. `strategy` står kvar på det som redan är
-- valt; kolumnerna nedan är bara förberedda värden. Ingen prisändring sker av
-- att den här migreringen körs.

ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "order_value_ladder" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "order_value_caps" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "order_value_default_max_percent" integer NOT NULL DEFAULT 12;

-- Strategilistan utökas. Villkoret måste bort och läggas tillbaka: ett CHECK
-- går inte att ändra på plats.
ALTER TABLE "pricing_config"
  DROP CONSTRAINT IF EXISTS "pricing_config_strategy_check";

ALTER TABLE "pricing_config"
  ADD CONSTRAINT "pricing_config_strategy_check"
  CHECK ("strategy" in ('progressive', 'linear', 'orderValue'));

-- Utgångsvärden, men bara om raden ännu inte har några. En admin som redan
-- hunnit spara en egen trappa ska inte få den överskriven av en migrering.
UPDATE "pricing_config"
SET "order_value_ladder" = '[
      {"minOrderValueMinor": 0,        "discountPercent": 0},
      {"minOrderValueMinor": 2500000,  "discountPercent": 3},
      {"minOrderValueMinor": 5000000,  "discountPercent": 6},
      {"minOrderValueMinor": 10000000, "discountPercent": 9},
      {"minOrderValueMinor": 20000000, "discountPercent": 12}
    ]'::jsonb
WHERE "id" = 1 AND jsonb_array_length("order_value_ladder") = 0;

UPDATE "pricing_config"
SET "order_value_caps" = '[
      {"skuPrefix": "KUD-ERI", "maxPercent": 28},
      {"skuPrefix": "TAC-DAN", "maxPercent": 25},
      {"skuPrefix": "MAD",     "maxPercent": 18},
      {"skuPrefix": "KSK",     "maxPercent": 10},
      {"skuPrefix": "TAC-SEB", "maxPercent": 8},
      {"skuPrefix": "KUD-SIG", "maxPercent": 8}
    ]'::jsonb
WHERE "id" = 1 AND jsonb_array_length("order_value_caps") = 0;
