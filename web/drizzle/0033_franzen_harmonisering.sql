-- Franzén-sortimentet stämt mot Franzéns egen artikelfil.
--
-- Bakgrund: produkterna kom in som platshållare från Shopify-importen
-- 2026-08-12 och kopplades till Franzén först i 0029/0030. Specifikationerna
-- rättades då mot artikelfilen, men *namnen, storlekarna och färgerna* gjorde
-- det aldrig. En granskning 2026-08-26 mot
-- catalog/external_suppliers/franzen/franzén_products_2026/163455-product-data.xlsx
-- visade att 19 av 23 varianter inte motsvarade någon artikel hos Franzén:
--
--   * Handdukens serie hette "Enzo". Franzén har ingen Enzo — deras
--     frottéserier är Corfu (550 g) och Nevada (450 g), och artikeln vi köper
--     är Nevada. "Enzo" är en Borganäs-serie som Bygghemma säljer, alltså en
--     annan produkt än den vi får levererad.
--   * Handduken såldes i fem färger och storleken 90 × 150. Nevada finns i
--     två färger (vit, mörkgrå) och tre storlekar (50 × 70, 70 × 140,
--     100 × 150). 90 × 150 existerar inte.
--   * Örngottets tre storlekar (50 × 60, 50 × 70, 60 × 80) var alla påhittade.
--     Franzén gör örngott i 55 × 75, i två kvaliteter.
--   * Påslakan 220 × 230 och våffelrocken i beige/brun/grå fanns inte heller.
--     Alla tre låg dessutom prissatta *under* sina belagda syskon, vilket
--     avslöjar dem som orörda platshållare: 2,4×-passet hade inget
--     inköpspris att räkna på och hoppade över dem.
--   * MOR-SKO-LUV betyder luva. Artikel 2660001 har sjalkrage och ingen luva;
--     varianten är i själva verket brodyrtillvalet. SKU:n påstod alltså en
--     produktegenskap som inte finns.
--
-- Inget av detta gick att se i butiken, eftersom samtliga Franzén-varianter
-- står active = false i väntan på att sortimentet ska tas i drift. Det är
-- också därför den här migrationen vågar radera i stället för att arkivera:
-- ingen av de raderade varianterna är refererad av en order, en kundvagn, en
-- lagerrörelse, en reservation eller en bild (kontrollerat 2026-08-26), och
-- ingen av dem har ett stripe_price_id.
--
-- De nya varianterna läggs in med samma flaggor som sina syskon (alltså
-- fortsatt active = false) och prissätts med samma regel som prouct_list.md
-- dokumenterar: 2,4 × inköpspriset, avrundat till närmaste femkrona.
--
-- `vendor` sätts till Linnevik på samtliga. Franzéns egna varumärken i filen
-- (Textilgruppen, Borganäs of Sweden) är medvetet inte det kunden ska se: vi
-- säljer i eget namn, och artikelnamnet är dessutom sökbart hos Sovtex och
-- Bygghemma, som säljer flera av artiklarna billigare till slutkund.

-- ---------------------------------------------------------------------------
-- 1. Bort med varianter som inte motsvarar någon artikel hos Franzén.
-- ---------------------------------------------------------------------------

DELETE FROM "product_variants"
WHERE "sku" IN (
  -- Handduk: färger Franzén inte gör, och storleken 90 × 150 som inte finns.
  'HAN-ENZ-BEI-5070', 'HAN-ENZ-BEI-90150',
  'HAN-ENZ-BRU-5070', 'HAN-ENZ-BRU-90150',
  'HAN-ENZ-GRO-5070', 'HAN-ENZ-GRO-90150',
  'HAN-ENZ-VIT-90150', 'HAN-ENZ-GRA-90150',
  -- Örngott: alla tre storlekarna påhittade.
  'ORN-5060', 'ORN-5070', 'ORN-6080',
  -- Påslakan: Franzén har bara 150 × 230.
  'PAS-220230',
  -- Våffelbadrock: Franzén har bara vit.
  'MOR-VAF-BEI', 'MOR-VAF-BRU', 'MOR-VAF-GRA'
);

-- ---------------------------------------------------------------------------
-- 2. Döp om de varianter vars SKU påstod något falskt.
--    stripe_lookup_key följer SKU:n (linnevik_<sku i gemener med _>), så den
--    måste skrivas om i samma andetag — annars pekar nyckeln på ett namn som
--    inte längre finns. Ingen av dem har hunnit få ett stripe_price_id.
-- ---------------------------------------------------------------------------

UPDATE "product_variants" SET
  "sku" = 'HAN-NEV-VIT-5070',
  "stripe_lookup_key" = 'linnevik_han_nev_vit_5070',
  "option_values" = '[{"name":"Färg","value":"Vit"},{"name":"Storlek","value":"50 x 70"}]'::jsonb,
  "position" = 0,
  "updated_at" = now()
WHERE "sku" = 'HAN-ENZ-VIT-5070';

-- Franzén kallar färgen mörkgrå, inte grå. Artikel 2649343.
UPDATE "product_variants" SET
  "sku" = 'HAN-NEV-GRA-5070',
  "stripe_lookup_key" = 'linnevik_han_nev_gra_5070',
  "option_values" = '[{"name":"Färg","value":"Mörkgrå"},{"name":"Storlek","value":"50 x 70"}]'::jsonb,
  "position" = 3,
  "updated_at" = now()
WHERE "sku" = 'HAN-ENZ-GRA-5070';

-- SKO stod för Skönrock, ett namn vi inte längre använder; FRO för frotté,
-- som är vad artikeln faktiskt är.
UPDATE "product_variants" SET
  "sku" = 'MOR-FRO-STD',
  "stripe_lookup_key" = 'linnevik_mor_fro_std',
  "position" = 0,
  "updated_at" = now()
WHERE "sku" = 'MOR-SKO-STD';

-- LUV (luva) → BRO (brodyr). Brodyren är vår egen tjänst ovanpå artikeln,
-- inte en egen artikel hos Franzén — därför ingen egen artikelkoppling.
UPDATE "product_variants" SET
  "sku" = 'MOR-FRO-BRO',
  "stripe_lookup_key" = 'linnevik_mor_fro_bro',
  "position" = 1,
  "updated_at" = now()
WHERE "sku" = 'MOR-SKO-LUV';

UPDATE "product_variants" SET
  "option_values" = '[{"name":"Färg","value":"Vit"}]'::jsonb,
  "position" = 0,
  "updated_at" = now()
WHERE "sku" = 'MOR-VAF-VIT';

UPDATE "product_variants" SET
  "option_values" = '[{"name":"Storlek","value":"150 x 230"}]'::jsonb,
  "position" = 0,
  "updated_at" = now()
WHERE "sku" = 'PAS-150230';

UPDATE "product_variants" SET
  "option_values" = '[{"name":"Storlek","value":"150 x 280"}]'::jsonb,
  "position" = 0,
  "updated_at" = now()
WHERE "sku" = 'LAK-150280';

UPDATE "product_variants" SET
  "option_values" = '[{"name":"Storlek","value":"240 x 280"}]'::jsonb,
  "position" = 1,
  "updated_at" = now()
WHERE "sku" = 'LAK-240280';

-- ---------------------------------------------------------------------------
-- 3. In med de storlekar och kvaliteter Franzén faktiskt levererar.
--    Flaggor ärvs från ett syskon i samma produkt, så att de nya raderna
--    hamnar i exakt samma läge som resten av sortimentet (active = false).
-- ---------------------------------------------------------------------------

-- Nevada vit 70 × 140, artikel 2649401, inköp 41,50 → 41,50 × 2,4 ≈ 100.
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT v."product_id", 'HAN-NEV-VIT-70140',
       '[{"name":"Färg","value":"Vit"},{"name":"Storlek","value":"70 x 140"}]'::jsonb,
       10000, v."currency", 0, 0, v."inventory_tracked",
       v."available_for_sale", v."active", v."minimum_order_quantity",
       v."order_increment", 1, 'linnevik_han_nev_vit_70140'
FROM "product_variants" v WHERE v."sku" = 'HAN-NEV-VIT-5070';

-- Nevada vit 100 × 150, artikel 2649501, inköp 65 → 65 × 2,4 = 156 ≈ 155.
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT v."product_id", 'HAN-NEV-VIT-100150',
       '[{"name":"Färg","value":"Vit"},{"name":"Storlek","value":"100 x 150"}]'::jsonb,
       15500, v."currency", 0, 0, v."inventory_tracked",
       v."available_for_sale", v."active", v."minimum_order_quantity",
       v."order_increment", 2, 'linnevik_han_nev_vit_100150'
FROM "product_variants" v WHERE v."sku" = 'HAN-NEV-VIT-5070';

-- Nevada mörkgrå 70 × 140, artikel 2649443, inköp 59 → 59 × 2,4 ≈ 140.
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT v."product_id", 'HAN-NEV-GRA-70140',
       '[{"name":"Färg","value":"Mörkgrå"},{"name":"Storlek","value":"70 x 140"}]'::jsonb,
       14000, v."currency", 0, 0, v."inventory_tracked",
       v."available_for_sale", v."active", v."minimum_order_quantity",
       v."order_increment", 4, 'linnevik_han_nev_gra_70140'
FROM "product_variants" v WHERE v."sku" = 'HAN-NEV-GRA-5070';

-- Nevada mörkgrå 100 × 150, artikel 2649543, inköp 79 → 79 × 2,4 ≈ 190.
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT v."product_id", 'HAN-NEV-GRA-100150',
       '[{"name":"Färg","value":"Mörkgrå"},{"name":"Storlek","value":"100 x 150"}]'::jsonb,
       19000, v."currency", 0, 0, v."inventory_tracked",
       v."available_for_sale", v."active", v."minimum_order_quantity",
       v."order_increment", 5, 'linnevik_han_nev_gra_100150'
FROM "product_variants" v WHERE v."sku" = 'HAN-NEV-GRA-5070';

-- Örngott satinrand 22 mm 55 × 75, artikel 2669301, inköp 20 → 20 × 2,4 = 48 ≈ 50.
-- Samma vävnad som påslakanet (184 TC) och avsett att bäddas ihop med det.
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT p."id", 'ORN-SAT-5575',
       '[{"name":"Kvalitet","value":"Satinrand 22 mm"}]'::jsonb,
       5000, 'sek', 0, 0, true, true, false, 1, 1, 0, 'linnevik_orn_sat_5575'
FROM "products" p WHERE p."handle" = 'orngott';

-- Örngott bomull/polyester 55 × 75, artikel 2690901, inköp 12,50 → 12,50 × 2,4 = 30.
-- Samma vävnad som lakanet (136 TC).
INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "position", "stripe_lookup_key"
)
SELECT p."id", 'ORN-BP-5575',
       '[{"name":"Kvalitet","value":"Bomull/polyester 136 TC"}]'::jsonb,
       3000, 'sek', 0, 0, true, true, false, 1, 1, 1, 'linnevik_orn_bp_5575'
FROM "products" p WHERE p."handle" = 'orngott';

-- ---------------------------------------------------------------------------
-- 4. Produktnamn, varumärke och texter.
-- ---------------------------------------------------------------------------

-- Handduken: Enzo → Nevada, och storlekarna/färgerna skrivs ut i texten.
UPDATE "products" SET
  "title" = 'Frottéhandduk Nevada',
  "title_en" = 'Terry towel Nevada',
  "vendor" = 'Linnevik',
  "description_html" = '<p>Frottéhandduk i serien Nevada, 450 g/m², med stapelbård och hängare på kortsidorna — den kvalitet som ligger på hotellrum runt om i Sverige.</p>
<ul>
<li>
<strong>Storlekar:</strong> 50 × 70, 70 × 140 och 100 × 150 cm</li>
<li>
<strong>Färger:</strong> Vit och mörkgrå</li>
<li>
<strong>Material:</strong> 100 % bomull</li>
<li>
<strong>Gramvikt:</strong> 450 g/m²</li>
<li>
<strong>Konstruktion:</strong> 16/1 pile, 16/1 weft, 10/1 ground</li>
<li>
<strong>Detaljer:</strong> Stapelbård, hängare på kortsidorna</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel</li>
<li>
<strong>Certifiering:</strong> EU Ecolabel (NOR/016/006), gäller den vita</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>
<p>För brodyr och övrig anpassning, kontakta oss <a href="/contact">här</a>.</p>',
  "description_html_en" = '<p>Terry towel from the Nevada range, 450 gsm, with a stacked border and hanging loops on the short sides — the quality found in hotel rooms across Sweden.</p>
<ul>
<li>
<strong>Sizes:</strong> 50 × 70, 70 × 140 and 100 × 150 cm</li>
<li>
<strong>Colours:</strong> White and dark grey</li>
<li>
<strong>Material:</strong> 100% cotton</li>
<li>
<strong>Weight:</strong> 450 gsm</li>
<li>
<strong>Construction:</strong> 16/1 pile, 16/1 weft, 10/1 ground</li>
<li>
<strong>Details:</strong> Stacked border, hanging loops on the short sides</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach</li>
<li>
<strong>Certification:</strong> EU Ecolabel (NOR/016/006), applies to the white</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>
<p>For embroidery and other customisation, contact us <a href="/contact">here</a>.</p>',
  "updated_at" = now()
WHERE "handle" = 'handduk-ludde';

-- Örngottet hade ingen text alls. Den skrivs mot 2669301 och 2690901.
UPDATE "products" SET
  "vendor" = 'Linnevik',
  "description_html" = '<p>Hotellörngott i 55 × 75 cm, bulkpackat för storhushåll och ej konsumentförpackat. Finns i två kvaliteter: samma vävda satinrand som påslakanet, eller en slätvävd bomull/polyester som matchar lakanet.</p>
<ul>
<li>
<strong>Storlek:</strong> 55 × 75 cm</li>
<li>
<strong>Material:</strong> 52 % polyester, 48 % bomull</li>
<li>
<strong>Trådtäthet:</strong> 184 TC (36×36/108×76) med satinrand, 136 TC (24×24/68×68) i bomull/polyester</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX MADE IN GREEN (M2AMPWK20 AITEX) för satinrand, OEKO-TEX (2019OK1170) för bomull/polyester</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>
<p>Satinrandsvarianten är samma vävnad som påslakanet och är gjord för att bäddas ihop med det.</p>',
  "description_html_en" = '<p>Hotel pillowcase in 55 × 75 cm, bulk-packed for commercial laundries and not consumer-packaged. Available in two qualities: the same woven satin stripe as the duvet cover, or a plain-weave cotton/polyester matching the sheet.</p>
<ul>
<li>
<strong>Size:</strong> 55 × 75 cm</li>
<li>
<strong>Material:</strong> 52% polyester, 48% cotton</li>
<li>
<strong>Thread count:</strong> 184 TC (36×36/108×76) for the satin stripe, 136 TC (24×24/68×68) for the cotton/polyester</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach</li>
<li>
<strong>Certification:</strong> OEKO-TEX MADE IN GREEN (M2AMPWK20 AITEX) for the satin stripe, OEKO-TEX (2019OK1170) for the cotton/polyester</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>
<p>The satin-stripe version is the same weave as the duvet cover and is made to be bedded together with it.</p>',
  "updated_at" = now()
WHERE "handle" = 'orngott';

-- Påslakanet: storleken skrivs ut, och satinranden flyttar upp i namnet.
UPDATE "products" SET
  "title" = 'Påslakan satinrand 22 mm',
  "title_en" = 'Duvet cover, 22 mm satin stripe',
  "vendor" = 'Linnevik',
  "description_html" = replace(
    "description_html",
    '<li>
<strong>Material:</strong>',
    '<li>
<strong>Storlek:</strong> 150 × 230 cm</li>
<li>
<strong>Material:</strong>'
  ),
  "description_html_en" = replace(
    "description_html_en",
    '<li>
<strong>Material:</strong>',
    '<li>
<strong>Size:</strong> 150 × 230 cm</li>
<li>
<strong>Material:</strong>'
  ),
  "updated_at" = now()
WHERE "handle" = 'paslakan';

-- Skönrock var vårt eget påhitt; Franzén kallar artikeln badrock 360 g unisex.
UPDATE "products" SET
  "title" = 'Badrock frotté 360 g',
  "title_en" = 'Bathrobe, terry 360 gsm',
  "vendor" = 'Linnevik',
  "updated_at" = now()
WHERE "handle" = 'morgonrock';

-- Våffelrocken: Franzéns benämning, och färgen skrivs ut nu när den är den enda.
UPDATE "products" SET
  "title" = 'Våffelbadrock 200 g',
  "title_en" = 'Waffle bathrobe 200 gsm',
  "vendor" = 'Linnevik',
  "description_html" = replace(
    "description_html",
    '<li>
<strong>Storlek:</strong> XL</li>',
    '<li>
<strong>Storlek:</strong> XL</li>
<li>
<strong>Färg:</strong> Vit</li>'
  ),
  "description_html_en" = replace(
    "description_html_en",
    '<li>
<strong>Size:</strong> XL</li>',
    '<li>
<strong>Size:</strong> XL</li>
<li>
<strong>Colour:</strong> White</li>'
  ),
  "updated_at" = now()
WHERE "handle" = 'morgonrock-vaffel';

-- Lakanet var redan rätt mot artikelfilen; bara varumärket stod fel.
UPDATE "products" SET "vendor" = 'Linnevik', "updated_at" = now()
WHERE "handle" = 'lakan';

-- ---------------------------------------------------------------------------
-- 5. Handlen är adressen, och "ludde" var ett tredje påhittat namn på samma
--    handduk (handle = ludde, titel = Enzo, artikel = Nevada). Den byter till
--    serienamnet, med en omdirigering från den gamla adressen — se
--    redirectsDb.ts. Övriga handlar får stå: "morgonrock" och "badrock" är
--    synonymer, inte ett felaktigt påstående, och varje handle-byte kostar en
--    adress.
-- ---------------------------------------------------------------------------

DELETE FROM "url_redirects" WHERE "from_path" = '/products/frottehandduk-nevada';

UPDATE "url_redirects"
SET "to_path" = '/products/frottehandduk-nevada'
WHERE "to_path" = '/products/handduk-ludde';

INSERT INTO "url_redirects" ("from_path", "to_path", "kind", "created_by")
SELECT '/products/handduk-ludde', '/products/frottehandduk-nevada', 'product', 'migration 0033'
WHERE EXISTS (SELECT 1 FROM "products" WHERE "handle" = 'handduk-ludde');

UPDATE "products" SET "handle" = 'frottehandduk-nevada', "updated_at" = now()
WHERE "handle" = 'handduk-ludde';
