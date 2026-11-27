-- Franzén-varianterna blir utan lagerföring (source_of_truth §3.2, A28).
--
-- Vi beställer hem dem från Franzén efter order. Lagret på 1000 var påhittat
-- och begränsade ändå hur mycket som gick att köpa. Utan lagerföring finns
-- ingen gräns, och inget lager reserveras eller dras.
--
-- Saldot står kvar orört: kod som läser `inventory_quantity` utan att först
-- titta på `inventory_tracked` ska inte plötsligt se 0. Vid körningen hade
-- ingen av varianterna något reserverat, så ingen reservation blir hängande.

update product_variants v
set inventory_tracked = false, updated_at = now()
from products p
where p.id = v.product_id
  and p.supplier = 'Franzén Textil i Kinna'
  and v.inventory_tracked;
