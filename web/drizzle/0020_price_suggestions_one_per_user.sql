-- Ett levande prisförslag per person.
--
-- Tabellen var append-only: varje sparning la till en rad, och jämförelsen
-- kunde bara visa ett valt förslag i taget. Det gjorde det omöjligt att se vad
-- Gabriel, Johan och Ahron tycker samtidigt, vilket är hela poängen med att
-- flera personer sätter pris på samma sortiment.
--
-- Nu gäller: en rad per person, som sparningen skriver över. Historiken går
-- inte förlorad — varje sparning loggas redan i `admin_activity` under
-- 'suggestion.saved', och det är där man ser vad någon tyckte i förra veckan.

-- Behåll bara den senaste raden per person. `id` bryter lika `created_at`.
DELETE FROM "price_suggestions" a
USING "price_suggestions" b
WHERE a."user" = b."user"
  AND (a."created_at" < b."created_at"
       OR (a."created_at" = b."created_at" AND a."id" < b."id"));

ALTER TABLE "price_suggestions"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- Sätt updated_at till skapandetiden för rader som fanns före kolumnen, så att
-- "senast ändrad" inte visar migreringstillfället för allas förslag.
UPDATE "price_suggestions" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at";

CREATE UNIQUE INDEX IF NOT EXISTS "price_suggestions_user_key"
  ON "price_suggestions" ("user");
