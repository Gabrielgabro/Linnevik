-- Leverantören är vem vi köper produkten av, och är inget kunden ser. Den är
-- skild från "vendor", som är varumärket på produktsidan. En produkt har alltid
-- en leverantör; är den inte utredd ännu står det 'unknown' och inte NULL, så
-- att "vi vet inte" är ett svar i kolumnen och inte ett hål i den.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "supplier" text DEFAULT 'unknown' NOT NULL;

-- De produkter vi själva har beställt hem och som nu ligger synkade i Stripe.
-- Resten är utkast som ännu inte är sålda av någon, och behåller 'unknown'
-- tills vi vet vem de kommer ifrån.
UPDATE "products"
  SET "supplier" = 'Linnevik', "updated_at" = now()
  WHERE "active" = true
    AND "stripe_product_id" IS NOT NULL
    AND "supplier" = 'unknown';

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_supplier_check"
    CHECK (length(btrim("supplier")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "products_supplier_idx" ON "products" ("supplier");
