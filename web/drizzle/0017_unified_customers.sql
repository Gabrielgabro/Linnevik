-- Ett enda kundregister i admin. `customers` finns kvar som teknisk identitet
-- för inloggning, Stripe och ordrar, men varje sådan identitet hör till ett
-- företag i `clients` (det som visas som Kunder i admin).

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "client_id" integer;

-- 1. Säkra träffar på kundnummer.
UPDATE "customers" c
SET "client_id" = (
  SELECT cl."id" FROM "clients" cl
  WHERE cl."customer_no" = c."customer_no"
  LIMIT 1
)
WHERE c."client_id" IS NULL
  AND c."customer_no" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "clients" cl WHERE cl."customer_no" = c."customer_no"
  );

-- 2. Befintliga kontaktpersoners mejladresser är näst säkrast.
UPDATE "customers" c
SET "client_id" = (
  SELECT cc."client_id" FROM "client_contacts" cc
  WHERE lower(cc."email") = lower(c."email")
  ORDER BY cc."id"
  LIMIT 1
)
WHERE c."client_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "client_contacts" cc WHERE lower(cc."email") = lower(c."email")
  );

-- 3. Exakt företagsnamn när varken kundnummer eller mejl gav en träff.
UPDATE "customers" c
SET "client_id" = (
  SELECT cl."id" FROM "clients" cl
  WHERE lower(btrim(cl."name")) = lower(btrim(c."company"))
  ORDER BY cl."id"
  LIMIT 1
)
WHERE c."client_id" IS NULL
  AND nullif(btrim(c."company"), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "clients" cl
    WHERE lower(btrim(cl."name")) = lower(btrim(c."company"))
  );

-- Omatchade konton blir riktiga kundposter i stället för att ligga i en
-- separat kö. WEB-numret är stabilt och kan senare ersättas i admin.
INSERT INTO "clients" ("customer_no", "name", "status")
SELECT
  'WEB-' || c."id",
  coalesce(
    nullif(btrim(c."company"), ''),
    nullif(btrim(concat_ws(' ', c."first_name", c."last_name")), ''),
    c."email"
  ),
  CASE WHEN c."status" = 'active' THEN 'Aktiv kund' ELSE 'Vilande' END
FROM "customers" c
WHERE c."client_id" IS NULL
ON CONFLICT ("customer_no") DO NOTHING;

UPDATE "customers" c
SET "client_id" = cl."id"
FROM "clients" cl
WHERE c."client_id" IS NULL
  AND cl."customer_no" = 'WEB-' || c."id";

-- Kontoinnehavaren ska också synas bland företagets kontaktpersoner.
INSERT INTO "client_contacts" (
  "client_id", "first_name", "last_name", "email", "phone", "status"
)
SELECT
  c."client_id",
  coalesce(nullif(btrim(c."first_name"), ''), split_part(c."email", '@', 1)),
  nullif(btrim(c."last_name"), ''),
  lower(c."email"),
  c."phone",
  CASE WHEN c."status" = 'active' THEN 'Vunnen' ELSE 'Ej kontaktad' END
FROM "customers" c
WHERE c."client_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "client_contacts" cc
    WHERE cc."client_id" = c."client_id"
      AND lower(cc."email") = lower(c."email")
  );

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "customers_client_id_idx" ON "customers" ("client_id");

-- Efter backfill är relationen obligatorisk. Alla framtida skrivvägar skapar
-- länken samtidigt som kontot.
ALTER TABLE "customers"
  ALTER COLUMN "client_id" SET NOT NULL;
