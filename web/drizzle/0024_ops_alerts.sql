-- Driftlarm. Varje fel som förr bara blev en rad i konsolen skrivs här och
-- mejlas ut. Tabellen är både loggen och spärren mot larmstormar: samma
-- dedupe_key mejlas högst en gång per fönster, men varje förekomst sparas.
--
-- notified_at är null när larmet skrevs men mejlet hölls tillbaka av spärren
-- (eller när SMTP saknades). acknowledged_at sätts från /admin när någon tagit
-- hand om det.

CREATE TABLE IF NOT EXISTS "ops_alerts" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "subject" text NOT NULL,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notified_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ops_alerts_created_idx"
  ON "ops_alerts" ("created_at" DESC);

-- Spärren slår upp på nyckeln inom ett tidsfönster.
CREATE INDEX IF NOT EXISTS "ops_alerts_dedupe_idx"
  ON "ops_alerts" ("dedupe_key", "created_at" DESC);

-- Räknaren i adminvyn frågar efter de okvitterade.
CREATE INDEX IF NOT EXISTS "ops_alerts_open_idx"
  ON "ops_alerts" ("created_at" DESC)
  WHERE "acknowledged_at" IS NULL;
