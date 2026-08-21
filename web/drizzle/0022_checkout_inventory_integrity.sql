-- Checkout/inventory cutover invariants.
-- MTO and SAMPLE_ONLY are quote/sample products and must never enter a cart.

UPDATE product_variants pv
SET available_for_sale = false, updated_at = now()
FROM products p
WHERE p.id = pv.product_id
  AND (coalesce(p.tags, ARRAY[]::text[]) @> ARRAY['MTO']::text[]
       OR coalesce(p.tags, ARRAY[]::text[]) @> ARRAY['SAMPLE_ONLY']::text[])
  AND pv.available_for_sale;

DO $$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT product_variants_inventory_quantity_nonnegative
    CHECK (inventory_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_variants ADD CONSTRAINT product_variants_inventory_reserved_valid
    CHECK (inventory_reserved >= 0 AND (NOT inventory_tracked OR inventory_reserved <= inventory_quantity));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_quantity_valid
    CHECK (quantity >= 0 AND (status <> 'active' OR quantity > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fulfillment_items ADD CONSTRAINT fulfillment_items_quantity_positive
    CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS orders_pending_reconciliation_idx
  ON orders (created_at DESC)
  WHERE payment_status = 'pending';

CREATE TABLE IF NOT EXISTS order_item_returns (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id integer NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  restock boolean NOT NULL,
  actor text NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT order_item_returns_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS order_item_returns_order_item_idx
  ON order_item_returns (order_item_id, created_at);

-- Preserve returns recorded before the dedicated return ledger existed.
INSERT INTO order_item_returns (order_id, order_item_id, quantity, restock, actor, note, created_at)
SELECT order_id, order_item_id, quantity, type = 'return', actor, note, created_at
FROM inventory_movements
WHERE type IN ('return', 'return_no_restock')
  AND order_id IS NOT NULL AND order_item_id IS NOT NULL;
