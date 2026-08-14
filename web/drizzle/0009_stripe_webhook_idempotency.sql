CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "event_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_status_idx" ON "stripe_webhook_events" ("status", "created_at");
