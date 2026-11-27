-- Alternativens namn städas (source_of_truth §1.5–1.7, A2).
--
-- Kudde Eric 60 x 80 hette "Storlek " med ett mellanslag på slutet, och
-- produktsidan gjorde därför två val av storleken. Samma slags fel fanns på
-- fler ställen: "storlek" och "fyllning" med gemen, och engelska namn som
-- aldrig översattes ("Fyllning", "Brodyr", "Kvalitet", "Storlek ").
--
-- Varje namn trimmas och får versal först. Det engelska namnet sätts från det
-- svenska, så att paret alltid är detsamma. Värdena trimmas men ändras inte
-- annars. Namn utan översättning här ("Title", som Shopify satte på produkter
-- med en enda variant) behåller sitt engelska namn. Admin trimmar redan namn
-- som sparas (productsInput.ts), så felet kommer inte tillbaka.
--
-- En enda sats: körs över Neons HTTP-förbindelse, där en tillfällig tabell
-- eller funktion inte säkert lever mellan satserna.

with names(sv, en) as (
  values
    ('Storlek', 'Size'),
    ('Fyllning', 'Filling'),
    ('Färg', 'Colour'),
    ('Doftprofil', 'Scent profile'),
    ('Brodyr', 'Embroidery'),
    ('Kvalitet', 'Quality')
),
cleaned as (
  select
    v.id,
    jsonb_agg(
      jsonb_build_object(
        'name', upper(left(btrim(sv.e->>'name'), 1)) || substr(btrim(sv.e->>'name'), 2),
        'value', btrim(sv.e->>'value'))
      order by sv.i) as option_values,
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(
          n.en,
          upper(left(btrim(coalesce(en.e->>'name', sv.e->>'name')), 1))
            || substr(btrim(coalesce(en.e->>'name', sv.e->>'name')), 2)),
        'value', btrim(coalesce(en.e->>'value', sv.e->>'value')))
      order by sv.i) as option_values_en
  from product_variants v
  cross join lateral jsonb_array_elements(v.option_values) with ordinality sv(e, i)
  left join lateral jsonb_array_elements(coalesce(v.option_values_en, '[]'::jsonb)) with ordinality en(e, i)
    on en.i = sv.i
  left join names n
    on n.sv = upper(left(btrim(sv.e->>'name'), 1)) || substr(btrim(sv.e->>'name'), 2)
  where jsonb_typeof(v.option_values) = 'array'
  group by v.id
)
update product_variants v
set option_values = c.option_values,
    option_values_en = c.option_values_en,
    updated_at = now()
from cleaned c
where c.id = v.id
  and (v.option_values is distinct from c.option_values
       or v.option_values_en is distinct from c.option_values_en);
