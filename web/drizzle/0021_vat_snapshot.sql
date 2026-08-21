-- Momsen ska gå att läsa ur ordern, inte gissas ur miljövariabler.
--
-- Ordern bar bara `tax_minor`: hur mycket moms som togs in, men inte enligt
-- vilken sats, i vilket läge (uttrycklig sats eller Stripe Tax) eller mot
-- vilket VAT-nummer. Ändras VAT_PERCENT eller slås Stripe Tax på blir gamla
-- ordrar omöjliga att stämma av mot det som faktiskt debiterades — och en
-- order utan köparens org-/VAT-nummer och fakturaadress går inte att fakturera
-- enligt kraven på en momsfaktura.
--
-- `vat_bps` är satsen i hundradels procent (25 % = 2500). Heltal av samma skäl
-- som belopp sparas i ören: en decimal kan inte tappas på vägen genom
-- drivrutinen.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "vat_mode" text,
  ADD COLUMN IF NOT EXISTS "vat_bps" integer,
  ADD COLUMN IF NOT EXISTS "vat_rate_id" text,
  ADD COLUMN IF NOT EXISTS "billing_address" jsonb,
  ADD COLUMN IF NOT EXISTS "tax_id_type" text,
  ADD COLUMN IF NOT EXISTS "tax_id_value" text;

-- Backfill: allt som redan sålts gick genom den uttryckliga svenska satsen —
-- Stripe Tax har aldrig varit påslaget i någon miljö (flaggan finns inte satt
-- i vare sig .env.local eller Vercel-projektet). 25 % är den sats som gällde.
UPDATE "orders"
   SET "vat_mode" = 'explicit', "vat_bps" = 2500
 WHERE "vat_mode" IS NULL;

-- Återbetalningar görs mot betalningen, alltså inklusive moms. Utan den här
-- kolumnen står det ingenstans hur mycket utgående moms en kreditering vände
-- tillbaka, och den delen av momsredovisningen fick göras för hand.
ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "tax_minor" integer NOT NULL DEFAULT 0;

-- Backfill proportionellt mot orderns moms, likadant som refundVatMinor räknar:
-- en full återbetalning vänder hela momsen, en delåterbetalning sin andel.
UPDATE "refunds" r
   SET "tax_minor" = CASE
     WHEN o."tax_minor" <= 0 OR o."total_minor" <= 0 THEN 0
     WHEN r."amount_minor" >= o."total_minor" THEN o."tax_minor"
     ELSE least(o."tax_minor", round((r."amount_minor"::numeric * o."tax_minor") / o."total_minor")::int)
   END
  FROM "orders" o
 WHERE o."id" = r."order_id" AND r."tax_minor" = 0;

-- Kunden bär redan tax_id från registreringen; fakturaadressen saknades.
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "tax_id_type" text;
