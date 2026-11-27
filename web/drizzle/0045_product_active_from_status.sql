-- `products.active` räknas ur `status` (source_of_truth §1.9, A20).
--
-- Butiken läste `status`, medan varukorgen och den manuella fakturan läste
-- `active`. En ändring av bara `active` i admin gav en produkt som syntes i
-- butiken men inte gick att köpa, eller tvärtom. Nu är `active` en kolumn som
-- databasen räknar ut. Den kan aldrig säga något annat än `status`, och ett
-- försök att skriva den ger ett fel i stället för en tyst skillnad.
--
-- Inget index, ingen vy och ingen constraint beror på kolumnen (kontrollerat
-- 2026-11-26), så den kan bytas rakt av.

alter table products drop column active;
alter table products add column active boolean generated always as (status = 'active') stored not null;
