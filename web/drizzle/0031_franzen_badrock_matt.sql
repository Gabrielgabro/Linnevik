-- Måtten på badrocken står inte i artikelfilen — kolumnen Mått är tom för
-- 2660001 — utan i måttskissen som låg med bland bilderna (Rock.png i
-- artikelmappen). Den är nu sista bilden i galleriet, och måtten hör hemma i
-- specifikationen också: "one-size" säger ingenting till en hotellinköpare.
UPDATE "products" SET
  "description_html" = replace(
    "description_html",
    '<strong>Passform:</strong> Unisex, one-size</li>',
    '<strong>Passform:</strong> Unisex, one-size (XL)</li>
<li>
<strong>Mått:</strong> Längd 128 cm, bröstvidd 72 cm, ärmlängd 50 cm, nedre vidd 162 cm, fickor 20 × 18 cm, skärp 210 × 4 cm</li>'
  ),
  "description_html_en" = replace(
    "description_html_en",
    '<strong>Fit:</strong> Unisex, one size</li>',
    '<strong>Fit:</strong> Unisex, one size (XL)</li>
<li>
<strong>Measurements:</strong> Length 128 cm, chest 72 cm, sleeve 50 cm, bottom width 162 cm, pockets 20 × 18 cm, belt 210 × 4 cm</li>'
  ),
  "updated_at" = now()
WHERE "handle" = 'morgonrock';
