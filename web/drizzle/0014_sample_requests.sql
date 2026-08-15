-- Provförfrågningar.
--
-- Formuläret på /samples har hittills bara skickat ett mejl. Det betyder att
-- en förfrågan är borta så fort någon råkar radera mejlet, att ingen kan se
-- vad som är hanterat, och att kunden själv inte har någon kvittens. Nu ligger
-- den i databasen och mejlet blir en avisering ovanpå posten.
--
-- `customer_id` kopplas när e-postadressen matchar en befintlig kund, så att
-- inloggningssidan kan visa förfrågan. Den lämnas NULL för alla andra —
-- formuläret kräver ingen inloggning, och ska inte göra det: hela poängen är
-- att en möjlig kund ska kunna be om prover innan de har ett konto.
CREATE TABLE IF NOT EXISTS "sample_requests" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "customer_id" integer REFERENCES "customers"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'new',
  "contact_name" text NOT NULL,
  "organization_name" text NOT NULL,
  "organization_number" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "address" text NOT NULL,
  "postal_code" text NOT NULL,
  "city" text NOT NULL,
  "country" text NOT NULL,
  "notes" text,
  "locale" text,
  -- Vad vi gjort med den: vem som tog den, när, och en intern anteckning som
  -- kunden aldrig ser.
  "internal_note" text,
  "handled_by" text,
  "handled_at" timestamptz,
  "emailed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sample_requests_status_check"
    CHECK ("status" IN ('new', 'in_progress', 'sent', 'declined'))
);

-- Kön i adminvyn: nyast först, och statusen är det man filtrerar på.
CREATE INDEX IF NOT EXISTS "sample_requests_status_idx"
  ON "sample_requests" ("status", "created_at" DESC);
-- Kontosidan slår upp på adressen även när kopplingen till kund saknas, t.ex.
-- när någon bad om prover innan de registrerade sig.
CREATE INDEX IF NOT EXISTS "sample_requests_email_idx" ON "sample_requests" (lower("email"));
CREATE INDEX IF NOT EXISTS "sample_requests_customer_id_idx" ON "sample_requests" ("customer_id");

-- Raderna i förfrågan. `product_id` pekar på vår egen katalog när varan går
-- att känna igen; titeln sparas ändå, så att posten står kvar oförändrad även
-- om produkten döps om eller plockas bort ur sortimentet.
CREATE TABLE IF NOT EXISTS "sample_request_items" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "request_id" integer NOT NULL REFERENCES "sample_requests"("id") ON DELETE CASCADE,
  "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL,
  "external_product_id" text,
  "title" text NOT NULL,
  "variant_label" text
);

CREATE INDEX IF NOT EXISTS "sample_request_items_request_id_idx"
  ON "sample_request_items" ("request_id");
