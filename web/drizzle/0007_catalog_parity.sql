-- The first catalog move copied product text and product images. Shopify also
-- stores localized SEO and collection content; keep those locally so closing
-- Shopify cannot remove category pages or their artwork.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "seo_title_en" text,
  ADD COLUMN IF NOT EXISTS "seo_description_en" text,
  ADD COLUMN IF NOT EXISTS "shopify_updated_at" timestamp with time zone;

ALTER TABLE "product_images"
  ADD COLUMN IF NOT EXISTS "source_url" text,
  ADD COLUMN IF NOT EXISTS "width" integer,
  ADD COLUMN IF NOT EXISTS "height" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "product_images_product_source_key"
  ON "product_images" ("product_id", "source_url")
  WHERE "source_url" IS NOT NULL;

ALTER TABLE "collections"
  ADD COLUMN IF NOT EXISTS "description_html" text,
  ADD COLUMN IF NOT EXISTS "description_html_en" text,
  ADD COLUMN IF NOT EXISTS "seo_title" text,
  ADD COLUMN IF NOT EXISTS "seo_title_en" text,
  ADD COLUMN IF NOT EXISTS "seo_description" text,
  ADD COLUMN IF NOT EXISTS "seo_description_en" text,
  ADD COLUMN IF NOT EXISTS "image_url" text,
  ADD COLUMN IF NOT EXISTS "image_blob_pathname" text,
  ADD COLUMN IF NOT EXISTS "image_source_url" text,
  ADD COLUMN IF NOT EXISTS "image_alt_text" text,
  ADD COLUMN IF NOT EXISTS "image_width" integer,
  ADD COLUMN IF NOT EXISTS "image_height" integer,
  ADD COLUMN IF NOT EXISTS "shopify_updated_at" timestamp with time zone;
