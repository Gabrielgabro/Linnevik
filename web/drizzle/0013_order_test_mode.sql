-- Märker ordrar som kom till med en Stripe-nyckel i testläge.
--
-- Utan flaggan går en testorder inte att skilja från en riktig i adminvyn, och
-- den räknas med i varje summering av omsättning. Sessionsprefixet (`cs_test_`)
-- räcker inte som facit: en order skapas innan Stripe-sessionen finns och bär
-- då bara ett `pending_`-id, så en obetald testorder hade sett skarp ut.
--
-- Kolumnen sätts vid orderskapandet och ändras aldrig efteråt. Den beskriver
-- vilken nyckel som användes då, inte vilket läge appen står i nu.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "test_mode" boolean NOT NULL DEFAULT false;

-- Backfill: allt som redan gått genom en testsession är per definition test.
UPDATE "orders" SET "test_mode" = true WHERE "stripe_session_id" LIKE 'cs_test_%';

-- Listvyn filtrerar på flaggan, och skarpa ordrar är den intressanta delmängden.
CREATE INDEX IF NOT EXISTS "orders_test_mode_idx" ON "orders" ("test_mode", "created_at" DESC);
