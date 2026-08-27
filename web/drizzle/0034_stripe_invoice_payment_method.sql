-- Stripe invoices are a pay-later alternative to a Checkout Session. The
-- existing stripe_session_id remains the unique Stripe reference (an in_ ID
-- for invoice orders); this column explains which Stripe flow created it.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_method" text NOT NULL DEFAULT 'checkout';

CREATE INDEX IF NOT EXISTS "orders_payment_method_idx"
  ON "orders" ("payment_method", "created_at" DESC);
