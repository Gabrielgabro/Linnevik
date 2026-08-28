-- En återbetalning på en skickad faktura kräver en kreditnota (17 kap 22 § ML):
-- ett eget dokument med en otvetydig hänvisning till den ursprungliga fakturan.
-- Stripe skapar den, men bara om vi ber om den — och bokföringen behöver kunna
-- gå från återbetalningen till kreditnotans nummer utan att fråga Stripe.
ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "stripe_credit_note_id" text,
  ADD COLUMN IF NOT EXISTS "credit_note_number" text;

-- Delvis unikt: en återbetalning bär högst en kreditnota, men de allra flesta
-- rader (kortordrar) har ingen alls och NULL ska inte krocka med NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_stripe_credit_note_id_key"
  ON "refunds" ("stripe_credit_note_id")
  WHERE "stripe_credit_note_id" IS NOT NULL;
