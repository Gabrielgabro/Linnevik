ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "handle_en" text;
CREATE UNIQUE INDEX IF NOT EXISTS "products_handle_en_key" ON "products" ("handle_en") WHERE "handle_en" IS NOT NULL;

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "option_values_en" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "handle_en" text;
CREATE UNIQUE INDEX IF NOT EXISTS "collections_handle_en_key" ON "collections" ("handle_en") WHERE "handle_en" IS NOT NULL;

-- Uppdatera befintliga rader
UPDATE "collections" SET "title_sv" = 'Utvalt' WHERE "handle" = 'featured';

-- Initiera option_values_en
UPDATE "product_variants" SET "option_values_en" = "option_values";

-- Översätt engelska handles för produkter
UPDATE "products" SET "handle_en" = 'towel-enzo' WHERE "handle" = 'handduk-ludde';
UPDATE "products" SET "handle_en" = 'hand-soap' WHERE "handle" = 'handtval';
UPDATE "products" SET "handle_en" = 'pillow-alva' WHERE "handle" = 'kudde-medium';
UPDATE "products" SET "handle_en" = 'pillow-sigrid' WHERE "handle" = 'kudde-premium';
UPDATE "products" SET "handle_en" = 'pillow-protector' WHERE "handle" = 'kuddeskydd';
UPDATE "products" SET "handle_en" = 'flat-sheet' WHERE "handle" = 'lakan';
UPDATE "products" SET "handle_en" = 'mattress-protector' WHERE "handle" = 'madrasskydd';
UPDATE "products" SET "handle_en" = 'bathrobe-skonrock' WHERE "handle" = 'morgonrock';
UPDATE "products" SET "handle_en" = 'bathrobe-waffle' WHERE "handle" = 'morgonrock-vaffel';
UPDATE "products" SET "handle_en" = 'pillowcase' WHERE "handle" = 'orngott';
UPDATE "products" SET "handle_en" = 'duvet-cover' WHERE "handle" = 'paslakan';
UPDATE "products" SET "handle_en" = 'pillow-eric' WHERE "handle" = 'standard-kudde';
UPDATE "products" SET "handle_en" = 'duvet-daniel' WHERE "handle" = 'tacke-daniel';
UPDATE "products" SET "handle_en" = 'duvet-sebastian' WHERE "handle" = 'tacke-sebastian';
UPDATE "products" SET "handle_en" = 'slippers' WHERE "handle" = 'tofflor';
UPDATE "products" SET "handle_en" = "handle" WHERE "handle_en" IS NULL;

-- Översätt engelska handles för kategorier
UPDATE "collections" SET "handle_en" = 'pillows-and-duvets' WHERE "handle" = 'tacken';
UPDATE "collections" SET "handle_en" = 'bathroom' WHERE "handle" = 'badrum';
UPDATE "collections" SET "handle_en" = 'bathrobes' WHERE "handle" = 'morgonrockar';
UPDATE "collections" SET "handle_en" = 'bed-linen' WHERE "handle" = 'sangklader';
UPDATE "collections" SET "handle_en" = "handle" WHERE "handle_en" IS NULL;

-- Översätt handtvålens alternativ
UPDATE "product_variants" 
SET "option_values_en" = '[{"name": "Scent profile", "value": "Ocean breeze"}]'::jsonb 
WHERE "option_values"::text LIKE '%Havskant%';

UPDATE "product_variants" 
SET "option_values_en" = '[{"name": "Scent profile", "value": "Forest air"}]'::jsonb 
WHERE "option_values"::text LIKE '%Skogsluft%';

UPDATE "product_variants" 
SET "option_values_en" = '[{"name": "Scent profile", "value": "Morning linen"}]'::jsonb 
WHERE "option_values"::text LIKE '%Morgonlinne%';

-- Översätt vanliga alternativord där de förekommer
UPDATE "product_variants"
SET "option_values_en" = replace(
    replace(
      replace(
        replace(
          replace("option_values_en"::text, '"name": "Färg"', '"name": "Colour"'),
          '"name": "Storlek"', '"name": "Size"'
        ),
        '"value": "Vit"', '"value": "White"'
      ),
      '"value": "Blå"', '"value": "Blue"'
    ),
    '"value": "Grå"', '"value": "Grey"'
  )::jsonb;

-- Uppdatera AI-genererad alt-text till kreativa beskrivningar
UPDATE "product_images" SET "alt_text" = 'Elegant Linnevik hotel-style hand soap with a marble finish and engraved Swedish logo.' WHERE "alt_text" LIKE '%Generate a product picture of a hotel style of hand soap bottle%';
UPDATE "product_images" SET "alt_text" = 'Elegant Linnevik hotel-style hand soap with a marble finish and engraved Swedish logo.' WHERE "alt_text" LIKE '%Generate another picture of hotel style hand soap with marmor bottle and ingraved logo in Swedish%';
UPDATE "product_images" SET "alt_text" = 'Premium Linnevik down hotel pillow showcasing its plush support on a clean white background.' WHERE "alt_text" LIKE '%Generate a product picture of a pillow for hotel use with a sterile white background%';
UPDATE "product_images" SET "alt_text" = 'Comfortable Linnevik hotel slippers designed for ultimate guest relaxation.' WHERE "alt_text" LIKE '%Generera en produktbild av tofflor med vit bakgrund.%';
UPDATE "product_images" SET "alt_text" = 'Crisp, white Linnevik hotel duvet, featuring a luxurious baffle box construction for even warmth.' WHERE "alt_text" LIKE '%Skapa en produktbild av ett vitt täcke utan lakan.%';
