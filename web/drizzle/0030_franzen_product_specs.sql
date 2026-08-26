-- Franzén skickade sin artikelfil 2026-08-26 (163455-product-data.xlsx, 60
-- artiklar) med material, konstruktion, trådtäthet, tvättråd, certifiering,
-- EAN och inköpspris. Fram tills nu var beskrivningarna på de produkter vi
-- köper av dem antingen tomma eller skrivna på gissningar, och priserna satta
-- innan vi visste vad varorna kostar.
--
-- Den här migrationen skriver om beskrivningarna till Franzéns egna uppgifter
-- och sätter priset från deras inköpspris, för de åtta varianter där artikeln
-- och varianten bevisligen är samma produkt i samma storlek. Mappningen bor i
-- src/data/franzenArticles.ts (`skuToArtikelkod`); de varianter som saknar
-- motsvarighet hos Franzén står i
-- catalog/external_suppliers/franzen/prouct_list.md och rörs inte här.
--
-- Prissättningen följer påslaget på våra egna produkter, som ligger mellan
-- 2,05× och 3,30× landad kostnad (Eric 2,05×, Madrasskydd 2,14×, Daniel 2,36×,
-- Sigrid 2,55×, Sebastian 3,30×). Här används 2,4× inköpspriset, avrundat till
-- närmaste femkrona. Observera att Franzéns pris är exklusive inkommande frakt
-- till oss, medan de egna produkternas landade kostnad har frakt och tull
-- inräknad — påslaget är alltså i praktiken något lägre än 2,4×.
--
-- Leverantören är redan satt i 0029 och rörs inte.

-- Lakan — artikel 2676101 (150x280) och 2676301 (240x280).
UPDATE "products" SET
  "description_html" = '<p>Hotellakan i bomull/polyester med vävd märktråd, bulkpackat för storhushåll och ej konsumentförpackat.</p>
<ul>
<li>
<strong>Storlekar:</strong> 150 × 280 cm (grön märktråd) och 240 × 280 cm (blå märktråd)</li>
<li>
<strong>Material:</strong> 52 % bomull, 48 % polyester</li>
<li>
<strong>Trådtäthet:</strong> 136 TC (24×24/68×68)</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel</li>
<li>
<strong>Certifiering:</strong> MADE IN GREEN (M2AMPH3V5)</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>
<p>Bomull- och polyesterblandningen gör lakanet tåligt och ger kortare torktid. Olika märktråd per storlek gör det lätt att sortera i tvätten.</p>',
  "description_html_en" = '<p>Hotel sheet in a cotton/polyester blend with a woven marking thread, bulk-packed for commercial laundries and not consumer-packaged.</p>
<ul>
<li>
<strong>Sizes:</strong> 150 × 280 cm (green marking thread) and 240 × 280 cm (blue marking thread)</li>
<li>
<strong>Material:</strong> 52% cotton, 48% polyester</li>
<li>
<strong>Thread count:</strong> 136 TC (24×24/68×68)</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach</li>
<li>
<strong>Certification:</strong> MADE IN GREEN (M2AMPH3V5)</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>
<p>The cotton/polyester blend makes the sheet hard-wearing and quicker to dry. A different marking thread per size keeps the laundry easy to sort.</p>',
  "updated_at" = now()
WHERE "handle" = 'lakan';

-- Påslakan — artikel 2669101. Storleken står inte i listan: varianten
-- 220x230 saknar motsvarighet hos Franzén, och en storleksrad hade motsagt
-- variantväljaren.
UPDATE "products" SET
  "description_html" = '<p>Hotellpåslakan med vävd satinrand på 22 mm, i bomull/polyester.</p>
<ul>
<li>
<strong>Material:</strong> 52 % polyester, 48 % bomull</li>
<li>
<strong>Trådtäthet:</strong> 184 TC (36/36, 108×76)</li>
<li>
<strong>Detalj:</strong> Vävd satinrand, 22 mm</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX MADE IN GREEN (M2AMPWPX7 AITEX)</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>',
  "description_html_en" = '<p>Hotel duvet cover with a woven 22 mm satin stripe, in a cotton/polyester blend.</p>
<ul>
<li>
<strong>Material:</strong> 52% polyester, 48% cotton</li>
<li>
<strong>Thread count:</strong> 184 TC (36/36, 108×76)</li>
<li>
<strong>Detail:</strong> Woven satin stripe, 22 mm</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach</li>
<li>
<strong>Certification:</strong> OEKO-TEX MADE IN GREEN (M2AMPWPX7 AITEX)</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>',
  "updated_at" = now()
WHERE "handle" = 'paslakan';

-- Handduk Enzo — artikel 2649301 (vit) och 2649343 (mörkgrå). EU Ecolabel
-- gäller bara den vita; grå står utan certifiering i Franzéns fil, därför
-- förbehållet i certifieringsraden.
UPDATE "products" SET
  "description_html" = '<p>Frottéhandduk på 450 g/m² med stapelbård och hängare på kortsidorna — den kvalitet som ligger på hotellrum runt om i Sverige.</p>
<ul>
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
  "description_html_en" = '<p>Terry towel at 450 gsm with a stacked border and hanging loops on the short sides — the quality found in hotel rooms across Sweden.</p>
<ul>
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

-- Morgonrock Skönrock — artikel 2660001. Den gamla texten beskrev en helt
-- annan rock: velour på utsidan, frotté på insidan, 450 GSM och färgval på
-- passpoal. Franzéns badrock är 360 g/m², 86/14 bomull/polyester, sjalkrage
-- och one-size. Texten här följer artikeln.
UPDATE "products" SET
  "description_html" = '<p>Badrock i tjock frotté med sjalkrage, två fickor framtill, hängare i nacken och knytskärp i hällor.</p>
<ul>
<li>
<strong>Material:</strong> 86 % bomull, 14 % polyester</li>
<li>
<strong>Gramvikt:</strong> 360 g/m²</li>
<li>
<strong>Konstruktion:</strong> 20/1 pile, 16/1 weft, 20/2 ground</li>
<li>
<strong>Passform:</strong> Unisex, one-size</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel</li>
<li>
<strong>Certifiering:</strong> EU Ecolabel (NOR/016/006)</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>
<p>Brodyr läggs till som tillval. För större anpassningsfrihet, skicka gärna <a title="Kontakta oss" href="/contact">förfrågan</a>.</p>',
  "description_html_en" = '<p>Bathrobe in thick terry with a shawl collar, two front pockets, a hanging loop at the neck and a tie belt in loops.</p>
<ul>
<li>
<strong>Material:</strong> 86% cotton, 14% polyester</li>
<li>
<strong>Weight:</strong> 360 gsm</li>
<li>
<strong>Construction:</strong> 20/1 pile, 16/1 weft, 20/2 ground</li>
<li>
<strong>Fit:</strong> Unisex, one size</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach</li>
<li>
<strong>Certification:</strong> EU Ecolabel (NOR/016/006)</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>
<p>Embroidery is available as an option. For wider customisation, send us an <a title="Contact us" href="/contact">enquiry</a>.</p>',
  "updated_at" = now()
WHERE "handle" = 'morgonrock';

-- Morgonrock våffel — artikel 2662101. Ingen färgrad: Franzén har bara vit,
-- medan produkten har fyra färgvarianter.
UPDATE "products" SET
  "description_html" = '<p>Lätt våffelbadrock på 200 g/m², för spa och hotellrum där frotté blir för tungt.</p>
<ul>
<li>
<strong>Material:</strong> 55 % bomull, 45 % polyester</li>
<li>
<strong>Gramvikt:</strong> 200 g/m²</li>
<li>
<strong>Konstruktion:</strong> 20×20/76×76</li>
<li>
<strong>Storlek:</strong> XL</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60° med tvättmedel, ej blekmedel, ej torktumling</li>
<li>
<strong>Certifiering:</strong> MADE IN GREEN</li>
<li>
<strong>Ursprung:</strong> Pakistan</li>
</ul>',
  "description_html_en" = '<p>Lightweight waffle bathrobe at 200 gsm, for spas and hotel rooms where terry is too heavy.</p>
<ul>
<li>
<strong>Material:</strong> 55% cotton, 45% polyester</li>
<li>
<strong>Weight:</strong> 200 gsm</li>
<li>
<strong>Construction:</strong> 20×20/76×76</li>
<li>
<strong>Size:</strong> XL</li>
<li>
<strong>Care:</strong> Machine wash at 60° with detergent, no bleach, do not tumble dry</li>
<li>
<strong>Certification:</strong> MADE IN GREEN</li>
<li>
<strong>Origin:</strong> Pakistan</li>
</ul>',
  "updated_at" = now()
WHERE "handle" = 'morgonrock-vaffel';

-- Priserna. 2,4× Franzéns inköpspris, avrundat till närmaste femkrona.
-- Brodyrtillägget på Skönrock behålls som det är, 50 kr över standard.
UPDATE "product_variants" AS v SET
  "price_minor" = p."price_minor",
  "updated_at" = now()
FROM (VALUES
  -- sku,                inköp,  påslag → pris
  ('LAK-150280',        12000),  --  50 → 120
  ('LAK-240280',        20500),  --  85 → 205
  ('PAS-150230',        29000),  -- 120 → 290
  ('HAN-ENZ-VIT-5070',   3500),  --  14 → 35
  ('HAN-ENZ-GRA-5070',   5500),  --  22 → 55
  ('MOR-SKO-STD',       42000),  -- 175 → 420
  ('MOR-SKO-LUV',       47000),  -- 175 → 420 + 50 brodyr
  ('MOR-VAF-VIT',       31000)   -- 130 → 310
) AS p("sku", "price_minor")
WHERE v."sku" = p."sku";
