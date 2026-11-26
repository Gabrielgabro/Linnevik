-- Egna fakturor (source_of_truth §9, A17).
--
-- Fakturorna gjordes i Stripe, som gav numret och pdf:en. Nu gör vi dem
-- själva: en rad per faktura eller kreditfaktura, med en ögonblicksbild av
-- allt som står på den och pdf:en.
--
-- Nummerserien (§9.5) hålls i `invoice_numbers`, inte i en sekvens: en
-- sekvens hoppar över nummer när en transaktion rullas tillbaka, och en
-- bokföringsserie ska vara obruten. Numret tas och fakturan skrivs i samma
-- sats (invoicesDb.ts), så antingen finns båda eller ingen. Kreditfakturor
-- får nummer i samma serie.
--
-- `orders.client_id` kopplar ordern direkt till företaget. Förut gick vägen
-- via ett webbkonto, och därför skapade en manuell faktura ett webbkonto åt
-- mottagaren (A12).

create table invoice_numbers (
  id boolean primary key default true check (id),
  last_number integer not null check (last_number >= 0)
);
insert into invoice_numbers (id, last_number) values (true, 0);

create table invoices (
  id integer generated always as identity primary key,
  number integer not null unique check (number > 0),
  kind text not null check (kind in ('invoice', 'credit')),
  order_id integer not null references orders(id) on delete restrict,
  -- En kreditfaktura hänvisar till fakturan den krediterar (§9.8).
  credits_invoice_id integer references invoices(id) on delete restrict,
  refund_id integer unique references refunds(id) on delete restrict,
  issued_at timestamptz not null default now(),
  due_on date,
  currency text not null,
  -- Ögonblicksbilder. Fakturan ändras aldrig (§9.6), så den bär sina egna
  -- uppgifter och läser inte företaget eller ordern på nytt.
  seller jsonb not null,
  buyer jsonb not null,
  lines jsonb not null,
  goods_minor integer not null,
  discount_minor integer not null default 0,
  shipping_minor integer not null default 0,
  net_minor integer not null,
  vat_bps integer not null,
  tax_minor integer not null,
  total_minor integer not null,
  ocr text,
  memo text,
  pdf_base64 text,
  voided_at timestamptz,
  voided_by text,
  emailed_to text,
  emailed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'credit') = (credits_invoice_id is not null)),
  check (kind = 'credit' or due_on is not null),
  check (net_minor = goods_minor - discount_minor + shipping_minor),
  check (total_minor = net_minor + tax_minor)
);

-- En order har högst en gällande faktura. En makulerad faktura står kvar med
-- sitt nummer (§9.5), och en ny kan göras.
create unique index invoices_one_open_per_order
  on invoices (order_id) where kind = 'invoice' and voided_at is null;
create index invoices_order_idx on invoices (order_id);

alter table orders add column client_id integer references clients(id) on delete set null;
update orders o set client_id = c.client_id from customers c where c.id = o.customer_id;
create index orders_client_id_idx on orders (client_id);
