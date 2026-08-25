-- Ordningen mellan en produkts varianter.
--
-- Adminlistan sorterade på SKU och produktsidans variantväljare byggde sina
-- knappar i id-ordning, alltså i den ordning varianterna råkade skapas. 50x70
-- kunde därför hamna efter 60x90 på sajten utan att någon kunde ändra det.
--
-- Startvärdet är SKU-ordningen inom varje produkt, vilket är exakt vad
-- adminvyn visade förut — ingen lista byter utseende av migreringen i sig.

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, (row_number() OVER (PARTITION BY product_id ORDER BY sku ASC) - 1) AS pos
  FROM product_variants
)
UPDATE product_variants v
   SET position = ranked.pos
  FROM ranked
 WHERE ranked.id = v.id;

CREATE INDEX IF NOT EXISTS "product_variants_product_position_idx"
  ON "product_variants" ("product_id", "position");
