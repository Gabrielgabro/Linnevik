-- Enkel ratbegränsning med fasta fönster.
--
-- Adminspärren hade bara en fördröjning på 600 ms vid fel lösenord, och
-- kontaktformuläret och provbeställningarna hade ingenting alls: båda skickar
-- e-post utan inloggning. Magic link-inloggningen räknade redan sina försök,
-- men gjorde det mot sin egen tokentabell — den här är den gemensamma.
--
-- En rad per hink och fönster. `expires_at` bär fönstrets slut, så en utgången
-- hink återanvänds av nästa upsert i stället för att behöva städas först.

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "bucket" text PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL
);

-- Städningen i dygnskörningen sveper på utgångstiden.
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx"
  ON "rate_limits" ("expires_at");
