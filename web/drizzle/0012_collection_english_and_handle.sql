-- Två fel som importen ärvde från Shopify och som vi nu äger själva.
--
-- 1. Kategoriernas engelska texter var svenska. Shopify har ingen engelsk
--    översättning av kategorierna, så `@inContext(language: EN)` svarade med
--    den svenska texten och importen skrev in den i title_en och
--    description_html_en. Så länge sajten läste kategorierna från Shopify syntes
--    det inte; nu läser /en/collections våra egna kolumner och visar svenska.
--
-- 2. Kategorin med handle `madrasskydd` heter `Badrum`. Den döptes om i Shopify
--    utan att handlen ändrades — Shopify behåller handlen vid namnbyte — och
--    handlen är adressen på sajten. Den krockar dessutom med produkten som har
--    samma handle.
--
-- Båda uppdateringarna är villkorade så att de aldrig skriver över något någon
-- redan rättat för hand, och så att migreringen går att köra om.

-- 1. Engelska titlar och beskrivningar. Villkoret `title_en = title_sv` träffar
--    bara rader där engelskan fortfarande är den svenska texten rakt av.
UPDATE "collections" SET "title_en" = 'Bathroom'
  WHERE "handle" = 'madrasskydd' AND "title_en" = "title_sv";

UPDATE "collections" SET "title_en" = 'Pillows & Duvets'
  WHERE "handle" = 'tacken' AND "title_en" = "title_sv";

UPDATE "collections" SET "title_en" = 'Bathrobes'
  WHERE "handle" = 'morgonrockar' AND "title_en" = "title_sv";

UPDATE "collections" SET "title_en" = 'Bed linen'
  WHERE "handle" = 'sangklader' AND "title_en" = "title_sv";

UPDATE "collections"
   SET "description_html_en" = '<p class="p1">These pillows and duvets have been through many rounds of washing and stress testing in the laundry. We adjusted them together with the factories, step by step, until we found versions that hold up to both guests and repeated washing.</p>'
 WHERE "handle" = 'tacken' AND "description_html_en" = "description_html";

UPDATE "collections"
   SET "description_html_en" = '<p>Send us an enquiry if you would like embroidery or other customisation. Rental and laundry agreements are available as well.</p>'
 WHERE "handle" = 'morgonrockar' AND "description_html_en" = "description_html";

UPDATE "collections"
   SET "description_html_en" = '<p>Our bed linen is available to buy directly from stock in smaller quantities. For larger orders, please <a href="/contact">get in touch</a>.</p>'
 WHERE "handle" = 'sangklader' AND "description_html_en" = "description_html";

-- `featured` är redan engelsk på båda språken och lämnas som den är.

-- 2. Handlen följer titeln. Görs bara om `badrum` är ledig, så att en omkörning
--    inte kan slå ihop två kategorier.
UPDATE "collections" SET "handle" = 'badrum'
 WHERE "handle" = 'madrasskydd'
   AND "title_sv" = 'Badrum'
   AND NOT EXISTS (SELECT 1 FROM "collections" c WHERE c."handle" = 'badrum');
