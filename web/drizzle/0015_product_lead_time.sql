-- Leveranstiden var en Shopify-metafält (`b2b.lead_time`) och hade ingen egen
-- kolumn. Produktsidan läste den direkt ur Shopify-svaret och visade rutan
-- "Leveranstid: ..." när fältet hade ett värde.
--
-- Den dagen katalogen läses ur våra egna tabeller finns metafältet inte längre
-- att nå, och rutan hade tystnat utan att någon kunde fylla i den igen. Därför
-- får produkten en egen kolumn.
--
-- Ingen bakåtfyllning: metafältet är tomt på samtliga 16 produkter i Shopify
-- (kontrollerat 2026-08-20), så rutan renderas inte på någon produktsida i dag
-- heller. Kolumnen börjar tom och fylls i admin.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "lead_time" text;
