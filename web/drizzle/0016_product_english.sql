-- Produkternas engelska texter var svenska, av exakt samma skäl som
-- kategoriernas var det före 0012: Shopify har ingen engelsk översättning av
-- produkterna, så `@inContext(language: EN)` svarade med den svenska texten och
-- importen skrev in den i title_en och description_html_en.
--
-- Så länge produktsidan läste Shopify syntes det inte som ett fel i vår
-- databas — sajten visade svenska på /en/products/... därför att Shopify svarade
-- svenska. Nu läser produktsidan våra egna kolumner, och då är det de här
-- värdena som är den engelska sajten.
--
-- Varje sats är villkorad på att engelskan fortfarande är den svenska texten
-- rakt av, så att en handskriven rättelse aldrig skrivs över och migreringen går
-- att köra om. `catalog:migrate` har fått samma spärr (coalesce-mönstret från
-- 0012), annars hade nästa import återinfört felet.

-- Titlar. Produktnamnen (Jacob, Alva, Sigrid, Eric, Daniel, Sebastian, Enzo,
-- Skönrock) är egennamn och översätts inte.
UPDATE "products" SET "title_en" = 'Duvet - Jacob'
  WHERE "handle" = 'duvet-jacob' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Towel Enzo'
  WHERE "handle" = 'handduk-ludde' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Hand soap'
  WHERE "handle" = 'handtval' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Pillow Alva'
  WHERE "handle" = 'kudde-medium' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Pillow Sigrid'
  WHERE "handle" = 'kudde-premium' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Pillow protector'
  WHERE "handle" = 'kuddeskydd' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Flat sheet'
  WHERE "handle" = 'lakan' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Mattress protector'
  WHERE "handle" = 'madrasskydd' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Bathrobe - Skönrock'
  WHERE "handle" = 'morgonrock' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Bathrobe - waffle'
  WHERE "handle" = 'morgonrock-vaffel' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Pillowcase'
  WHERE "handle" = 'orngott' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Duvet cover'
  WHERE "handle" = 'paslakan' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Pillow Eric'
  WHERE "handle" = 'standard-kudde' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Duvet - Daniel'
  WHERE "handle" = 'tacke-daniel' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Duvet - Sebastian'
  WHERE "handle" = 'tacke-sebastian' AND "title_en" = "title";

UPDATE "products" SET "title_en" = 'Slippers'
  WHERE "handle" = 'tofflor' AND "title_en" = "title";

-- Beskrivningar. Uppmärkningen behålls som den är — samma taggar, samma
-- klassnamn — så att den engelska sidan renderas identiskt med den svenska.
-- Klasserna kommer från Shopifys editor och betyder inget för vår CSS, men att
-- byta dem här hade gjort diffen omöjlig att jämföra mot originalet.
UPDATE "products"
   SET "description_html_en" = '<p class="p1">Our balanced down duvet</p>
<ul>
<li>
<p class="p1"><span class="s1"><b>Comfort level:</b></span> A medium-warm duvet with an enveloping feel and a distinct weight, without being bulky</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Filling:</b></span> 60% down, 40% small feather – gives good loft, firmness and a classic hotel feel</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Outer fabric:</b></span> 100% cotton</p>
<ul>
<li>
<p class="p1"> 233 thread count</p>
</li>
<li>
<p class="p1">Down-proof weave that keeps the filling in place and gives a smooth, quiet surface</p>
</li>
</ul>
</li>
<li>
<p class="p1"><span class="s1"><b>Construction:</b></span> Baffle box construction for even distribution of down and feather, reducing the risk of cold spots</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Climate:</b></span> Good breathability that helps wick away moisture and keep an even temperature through the night</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Use:</b></span> Suits standard and superior rooms where you want to offer a comfortable, well-priced down duvet of hotel standard</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Care:</b></span> Designed for hotel laundering, machine washable and tumble dryable so that loft and shape are retained over time</p>
</li>
</ul>
<p> </p>'
 WHERE "handle" = 'duvet-jacob' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">Enzo is a terry range in a calm, natural palette for the bathroom. A fine texture meets a smooth, contrasting border, with a wide finishing hem at the bottom. Made from 100% cotton. Rounded hanging loops on the short sides. Size: 50 × 70 cm.<br>For embroidery and other customisation, contact us <a href="/contact">here </a></p>'
 WHERE "handle" = 'handduk-ludde' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p>Hand soap in a range of scent profiles. Both the scent and the packaging can be adapted to your requirements. We offer three standard profiles that many customers are happy with. Get in touch and we will send samples of bottles and scent profiles. </p>'
 WHERE "handle" = 'handtval' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">Our balanced hotel pillow</p>
<ul>
<li>
<p class="p1"><span class="s1"><b>Comfort level:</b></span> A medium-firm pillow combining soft give with clear support</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Filling:</b></span> 60% down, 40% small feather – gives loft, firmness and a classic hotel feel</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Outer fabric:</b></span> 100% cotton</p>
<ul>
<li>
<p class="p1">233 thread count</p>
</li>
<li>
<p class="p1">Down-proof weave that reduces down leakage and gives an even, smooth surface</p>
</li>
</ul>
</li>
<li>
<p class="p1"><span class="s1"><b>Climate:</b></span> Good breathability that helps carry away heat and moisture through the night</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Use:</b></span> Suits standard and superior rooms where you want to offer a comfortable, dependable and well-priced down pillow</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Care:</b></span> Washable in industrial laundering followed by tumble drying to retain loft and shape</p>
</li>
</ul>
<p> </p>'
 WHERE "handle" = 'kudde-medium' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">Our most luxurious down pillow - airy, quiet and mouldable</p>
<ul>
<li>
<p class="p1"><span class="s1"><b>Comfort level:</b></span> A soft but supportive pillow for guests who want to sink in without losing support</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Filling:</b></span> Choose between 90% goose down or duck down, 90% finely sorted goose down, 10% small feather.</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Outer fabric:</b></span> 100% cotton, 233 TC, down-proof weave to reduce down leakage and give a smooth feel against the skin.</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Climate:</b></span> Breathable construction that helps carry away heat and moisture through the night</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Use:</b></span> Recommended for suites and premium rooms where the hotel wants to offer its most exclusive pillow option</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Care:</b></span> Washable industrially at low to medium temperature followed by tumble drying to restore loft</p>
</li>
</ul>'
 WHERE "handle" = 'kudde-premium' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p>A pillow protector made from stretch terry in cotton and polyester with a zip along the side. Easy to take off and wash, and it keeps your pillow fresh for longer.</p>
<dl class="row">
<dt class="col-lg-4">Material</dt>
<dd class="col-lg-8">80% cotton, 20% polyester</dd>
<dt class="col-lg-4">Construction</dt>
<dd class="col-lg-8">30/1 terry jersey</dd>
</dl>'
 WHERE "handle" = 'kuddeskydd' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="_p_16yqn_68"><strong><span>White sheets with marking thread</span></strong></p>
<p class="_p_16yqn_68"><span>A cotton/polyester blend combining softness with a long service life. Marking thread for practical handling.</span></p>'
 WHERE "handle" = 'lakan' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">A hard-wearing luxury bathrobe with velour on the outside and classic terry on the inside. Choose the colour of the piping and add embroidery if required.</p>
<p>450 GSM.<br>For more extensive customisation, please send us an <a title="Contact us" href="contact">enquiry</a>. </p>'
 WHERE "handle" = 'morgonrock' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<div class="product-details-intro">
<p>Bathrobe with a waffle texture</p>
<p>Tie belt</p>
<p><br>Quality: Woven</p>
<p>Material: 100% cotton</p>
</div>'
 WHERE "handle" = 'morgonrock-vaffel' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<div class="_HtmlPreview_xqjq5_1">
<p>Duvet cover with a woven 22 mm satin stripe in cotton/polyester</p>
</div>'
 WHERE "handle" = 'paslakan' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">Our practical synthetic pillow</p>
<ul>
<li>
<p class="p1"><span class="s1"><b>Comfort level:</b></span> A medium-firm pillow with even support and a stable shape</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Filling:</b></span> Synthetic polyester fibre that holds its shape well and dries quickly</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Outer fabric:</b></span> Hard-wearing cotton or microfibre fabric suited to frequent washing</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Climate:</b></span> Fibre wadding that lets air through and helps carry away moisture</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Use:</b></span> Our best-value pillow option, suitable for high occupancy, extra beds and rooms where easy care is the priority</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Care:</b></span> Withstands regular machine washing and tumble drying, easy to freshen up and restore to full loft</p>
</li>
</ul>
<p> </p>'
 WHERE "handle" = 'standard-kudde' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p>A hard-wearing, easy-care duvet developed for hotels and other businesses with high demands on comfort and washability.</p>
<ul>
<li>
<strong>Size:</strong> 150 × 200 cm</li>
<li>
<strong>Filling:</strong> 3D fibre</li>
<li>
<strong>Fill weight:</strong> 459 g/m²</li>
<li>
<strong>Outer fabric:</strong> Soft cotton sateen, 300 TC</li>
<li>
<strong>Comfort:</strong> Airy, soft and evenly distributed</li>
<li>
<strong>Care:</strong> Suited to regular washing and tumble drying</li>
</ul>
<p>The 3D fibre helps the duvet keep its loft and shape over time. The dense sateen fabric gives a smooth, pleasant feel, while the synthetic filling makes Daniel a practical and allergy-friendly option for hotel rooms.</p>'
 WHERE "handle" = 'tacke-daniel' AND "description_html_en" = "description_html";

UPDATE "products"
   SET "description_html_en" = '<p class="p1">Our most exclusive down duvet</p>
<ul>
<li>
<p class="p1"><span class="s1"><b>Comfort level:</b></span> A warm yet airy duvet with an enveloping feel that never seems heavy</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Filling:</b></span> 90% down, 10% small feather – a high proportion of finely sorted down for maximum loft and softness</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Outer fabric:</b></span> 100% cotton</p>
<ul>
<li>
<p class="p1"> 233 thread count</p>
</li>
<li>
<p class="p1">Down-proof weave that keeps the down in place and gives a smooth, quiet surface</p>
</li>
</ul>
</li>
<li>
<p class="p1"><span class="s1"><b>Construction:</b></span> Baffle box construction for even distribution of the down and a reduced risk of cold bridges</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Climate:</b></span> Very good breathability that wicks away moisture and helps the guest keep an even temperature through the night</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Use:</b></span> Recommended for suites and premium rooms where the hotel wants to offer its highest duvet standard</p>
</li>
<li>
<p class="p1"><span class="s1"><b>Care:</b></span> Suited to hotel laundering with a gentle machine wash and tumble drying so that loft and support are preserved over time</p>
</li>
</ul>
<p> </p>'
 WHERE "handle" = 'tacke-sebastian' AND "description_html_en" = "description_html";
