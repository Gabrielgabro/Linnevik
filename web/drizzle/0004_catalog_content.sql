-- Produktinnehållet flyttar hem. Efter den här migrationen finns allt som en
-- produkt är — texter, bilder, taggar — i vår egen databas, och Shopify behövs
-- inte längre för att visa eller skapa en produkt.
--
-- Additiv och omkörbar.

-- 1. Shopify-ID:n blir frivilliga.
--
-- Så länge de var NOT NULL gick det inte att skapa en produkt utan att först
-- skapa den i Shopify. Det är den enda verkliga anledningen till att vi ännu
-- inte kunnat lämna. De ligger kvar som härkomst: nyskrivet ska inte läsa dem,
-- och en produkt som föds i /admin har ingen.
ALTER TABLE "products" ALTER COLUMN "shopify_product_id" DROP NOT NULL;
ALTER TABLE "product_variants" ALTER COLUMN "shopify_variant_id" DROP NOT NULL;

-- Ett vanligt unikt index tillåter bara en enda NULL-rad. Partiella index är
-- samma mönster som redan används för stripe_price_id och shopify_collection_id.
DROP INDEX IF EXISTS "products_shopify_product_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "products_shopify_product_id_key"
  ON "products" ("shopify_product_id") WHERE "shopify_product_id" IS NOT NULL;

DROP INDEX IF EXISTS "product_variants_shopify_variant_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_shopify_variant_id_key"
  ON "product_variants" ("shopify_variant_id") WHERE "shopify_variant_id" IS NOT NULL;

-- Nya produkter är våra, inte Shopifys. Befintliga rader behåller sitt värde.
ALTER TABLE "products" ALTER COLUMN "source" SET DEFAULT 'linnevik';

-- 2. Innehållet.
--
-- Titel och beskrivning finns per språk därför att sajten är tvåspråkig och
-- engelskan i dag bara existerar i Shopify, bakom @inContext. Utan de här
-- kolumnerna försvinner den engelska texten den dagen butiken stängs.
-- `collections` gör redan likadant med title_sv/title_en.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "title_en" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_html" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_html_en" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "vendor" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_title" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_description" text;

-- 3. Bilderna.
--
-- `blob_pathname` sparas därför att en uppladdad bild måste kunna raderas ur
-- Vercel Blob när raden tas bort — URL:en ensam räcker inte till det.
CREATE TABLE IF NOT EXISTS "product_images" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "product_id" integer NOT NULL,
  "variant_id" integer,
  "url" text NOT NULL,
  "blob_pathname" text NOT NULL,
  "alt_text" text,
  "position" integer DEFAULT 0 NOT NULL CHECK (position >= 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- En variantbild ska överleva att varianten städas bort, precis som order_items.
DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "product_images_product_id_position_idx"
  ON "product_images" ("product_id", "position");
