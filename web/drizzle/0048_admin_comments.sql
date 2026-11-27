-- Kommentarer med vem och när (source_of_truth §15.6, A31).
--
-- Order, företag och provbeställning hade var sitt textfält för interna
-- anteckningar. Fältet skrevs över vid varje sparning och sa varken vem som
-- skrev eller när. Nu är varje kommentar en egen rad som inte kan ändras
-- eller raderas: triggern nedan stoppar update och delete, även från SQL.
--
-- Kommentaren pekar på sin sak med `subject` och `subject_id` och har ingen
-- främmande nyckel. En kommentar ska finnas kvar även om företaget den
-- handlar om raderas (§11.11).
--
-- De gamla anteckningarna flyttas hit med skribenten okänd och dagen då
-- raden senast ändrades. De gamla kolumnerna står kvar orörda tills den här
-- koden är i drift, så att den version som kör under deployen inte går
-- sönder. De tas bort i en senare migrering.

create table admin_comments (
  id integer generated always as identity primary key,
  subject text not null check (subject in ('order', 'client', 'sample_request')),
  subject_id integer not null,
  author text not null check (length(btrim(author)) > 0),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index admin_comments_subject_idx on admin_comments (subject, subject_id, created_at);

create function admin_comments_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'En kommentar kan inte ändras eller raderas (source_of_truth §15.6).';
end;
$$;

create trigger admin_comments_append_only
  before update or delete on admin_comments
  for each row execute function admin_comments_append_only();

insert into admin_comments (subject, subject_id, author, body, created_at)
select 'order', id, 'Okänd (före kommentarerna)', left(btrim(notes), 5000), updated_at
from orders where length(btrim(coalesce(notes, ''))) > 0;

insert into admin_comments (subject, subject_id, author, body, created_at)
select 'client', id, 'Okänd (före kommentarerna)', left(btrim(notes), 5000), updated_at
from clients where length(btrim(coalesce(notes, ''))) > 0;

insert into admin_comments (subject, subject_id, author, body, created_at)
select 'sample_request', id, coalesce(nullif(btrim(handled_by), ''), 'Okänd (före kommentarerna)'),
       left(btrim(internal_note), 5000), coalesce(handled_at, created_at)
from sample_requests where length(btrim(coalesce(internal_note, ''))) > 0;
