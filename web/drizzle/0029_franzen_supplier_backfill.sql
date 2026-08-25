-- Katalogen fick sju platshållarprodukter (påslakan, lakan, örngott,
-- morgonrock x2, tofflor, handtvål) från Shopify-importen 2026-08-12. De
-- ligger live men stod kvar på supplier = 'unknown' och kopplades aldrig till
-- Franzén's Textil i Kinna AB, den svenska grossisten vi faktiskt tänkt
-- använda för dem. Samma sträng som redan används på handduk-ludde.
UPDATE "products"
  SET "supplier" = 'Franzén Textil i Kinna', "updated_at" = now()
  WHERE "handle" IN ('paslakan', 'lakan', 'orngott', 'morgonrock', 'morgonrock-vaffel', 'tofflor', 'handtval')
    AND "supplier" = 'unknown';

-- Täcke Jakob och Kudde Alva är två av de fyra egna dunproverna (jämför
-- Sebastian/Sigrid), men 0006 fångade bara de två som redan hade ett
-- stripe_product_id vid backfillen. Samma ursprung, samma leverantör.
UPDATE "products"
  SET "supplier" = 'Linnevik', "updated_at" = now()
  WHERE "handle" IN ('duvet-jacob', 'kudde-medium')
    AND "supplier" = 'unknown';
