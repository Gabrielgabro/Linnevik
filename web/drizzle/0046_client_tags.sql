-- Ett enda företagsregister. Tvätterikund är en tagg (source_of_truth §11.4,
-- §11.5, A13, A14, A15).
--
-- 0042 delade registret i två slag av företag, `lead` och `customer`, med var
-- sin lista i admin och en knapp som flyttade mellan dem. Säljstatusen sa
-- dessutom samma sak med värdena "Tvätterikund", "Aktiv kund" och "Tidigare
-- kund", ibland motsatsen. Nu:
--
-- - `tags` säger varifrån företaget kommer. Taggen Tvätterikund styr
--   ingenting: ett taggat företag kan faktureras och ha webbkonton som alla.
-- - `kind` tas bort.
-- - Säljstatusen beskriver bara säljarbetet. Vid körningen hade alla 96
--   företag status "Tvätterikund", alla kom ur tvätteriets lista och ingen
--   hade köpt något. De blir "Prospekt" och får taggen.
-- - Org-numret är unikt. Indexet fanns redan i produktionen, men 0036 satte
--   det bara om registret saknade dubbletter. Här sätts det ovillkorligt, så
--   att varje databas har det.

alter table clients add column tags text[] not null default '{}';

update clients set tags = array['Tvätterikund'] where kind = 'lead';

update clients set status = case status
    when 'Tvätterikund' then 'Prospekt'
    when 'Aktiv kund' then 'Pågående dialog'
    when 'Tidigare kund' then 'Vilande'
    else status
  end
where status in ('Tvätterikund', 'Aktiv kund', 'Tidigare kund');

alter table clients alter column status set default 'Prospekt';

drop index if exists clients_kind_idx;
alter table clients drop constraint if exists clients_kind_check;
alter table clients drop column kind;

create unique index if not exists clients_org_number_key
  on clients (org_number) where org_number is not null;
