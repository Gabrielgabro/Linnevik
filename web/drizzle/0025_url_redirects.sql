-- Omdirigeringar för adresser som flyttat.
--
-- Handlen är adressen. Byts den i /admin dör den gamla länken — i sökmotorer,
-- i nyhetsbrev, i kundernas bokmärken — och ingenting säger till. Tabellen är
-- skriven automatiskt vid varje handle-byte, och läses först när en sida ändå
-- skulle svara 404, så att den vanliga trafiken inte betalar för den.
--
-- Sökvägen sparas utan språkprefix (`/products/gammal-handle`), eftersom
-- handlen är gemensam för sv och en.

CREATE TABLE IF NOT EXISTS "url_redirects" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "from_path" text NOT NULL,
  "to_path" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'product',
  "hits" integer NOT NULL DEFAULT 0,
  "last_hit_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- En omdirigering till sig själv är en oändlig slinga, inte en omdirigering.
  CONSTRAINT "url_redirects_not_circular" CHECK ("from_path" <> "to_path")
);

CREATE UNIQUE INDEX IF NOT EXISTS "url_redirects_from_path_key"
  ON "url_redirects" ("from_path");

-- Kedjeomskrivningen (a→b blir a→c när b→c skapas) slår upp på målet.
CREATE INDEX IF NOT EXISTS "url_redirects_to_path_idx"
  ON "url_redirects" ("to_path");
