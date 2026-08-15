-- Engångstoken för e-postlänksinloggning, som ska ersätta Shopifys
-- kundinloggning vid nedstängningen. Bara SHA-256-hashen av token sparas.

CREATE TABLE IF NOT EXISTS "customer_login_tokens" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "customer_id" integer NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "email" text NOT NULL,
  "requested_ip" text,
  "user_agent" text,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_login_tokens_hash_key"
  ON "customer_login_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "customer_login_tokens_customer_id_idx"
  ON "customer_login_tokens" ("customer_id");

CREATE INDEX IF NOT EXISTS "customer_login_tokens_email_created_idx"
  ON "customer_login_tokens" ("email", "created_at");

CREATE INDEX IF NOT EXISTS "customer_login_tokens_ip_created_idx"
  ON "customer_login_tokens" ("requested_ip", "created_at");
