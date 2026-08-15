-- Lagerreservationer och lagerhistorik. Stock binds när en order betalas
-- (eller en faktura godkänns) och frigörs vid makulering/utgång, eller
-- konsumeras (drar av det fysiska saldot) vid plock. Varje ändring av
-- inventory_quantity/inventory_reserved loggas i inventory_movements.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "inventory_reserved" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "inventory_reservations" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "variant_id" integer NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
  "quantity" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_reservations_order_item_key"
  ON "inventory_reservations" ("order_item_id");

CREATE INDEX IF NOT EXISTS "inventory_reservations_variant_id_idx"
  ON "inventory_reservations" ("variant_id");

CREATE INDEX IF NOT EXISTS "inventory_reservations_status_idx"
  ON "inventory_reservations" ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "variant_id" integer NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "type" text NOT NULL,
  "quantity" integer NOT NULL,
  "order_id" integer REFERENCES "orders"("id") ON DELETE SET NULL,
  "order_item_id" integer REFERENCES "order_items"("id") ON DELETE SET NULL,
  "fulfillment_id" integer REFERENCES "fulfillments"("id") ON DELETE SET NULL,
  "reservation_id" integer REFERENCES "inventory_reservations"("id") ON DELETE SET NULL,
  "note" text,
  "actor" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inventory_movements_variant_id_idx"
  ON "inventory_movements" ("variant_id", "created_at");

CREATE INDEX IF NOT EXISTS "inventory_movements_order_id_idx"
  ON "inventory_movements" ("order_id");
