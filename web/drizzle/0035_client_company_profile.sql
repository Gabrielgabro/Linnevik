-- Kundregistret ska kunna bära en faktura på egen hand.
--
-- Företagsnamn fanns redan på `clients`, men organisationsnumret och adressen
-- bodde bara på webbkontot — och adressen bara om kunden råkat gå igenom en
-- kortkassa, eftersom det var Stripes svar som skrev den. Ett konto som
-- registrerats och aldrig handlat hade alltså ingen adress alls, och
-- fakturarutten stoppade det med "adress krävs" utan något ställe att fylla i
-- den på. Härefter är företaget den ägande posten för fakturaidentiteten.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "org_number" text,
  ADD COLUMN IF NOT EXISTS "invoice_email" text,
  ADD COLUMN IF NOT EXISTS "address_line1" text,
  ADD COLUMN IF NOT EXISTS "address_line2" text,
  ADD COLUMN IF NOT EXISTS "postal_code" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "country" text NOT NULL DEFAULT 'SE';

-- 1. Normalisera organisationsnumren som redan ligger på webbkontona innan de
--    kopieras uppåt. Registreringen har alltid normaliserat, men numret som
--    kom tillbaka från en kassa skrevs som kunden angav det.
UPDATE "customers"
SET "tax_id" = regexp_replace(upper("tax_id"), '[^A-Z0-9]', '', 'g')
WHERE "tax_id" IS NOT NULL
  AND "tax_id" <> regexp_replace(upper("tax_id"), '[^A-Z0-9]', '', 'g');

-- Ett blankt tiosiffrigt organisationsnummer är samma registrering som sin
-- momsnummerform. Samma regel som normalizeCompanyRegistrationNumber.
UPDATE "customers"
SET "tax_id" = 'SE' || "tax_id" || '01'
WHERE "tax_id" ~ '^\d{10}$';

-- Grekland har landskoden GR men momsprefixet EL.
UPDATE "customers"
SET "tax_id" = 'EL' || substr("tax_id", 3)
WHERE "tax_id" LIKE 'GR%';

-- Värdet är ett EU-momsnummer, vilket också är Stripes namn på typen. Den
-- gamla etiketten 'org_no' finns inte hos Stripe och gick inte att skicka in.
UPDATE "customers"
SET "tax_id_type" = 'eu_vat'
WHERE "tax_id" IS NOT NULL AND coalesce("tax_id_type", '') <> 'eu_vat';

-- 2. Organisationsnumret upp på företaget. Senast ändrade kontot vinner när
--    ett företag har flera inloggningar med olika nummer sparade.
UPDATE "clients" cl
SET "org_number" = src."tax_id"
FROM (
  SELECT DISTINCT ON (c."client_id") c."client_id", c."tax_id"
  FROM "customers" c
  WHERE nullif(btrim(c."tax_id"), '') IS NOT NULL
  ORDER BY c."client_id", c."updated_at" DESC, c."id" DESC
) src
WHERE src."client_id" = cl."id" AND cl."org_number" IS NULL;

-- 3. Adressen upp på företaget. Fakturaadressen går före leveransadressen;
--    är bara den ena satt duger den.
UPDATE "clients" cl
SET "address_line1" = src."line1",
    "address_line2" = src."line2",
    "postal_code"   = src."postal_code",
    "city"          = src."city",
    "country"       = coalesce(src."country", 'SE')
FROM (
  SELECT DISTINCT ON (c."client_id")
    c."client_id",
    btrim(a."value" ->> 'line1') AS "line1",
    nullif(btrim(coalesce(a."value" ->> 'line2', '')), '') AS "line2",
    nullif(btrim(coalesce(a."value" ->> 'postal_code', '')), '') AS "postal_code",
    nullif(btrim(coalesce(a."value" ->> 'city', '')), '') AS "city",
    upper(nullif(btrim(coalesce(a."value" ->> 'country', '')), '')) AS "country"
  FROM "customers" c
  CROSS JOIN LATERAL (
    SELECT coalesce(c."default_billing_address", c."default_shipping_address") AS "value"
  ) a
  WHERE a."value" IS NOT NULL
    AND nullif(btrim(coalesce(a."value" ->> 'line1', '')), '') IS NOT NULL
  ORDER BY c."client_id", c."updated_at" DESC, c."id" DESC
) src
WHERE src."client_id" = cl."id" AND cl."address_line1" IS NULL;

-- 4. Svenska postnummer lagras som "NNN NN" — samma form som
--    normalizePostalCode ger, så att en jämförelse inte faller på ett mellanslag.
UPDATE "clients"
SET "postal_code" =
      substr(regexp_replace("postal_code", '\D', '', 'g'), 1, 3) || ' ' ||
      substr(regexp_replace("postal_code", '\D', '', 'g'), 4, 2)
WHERE "country" = 'SE'
  AND "postal_code" IS NOT NULL
  AND regexp_replace("postal_code", '\D', '', 'g') ~ '^\d{5}$'
  AND "postal_code" !~ '^\d{3} \d{2}$';

UPDATE "customers"
SET "default_billing_address" = jsonb_set(
      "default_billing_address",
      '{postal_code}',
      to_jsonb(
        substr(regexp_replace("default_billing_address" ->> 'postal_code', '\D', '', 'g'), 1, 3) || ' ' ||
        substr(regexp_replace("default_billing_address" ->> 'postal_code', '\D', '', 'g'), 4, 2)
      )
    )
WHERE coalesce("default_billing_address" ->> 'country', 'SE') = 'SE'
  AND "default_billing_address" ->> 'postal_code' IS NOT NULL
  AND regexp_replace("default_billing_address" ->> 'postal_code', '\D', '', 'g') ~ '^\d{5}$'
  AND "default_billing_address" ->> 'postal_code' !~ '^\d{3} \d{2}$';

UPDATE "customers"
SET "default_shipping_address" = jsonb_set(
      "default_shipping_address",
      '{postal_code}',
      to_jsonb(
        substr(regexp_replace("default_shipping_address" ->> 'postal_code', '\D', '', 'g'), 1, 3) || ' ' ||
        substr(regexp_replace("default_shipping_address" ->> 'postal_code', '\D', '', 'g'), 4, 2)
      )
    )
WHERE coalesce("default_shipping_address" ->> 'country', 'SE') = 'SE'
  AND "default_shipping_address" ->> 'postal_code' IS NOT NULL
  AND regexp_replace("default_shipping_address" ->> 'postal_code', '\D', '', 'g') ~ '^\d{5}$'
  AND "default_shipping_address" ->> 'postal_code' !~ '^\d{3} \d{2}$';

-- Två företag med samma organisationsnummer är ett fel i registret, men ett
-- unikt index hade fällt migreringen på dubbletter som redan finns. Indexet
-- finns för uppslagningen vid registrering; dubbletter löses i admin.
CREATE INDEX IF NOT EXISTS "clients_org_number_idx"
  ON "clients" ("org_number") WHERE "org_number" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "clients" ADD CONSTRAINT "clients_country_check"
    CHECK ("country" ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
