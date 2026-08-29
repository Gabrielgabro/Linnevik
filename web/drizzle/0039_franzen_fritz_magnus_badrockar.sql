-- Fritz Magnus badrockar in i katalogen.
--
-- Franzéns artikelfil (163455-product-data.xlsx, 60 artiklar) innehåller bara
-- Borganäs och Textilgruppen. Deras andra varumärke, **Fritz Magnus Trading**,
-- finns inte i filen alls — main.md noterade redan att det "inte är uppdelat
-- per kategori på sajten", men slutsatsen blev att sortimentet saknades.
-- Det gjorde det inte: det ligger bakom inloggningen. En skrapning av
-- badrockskategorin 2026-08-29 (catalog/external_suppliers/franzen/
-- hidden_products/Badrock_produkter_franzenstextil.xlsx) gav sex artiklar vi
-- inte sålde, alla premium och alla dyrare än de två vi hade.
--
-- Det här stänger också frågan prouct_list.md lämnade öppen: den gamla
-- "Skönrock"-texten beskrev velour på utsidan och frotté på insidan, vilket
-- inte stämde på 2660001 — "om det faktiskt är en velourrock vi vill sälja så
-- är det inte den här artikeln, och då behöver en annan källa fram". Prestige,
-- Alexia och Gossip *är* den rocken: 100 % bomull, velour ute, frotté inne,
-- 380 g/m².
--
-- Sex artiklar blir fyra produkter: Prestige och Alexia har ett artikelnummer
-- per storlek (M och XL) till samma pris, alltså två storleksvarianter under
-- en produkt. Gap och Gossip finns bara i one-size.
--
-- Pris: samma regel som 0033 och prouct_list.md, 2,4 × inköpspriset avrundat
-- till närmaste femkrona. Franzéns rek. utpris ligger långt över det (1 750 –
-- 2 295 kr) — regeln följs här för att sortimentet ska hänga ihop, inte för
-- att 2,4× är rätt för premiumrockar. Se noteringen sist i filen.
--
-- `supplier_cost_minor` sätts på varianterna, till skillnad från Nevada där
-- kolumnen just rensades. Skälet är att de här artiklarna inte finns i
-- artikelfilen: `articleForSku` svarar null för dem, så det handskrivna priset
-- är det enda inköpspris som finns. Det är precis det fallet kolumnen byggdes
-- för i 0038.
--
-- `vendor` = 'Linnevik' på samtliga, samma regel som 0033: vi säljer i eget
-- namn, och "Fritz Magnus" är sökbart hos andra återförsäljare.
--
-- Bilder: inga. Skrapningen gav produktlänkar men inga filer, och till skillnad
-- från de övriga Franzén-produkterna finns ingen bildmapp i katalogen. Bilderna
-- måste in separat innan produkterna är presentabla i butiken.

-- ---------------------------------------------------------------------------
-- 1. Produkterna
-- ---------------------------------------------------------------------------

INSERT INTO "products" (
  "handle", "title", "title_en", "description_html", "description_html_en",
  "vendor", "supplier", "tags", "active", "status", "source", "published_at"
) VALUES
(
  'morgonrock-gap',
  'Badrock Gap våffel 270 g',
  'Bathrobe Gap, waffle 270 gsm',
  '<p>Nätt badrock i mjuk våffelkvalitet med sjalkrage och vit satinpasspoal vid öppning och fickor. Tvätt, torkning och frakt till tvätteriet blir effektivare än för en velour- eller frottérock — det går 2–3 våffelrockar på en frottérock i volym.</p>
<ul>
<li>
<strong>Material:</strong> 60 % bomull, 40 % polyester</li>
<li>
<strong>Gramvikt:</strong> 270 g/m²</li>
<li>
<strong>Konstruktion:</strong> Våffelkvalitet, sjalkrage, vit passpoal på krage och fickor</li>
<li>
<strong>Storlek:</strong> One size (XL)</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Egenskaper:</strong> Krymper 3–4 %; tyget är krymptestat före sömnad</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60°, all blekning tillåten, torktumling normal temperatur, strykning 2 prickar, får ej kemtvättas</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Serie:</strong> Gap</li>
</ul>',
  '<p>A slim bathrobe in soft waffle weave with a shawl collar and white satin piping at the opening and pockets. Washing, drying and laundry transport are more efficient than for a velour or terry robe — two to three waffle robes take the volume of one terry robe.</p>
<ul>
<li>
<strong>Material:</strong> 60% cotton, 40% polyester</li>
<li>
<strong>Weight:</strong> 270 gsm</li>
<li>
<strong>Construction:</strong> Waffle weave, shawl collar, white piping on collar and pockets</li>
<li>
<strong>Size:</strong> One size (XL)</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Properties:</strong> Shrinks 3–4%; fabric shrink-tested before making up</li>
<li>
<strong>Care:</strong> Machine wash at 60°, any bleach permitted, tumble dry normal, iron 2 dots, do not dry clean</li>
<li>
<strong>Certification:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Range:</strong> Gap</li>
</ul>',
  'Linnevik', 'Franzén Textil i Kinna', ARRAY[]::text[], true, 'active', 'linnevik', now()
),
(
  'morgonrock-prestige',
  'Badrock Prestige velour 380 g',
  'Bathrobe Prestige, velour 380 gsm',
  '<p>Premiumbadrock i följsam velour med sjalkrage och vit satinpasspoal vid både ärmslut och öppning. Frotté på insidan för absorptionen, velour på utsidan för känslan och torktiden. För hotell som vill ge gästen en extra lyxig upplevelse.</p>
<ul>
<li>
<strong>Material:</strong> 100 % bomull</li>
<li>
<strong>Gramvikt:</strong> 380 g/m²</li>
<li>
<strong>Konstruktion:</strong> Enkelgarn på insidan, velour på utsidan, ringspunnet</li>
<li>
<strong>Detaljer:</strong> Sjalkrage, satinpasspoal, velour och brodyr i nacken</li>
<li>
<strong>Storlekar:</strong> M och XL</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60°, all blekning tillåten, torktumling normal temperatur, strykning 2 prickar, får ej kemtvättas</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Serie:</strong> Prestige</li>
</ul>',
  '<p>A premium bathrobe in supple velour with a shawl collar and white satin piping at both cuffs and opening. Terry inside for absorbency, velour outside for the feel and the drying time. For hotels that want to give the guest a distinctly luxurious experience.</p>
<ul>
<li>
<strong>Material:</strong> 100% cotton</li>
<li>
<strong>Weight:</strong> 380 gsm</li>
<li>
<strong>Construction:</strong> Single yarn inside, velour outside, ring-spun</li>
<li>
<strong>Details:</strong> Shawl collar, satin piping, velour and embroidery at the neck</li>
<li>
<strong>Sizes:</strong> M and XL</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60°, any bleach permitted, tumble dry normal, iron 2 dots, do not dry clean</li>
<li>
<strong>Certification:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Range:</strong> Prestige</li>
</ul>',
  'Linnevik', 'Franzén Textil i Kinna', ARRAY[]::text[], true, 'active', 'linnevik', now()
),
(
  'morgonrock-gossip',
  'Badrock Gossip velour kimono 380 g',
  'Bathrobe Gossip, velour kimono 380 gsm',
  '<p>Mjuk och nätt badrock i kimonomodell. Velouren är lätt och behaglig att bära, och dekorativa stickningar vid öppning och ärmslut ger rocken ett stramare uttryck. Frotté på insidan ger god absorptionsförmåga.</p>
<ul>
<li>
<strong>Material:</strong> 100 % bomull</li>
<li>
<strong>Gramvikt:</strong> 380 g/m²</li>
<li>
<strong>Konstruktion:</strong> Kimonokrage. Enkelgarn på insidan, velour på utsidan, ringspunnet</li>
<li>
<strong>Detaljer:</strong> Velour i nacken, dekorativa stickningar, anpassade fickor</li>
<li>
<strong>Storlek:</strong> One size (XL)</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60°, all blekning tillåten, torktumling normal temperatur, strykning 2 prickar, får ej kemtvättas</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Serie:</strong> Gossip</li>
</ul>',
  '<p>A soft, slim bathrobe in a kimono cut. The velour is light and comfortable to wear, and decorative stitching at the opening and cuffs gives the robe a crisper line. Terry inside for good absorbency.</p>
<ul>
<li>
<strong>Material:</strong> 100% cotton</li>
<li>
<strong>Weight:</strong> 380 gsm</li>
<li>
<strong>Construction:</strong> Kimono collar. Single yarn inside, velour outside, ring-spun</li>
<li>
<strong>Details:</strong> Velour at the neck, decorative stitching, shaped pockets</li>
<li>
<strong>Size:</strong> One size (XL)</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60°, any bleach permitted, tumble dry normal, iron 2 dots, do not dry clean</li>
<li>
<strong>Certification:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Range:</strong> Gossip</li>
</ul>',
  'Linnevik', 'Franzén Textil i Kinna', ARRAY[]::text[], true, 'active', 'linnevik', now()
),
(
  'morgonrock-alexia',
  'Badrock Alexia velour 380 g',
  'Bathrobe Alexia, velour 380 gsm',
  '<p>Badrock i randigt jacquardmönster med sjalkrage och en broderad krona i nacken. Frotté med singelöglor på insidan tar upp fukten, velouren på utsidan torkar lättare än en ren frottérock.</p>
<ul>
<li>
<strong>Material:</strong> 100 % bomull</li>
<li>
<strong>Gramvikt:</strong> 380 g/m²</li>
<li>
<strong>Konstruktion:</strong> Velourrand i jacquard, sjalkrage. Frotté singelöglor på insidan, velour på utsidan, ringspunnet</li>
<li>
<strong>Detaljer:</strong> Velour och broderad krona i nacken, unika fickor</li>
<li>
<strong>Storlekar:</strong> M och XL</li>
<li>
<strong>Färg:</strong> Vit</li>
<li>
<strong>Tvätt:</strong> Maskintvätt 60°, all blekning tillåten, torktumling normal temperatur, strykning 2 prickar, får ej kemtvättas</li>
<li>
<strong>Certifiering:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Serie:</strong> Alexia</li>
</ul>',
  '<p>A bathrobe in a striped jacquard weave with a shawl collar and an embroidered crown at the neck. Single-loop terry inside takes up the moisture; the velour outside dries faster than a plain terry robe.</p>
<ul>
<li>
<strong>Material:</strong> 100% cotton</li>
<li>
<strong>Weight:</strong> 380 gsm</li>
<li>
<strong>Construction:</strong> Jacquard velour stripe, shawl collar. Single-loop terry inside, velour outside, ring-spun</li>
<li>
<strong>Details:</strong> Velour and an embroidered crown at the neck, distinctive pockets</li>
<li>
<strong>Sizes:</strong> M and XL</li>
<li>
<strong>Colour:</strong> White</li>
<li>
<strong>Care:</strong> Machine wash at 60°, any bleach permitted, tumble dry normal, iron 2 dots, do not dry clean</li>
<li>
<strong>Certification:</strong> OEKO-TEX 13.HTR.35669 (Hohenstein Laboratories)</li>
<li>
<strong>Range:</strong> Alexia</li>
</ul>',
  'Linnevik', 'Franzén Textil i Kinna', ARRAY[]::text[], true, 'active', 'linnevik', now()
)
ON CONFLICT ("handle") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Varianterna
-- ---------------------------------------------------------------------------
--
-- Lagersaldot sätts till 1000 direkt, samma nivå som resten av
-- Franzén-sortimentet ligger på. `purchase_batch_size` är "Antal per kartong"
-- ur skrapningen — det är den post vi faktiskt tar hem, inte
-- `order_increment`, som är kundens steg i kassan och förblir 1.

INSERT INTO "product_variants" (
  "product_id", "sku", "option_values", "price_minor", "currency",
  "inventory_quantity", "inventory_reserved", "inventory_tracked",
  "available_for_sale", "active", "minimum_order_quantity", "order_increment",
  "supplier_cost_minor", "purchase_batch_size", "position", "stripe_lookup_key"
)
SELECT p."id", d."sku", d."option_values"::jsonb, d."price_minor", 'sek',
       1000, 0, true, true, true, 1, 1,
       d."cost_minor", d."batch", d."position", d."lookup_key"
FROM (VALUES
  -- Gap, artikel 7703101. Inköp 360 → 360 × 2,4 = 864 ≈ 865.
  ('morgonrock-gap', 'MOR-GAP-VIT',
   '[{"name":"Storlek","value":"One size (XL)"}]', 86500, 36000, 20, 0,
   'linnevik_mor_gap_vit'),

  -- Prestige, artiklarna 7705200 (M) och 7705300 (XL), samma pris.
  -- Inköp 400 → 400 × 2,4 = 960.
  ('morgonrock-prestige', 'MOR-PRE-VIT-M',
   '[{"name":"Storlek","value":"M"}]', 96000, 40000, 8, 0,
   'linnevik_mor_pre_vit_m'),
  ('morgonrock-prestige', 'MOR-PRE-VIT-XL',
   '[{"name":"Storlek","value":"XL"}]', 96000, 40000, 8, 1,
   'linnevik_mor_pre_vit_xl'),

  -- Gossip, artikel 7707100. Inköp 325 → 325 × 2,4 = 780.
  ('morgonrock-gossip', 'MOR-GOS-VIT',
   '[{"name":"Storlek","value":"One size (XL)"}]', 78000, 32500, 10, 0,
   'linnevik_mor_gos_vit'),

  -- Alexia, artiklarna 7709200 (M) och 7709400 (XL), samma pris.
  -- Inköp 435 → 435 × 2,4 = 1044 ≈ 1045.
  ('morgonrock-alexia', 'MOR-ALE-VIT-M',
   '[{"name":"Storlek","value":"M"}]', 104500, 43500, 10, 0,
   'linnevik_mor_ale_vit_m'),
  ('morgonrock-alexia', 'MOR-ALE-VIT-XL',
   '[{"name":"Storlek","value":"XL"}]', 104500, 43500, 8, 1,
   'linnevik_mor_ale_vit_xl')
) AS d("handle", "sku", "option_values", "price_minor", "cost_minor", "batch", "position", "lookup_key")
JOIN "products" p ON p."handle" = d."handle"
ON CONFLICT ("sku") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Att göra härefter, som inte kan göras i SQL
-- ---------------------------------------------------------------------------
--
-- 1. BILDER. Ingen av de fyra produkterna har någon bild. Filerna ligger inte i
--    katalogen och skrapningen gav bara produktlänkar. Tills bilderna är på
--    plats visar butiken fyra bildlösa produkter.
--
-- 2. STRIPE. `scripts/push-stripe-franzen.mjs --apply` skapar Stripe-produkter
--    för de nya handles. Inga Stripe-priser skapas, med flit — se skriptet.
--
-- 3. PRISET. 2,4×-regeln ger 865 / 960 / 780 / 1045 kr. Franzéns rek. utpris
--    för samma rockar är 1 795 / 2 195 / 1 750 / 2 295 kr, alltså ungefär det
--    dubbla. Regeln är byggd för frotté och basartiklar där marknaden är
--    genomskinlig; för premiumrockar där konkurrenten inte säljer samma artikel
--    är den sannolikt för försiktig. Prissättningen bör tas om i /admin/franzen
--    när marknadsdata för de här fyra finns.
