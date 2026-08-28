-- Två tal om inköpet som inte fanns någonstans i katalogen.
--
-- 1. Inköpspriset har hittills bara kommit ur `src/data/franzenArticles.ts`,
--    som är genererad ur Franzéns artikelfil och därför oföränderlig för oss.
--    Men priset i den filen är listpriset vi fick vid det tillfället, och
--    Franzén ger oss i praktiken bättre priser än så. Det förhandlade priset
--    finns bara bakom deras inloggning och kan inte hämtas maskinellt, så det
--    måste gå att skriva in för hand — per variant, för varje storlek har sitt
--    eget pris.
--
--    NULL betyder "inget förhandlat pris angivet" och inte "noll kronor": då
--    faller marginalräkningen tillbaka på artikelfilens pris, precis som förut.
--    Beloppet är i öre av samma skäl som price_minor är det.
--
-- 2. `beställes i` — hur många vi tar hem per omgång från Franzén. Det är
--    inköpssidan och har ingenting med `order_increment` att göra, som är
--    kundens steg i kassan och kontrolleras av cartRules.ts. Blandas de ihop
--    får kunden plötsligt köpa i poster om 100.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "supplier_cost_minor" integer,
  ADD COLUMN IF NOT EXISTS "purchase_batch_size" integer;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_supplier_cost_minor_check"
    CHECK ("supplier_cost_minor" IS NULL OR "supplier_cost_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_purchase_batch_size_check"
    CHECK ("purchase_batch_size" IS NULL OR "purchase_batch_size" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
