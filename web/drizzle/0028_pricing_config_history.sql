-- Historik över prisreglerna.
--
-- `pricing_config` är en enda rad med fast id. Ändrades mängdrabatten skrevs
-- den föregående regeln över, och `CURRENT_PRICING_VERSION` var dessutom en
-- hårdkodad literal 'v1' som varje korg stämplades med. Beloppen på gamla
-- ordrar är trygga — order_items fryser styckpriset — men *regeln* som gav dem
-- gick inte att få fram, vilket är precis vad en kund som ifrågasätter sitt
-- pris, eller en marginalanalys i efterhand, frågar efter.
--
-- Varje sparning skriver en rad här. Den aktiva raden i pricing_config är
-- oförändrad och läses precis som förut; det här är arkivet bredvid den.

CREATE TABLE IF NOT EXISTS "pricing_config_versions" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Löpande versionsnamn: v1, v2, … Stämplas på korgar och ordrar.
  "version" text NOT NULL,
  "config" jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pricing_config_versions_version_key"
  ON "pricing_config_versions" ("version");

CREATE INDEX IF NOT EXISTS "pricing_config_versions_created_idx"
  ON "pricing_config_versions" ("created_at" DESC);

-- Den regel som gällde när ordern prissattes. Korgen bär redan en
-- pricing_version-kolumn sedan 0005; ordern gjorde det inte.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "pricing_version" text;

-- Utgångsläget: allt som finns i dag är v1, vilket är exakt vad korgarna
-- stämplats med hittills.
INSERT INTO "pricing_config_versions" ("version", "config", "updated_by")
SELECT 'v1', to_jsonb(pricing_config), COALESCE(updated_by, 'migration')
  FROM pricing_config WHERE id = 1
 ON CONFLICT ("version") DO NOTHING;

UPDATE orders SET pricing_version = 'v1' WHERE pricing_version IS NULL;
