-- Prisförslagen fick sällskap. Fram till nu fanns bara en prisdiskussion —
-- våra egna produkter från Kina-sändningen — och tabellen kunde därför nöja
-- sig med ett levande förslag per person. Med Franzén-sortimentet på en egen
-- sida finns det två, och de får inte skriva över varandra: den som sparar ett
-- Franzén-bud ska inte tappa sitt bud på duntäckena.
--
-- `scope` är vilken prisdiskussion budet hör till. Befintliga rader är alla
-- från egna produkter, därav default 'egna'.
ALTER TABLE "price_suggestions"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'egna';

DROP INDEX IF EXISTS "price_suggestions_user_key";

CREATE UNIQUE INDEX IF NOT EXISTS "price_suggestions_user_scope_key"
  ON "price_suggestions" ("user", "scope");
