-- Förstapartsstatistik över besök i butiken.
--
-- Skrivs bara för besökare som tackat ja till analyskakor. Ingen IP-adress och
-- ingen user agent sparas: `visitor_id` och `session_id` är slumptal som
-- webbläsaren själv skapar, och allt som härleds ur begäran (land, stad,
-- enhet, webbläsare) sparas som färdiga etiketter — aldrig som råvärden.
--
-- Ersätter besöksloggen mot Google Sheets, som skrev en rad per sidladdning
-- utan samtycke och utan något sätt att räkna unika besökare.

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id"              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Klientens eget id för händelsen. Unikt, så att ett omskickat anrop
  -- (`keepalive`-fetch som körs två gånger, en retry) inte blir två besök.
  "event_id"        text NOT NULL UNIQUE,
  "visitor_id"      text NOT NULL,
  "session_id"      text NOT NULL,
  "occurred_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "path"            text NOT NULL,
  "locale"          text NOT NULL DEFAULT 'sv',
  "event_type"      text NOT NULL DEFAULT 'page_view',
  "product_handle"  text,
  "referrer_host"   text,
  "source_category" text NOT NULL DEFAULT 'direct',
  "source_detail"   text NOT NULL DEFAULT 'Direkt',
  "country_code"    text,
  "region"          text,
  -- ISO 3166-2 utan landsprefixet ("AB", "CA"). Ofta null — kartan matchar då
  -- på namnet i stället, vilket är en permanent reserv och inget tillfälligt.
  "region_code"     text,
  "city"            text,
  "timezone"        text,
  -- Ungefärliga koordinater för staden från Vercels edge, inte besökarens
  -- position. Finns bara för att kartan ska kunna rita ut pricken.
  "latitude"        double precision,
  "longitude"       double precision,
  "device_category" text NOT NULL DEFAULT 'Okänd',
  "browser_name"    text NOT NULL DEFAULT 'Okänd',
  "os_name"         text NOT NULL DEFAULT 'Okänd'
);

-- Varje fråga i adminvyn börjar med ett tidsfönster, så tiden ligger först i
-- varje index och de övriga kolumnerna hänger med som täckning.
CREATE INDEX IF NOT EXISTS "analytics_events_occurred_at_idx"
  ON "analytics_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_visitor_idx"
  ON "analytics_events" ("visitor_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_source_idx"
  ON "analytics_events" ("source_category", "occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_events_location_idx"
  ON "analytics_events" ("country_code", "region_code", "city", "occurred_at");
