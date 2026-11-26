-- Betalningsdagen på ordern (source_of_truth §16.2, A18).
--
-- Exporten tog ordrar efter den dag de skapades, räknat i UTC. En faktura
-- som skapades i oktober och betalades i november hamnade då i oktober, och
-- en order lagd strax efter midnatt svensk tid hamnade på dagen före.
--
-- `paid_on` är den svenska kalenderdag då ordern blev betald:
--
-- - kort: dagen då Stripes besked kom (händelsen payment.paid)
-- - faktura: dagen admin angav när bankbetalningen registrerades
--
-- Den sätts en gång, när ordern först blir betald, och ändras aldrig efter
-- det. Befintliga betalda ordrar får sin dag ur orderns historik.

alter table orders add column paid_on date;

update orders o set paid_on = e.paid_on
from (
  select distinct on (order_id) order_id, (detail ->> 'paid_on')::date as paid_on
  from order_events
  where kind = 'payment.bank_registered' and detail ->> 'paid_on' ~ '^\d{4}-\d{2}-\d{2}$'
  order by order_id, created_at
) e
where e.order_id = o.id and o.paid_on is null;

update orders o set paid_on = e.paid_on
from (
  select order_id, (min(created_at) at time zone 'Europe/Stockholm')::date as paid_on
  from order_events
  where kind = 'payment.paid'
  group by order_id
) e
where e.order_id = o.id and o.paid_on is null;

-- Betalda ordrar utan händelse (från före historiken) får orderdagen.
update orders set paid_on = (created_at at time zone 'Europe/Stockholm')::date
where paid_on is null and payment_status in ('paid', 'partially_refunded', 'refunded');

create index orders_paid_on_idx on orders (paid_on) where paid_on is not null;
