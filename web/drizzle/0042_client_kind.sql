-- Två register i samma tabell, nu uttryckligen åtskilda.
--
-- `lead`: tvätteriets kunder — hotell och restauranger vi ringer. Ringlistan
-- under /admin/clients.
-- `customer`: företag som köper av oss. Kundregistret under /admin/customers,
-- som fakturorna ställs ut ur och som webbkontona hänger på.
--
-- Förut skiljdes de åt bara genom att en kund råkade ha ett webbkonto, och
-- fakturaverktyget fick leta bland ringlistan.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'lead';

ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_kind_check";
ALTER TABLE "clients" ADD CONSTRAINT "clients_kind_check" CHECK ("kind" IN ('lead', 'customer'));

-- Allt som redan köpt, loggat in eller skapats av kassan är en kund.
UPDATE "clients" SET "kind" = 'customer'
WHERE "id" IN (SELECT "client_id" FROM "customers" WHERE "client_id" IS NOT NULL)
   OR "customer_no" LIKE 'WEB-%';

CREATE INDEX IF NOT EXISTS "clients_kind_idx" ON "clients" ("kind");
