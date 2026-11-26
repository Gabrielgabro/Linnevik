-- Ett besked från Stripe blir aldrig liggande (source_of_truth §17.2, A7).
--
-- Webhooken skriver en rad per händelse innan den hanteras, så att samma
-- händelse hanteras en gång. Föll funktionen halvvägs, till exempel på en
-- timeout, stod raden kvar som "processing" och varje nytt försök från
-- Stripe besvarades med "duplicate". Händelsen hanterades aldrig.
--
-- `claimed_at` säger när någon senast tog sig an händelsen. Ett anspråk som
-- är äldre än tio minuter, längre än en funktion får köra, räknas som
-- övergivet och tas över av nästa försök från Stripe eller av nattens
-- avstämning. `attempts` räknar försöken.

alter table stripe_webhook_events
  add column claimed_at timestamptz not null default now(),
  add column attempts integer not null default 1;

update stripe_webhook_events set claimed_at = created_at;

create index stripe_webhook_events_stuck_idx on stripe_webhook_events (claimed_at)
  where status = 'processing';
