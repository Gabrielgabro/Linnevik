-- Produktionsdatabasen (neon-pink-lever) för linnevik.
-- Kör hela filen i Neons SQL-editor. Går att köra om: inget skrivs över.

CREATE TABLE IF NOT EXISTS "admin_activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "client_contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "client_contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"role" text,
	"email" text,
	"phone" text,
	"linkedin" text,
	"status" text DEFAULT 'Ej kontaktad' NOT NULL,
	"channel" text,
	"last_contacted_at" date,
	"next_action" text,
	"next_action_due" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "clients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_no" text NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"status" text DEFAULT 'Tvätterikund' NOT NULL,
	"priority" text,
	"reminder_fee" numeric(10, 2),
	"name_truncated" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "price_suggestions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user" text NOT NULL,
	"label" text,
	"prices" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Handelskatalogen (drizzle/0001_catalog.sql, 0002_catalog_hierarchy.sql och
-- 0004_catalog_content.sql). Redigeras i /admin — den ägs av oss, inte Shopify.
CREATE TABLE IF NOT EXISTS "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"shopify_product_id" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"stripe_product_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'shopify' NOT NULL,
	"source_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"product_id" integer NOT NULL,
	"shopify_variant_id" text NOT NULL,
	"sku" text NOT NULL,
	"option_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_minor" integer NOT NULL CHECK (price_minor >= 0),
	"currency" text DEFAULT 'sek' NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
	"inventory_quantity" integer DEFAULT 0 NOT NULL,
	"available_for_sale" boolean DEFAULT false NOT NULL,
	"stripe_price_id" text,
	"stripe_lookup_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"source_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "collections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"shopify_collection_id" text,
	"handle" text NOT NULL,
	"title_sv" text NOT NULL,
	"title_en" text NOT NULL,
	"parent_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_collections" (
	"product_id" integer NOT NULL,
	"collection_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_collections_pkey" PRIMARY KEY ("product_id", "collection_id")
);

DO $$ BEGIN
  ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_id_collections_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."collections"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_not_self"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk"
    FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "client_contacts_client_id_idx" ON "client_contacts" USING btree ("client_id");
CREATE UNIQUE INDEX IF NOT EXISTS "clients_customer_no_key" ON "clients" USING btree ("customer_no");
CREATE UNIQUE INDEX IF NOT EXISTS "products_shopify_product_id_key" ON "products" ("shopify_product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "products_handle_key" ON "products" ("handle");
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" ("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_shopify_variant_id_key" ON "product_variants" ("shopify_variant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_key" ON "product_variants" ("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_stripe_price_id_key"
  ON "product_variants" ("stripe_price_id") WHERE "stripe_price_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_stripe_lookup_key_key"
  ON "product_variants" ("stripe_lookup_key") WHERE "stripe_lookup_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "collections_handle_key" ON "collections" ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "collections_shopify_collection_id_key"
  ON "collections" ("shopify_collection_id") WHERE "shopify_collection_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "collections_parent_id_idx" ON "collections" ("parent_id");
CREATE INDEX IF NOT EXISTS "product_collections_collection_id_idx" ON "product_collections" ("collection_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_collections_primary_key"
  ON "product_collections" ("product_id") WHERE "is_primary";

-- Kundregistret ur sales/kunder_tvätteriet.xlsx (114 kunder).
INSERT INTO clients (customer_no, name, reminder_fee, name_truncated, notes) VALUES
  ('1000', 'Marriott', 350.00, false, NULL),
  ('1001', 'Arena Globen', 25.00, false, NULL),
  ('1002', 'Eatery', 25.00, false, NULL),
  ('1003', 'Aubergine', 30.00, false, NULL),
  ('1004', 'Babette', NULL, false, NULL),
  ('1005', 'Aveqia', NULL, false, NULL),
  ('1006', 'Belgobaren', 60.00, false, NULL),
  ('1007', 'Bentleys', NULL, false, NULL),
  ('1008', 'Blique Hotel', NULL, false, NULL),
  ('1009', 'Bromma Hotel', 60.00, false, NULL),
  ('1010', 'munchen', 80.00, false, NULL),
  ('1011', '108 Best Western', NULL, false, NULL),
  ('1012', 'Bålsta hotel', NULL, false, NULL),
  ('1013', 'Chefens Hotell', NULL, false, NULL),
  ('1014', 'Miss Clara', NULL, false, NULL),
  ('1015', 'Combo', NULL, false, NULL),
  ('1017', 'Cultura Crew', 20.00, false, NULL),
  ('1018', 'Ekerö hotel', NULL, false, NULL),
  ('1019', 'Fenix', NULL, false, NULL),
  ('1020', 'FH Fjäderholmen', NULL, false, NULL),
  ('1021', 'Freys hotel', 300.00, false, NULL),
  ('1022', 'Gamla Stan Hotell', NULL, false, NULL),
  ('1023', 'Giro', 10.00, false, NULL),
  ('1024', 'Gondolen', NULL, false, NULL),
  ('1025', 'Grow Hotel', 300.00, false, NULL),
  ('1026', 'Gyldene freden', 60.00, false, NULL),
  ('1027', 'Hemma Vasastan', 35.00, false, NULL),
  ('1028', 'Hornhuset', NULL, false, NULL),
  ('1029', 'J Hotell', NULL, false, NULL),
  ('1030', 'Skeppsholmen Hotell', NULL, false, NULL),
  ('1031', 'J Restaurang', NULL, false, NULL),
  ('1032', 'Balzac restaurang', 50.00, false, NULL),
  ('1033', 'Karlaplan Hotell', NULL, false, NULL),
  ('1034', 'Kista Hotel', NULL, false, NULL),
  ('1035', 'Lilla Brunn', NULL, false, NULL),
  ('1036', 'Luzette', 100.00, false, NULL),
  ('1037', 'Musikaliska', NULL, false, NULL),
  ('1038', 'Nacka Profil', NULL, false, NULL),
  ('1039', 'Nobis Hotel', NULL, false, NULL),
  ('1040', 'Opera', NULL, false, NULL),
  ('1041', 'Friends Arena', NULL, false, NULL),
  ('1042', 'Piatti restaurang', NULL, false, NULL),
  ('1043', 'PicPoc', NULL, false, NULL),
  ('1044', 'Queens Hotell', NULL, false, NULL),
  ('1045', 'Reimersholme Hotell', NULL, false, NULL),
  ('1046', 'Riche Restaurang', 250.00, false, NULL),
  ('1047', 'Rådmannen', 160.00, false, NULL),
  ('1048', 'Rökeriet', NULL, false, NULL),
  ('1049', 'Santo di Roma AB', NULL, false, NULL),
  ('1050', 'Sardin AB', NULL, false, NULL),
  ('1051', 'Scandinavian Hopitality', NULL, false, NULL),
  ('1052', 'Slagsta Hotell', NULL, false, NULL),
  ('1053', 'BBQ smokehouse', NULL, false, NULL),
  ('1054', 'Stallmästaregården ST', NULL, false, NULL),
  ('1055', 'Strandbryggan AB', NULL, false, NULL),
  ('1056', 'Strandvägen 1', NULL, false, NULL),
  ('1057', 'Svets Tech Sweden AB', NULL, false, NULL),
  ('1058', 'Sturehof', NULL, false, NULL),
  ('1059', 'Brillo', NULL, false, NULL),
  ('1060', 'Time Hotel', NULL, false, NULL),
  ('1061', 'Tranan Restaurang', NULL, false, NULL),
  ('1063', 'Turinge Hotel AB', NULL, false, NULL),
  ('1064', 'Ulriksdals Wärdshus AB', NULL, false, NULL),
  ('1065', 'NP', NULL, false, NULL),
  ('1066', 'Waxholms Hotell Aktiebolag', NULL, false, NULL),
  ('1067', 'LA NONNA', NULL, false, NULL),
  ('1068', 'With Hotell', NULL, false, NULL),
  ('1069', 'Wasa Park Hotel', NULL, false, NULL),
  ('1070', 'Utbildningsförvaltningen', NULL, false, NULL),
  ('1071', 'Best Western Park City Solna', NULL, false, NULL),
  ('1072', 'ASPACE', NULL, false, NULL),
  ('1073', 'Comforta AB', NULL, false, NULL),
  ('1074', 'Motel L Älvsjö', NULL, false, NULL),
  ('1075', 'Motel L Hammarby', NULL, false, NULL),
  ('1076', 'Apartments By Ligula', NULL, false, NULL),
  ('1077', 'Central Hotel Profil', NULL, false, NULL),
  ('1078', 'Park City Hammarby Sjöstad', NULL, false, NULL),
  ('1079', 'Stadshotell Älvsjö AB', NULL, false, NULL),
  ('1080', 'Riddargatan Profilhotels', NULL, false, NULL),
  ('1081', 'Restaurant Ergo', NULL, false, NULL),
  ('1082', 'Stockholm Live', NULL, false, NULL),
  ('1083', 'ProSolar i Stockholm AB', NULL, false, NULL),
  ('1084', 'Kastellets Bed & Breakfast', NULL, false, NULL),
  ('1085', 'Nykvarns fest & hotell AB', NULL, false, NULL),
  ('1086', 'Fabrikören', NULL, false, NULL),
  ('1087', 'Kasten Bistro AB', NULL, false, NULL),
  ('1088', 'Copine', NULL, false, NULL),
  ('1089', 'NK Copine', NULL, false, NULL),
  ('1090', 'Skogshöjd', NULL, false, NULL),
  ('1091', 'Waxholms Hotell', NULL, false, NULL),
  ('1092', 'Almnäs Event', NULL, false, NULL),
  ('1093', 'Södra teatern', NULL, false, NULL),
  ('1094', 'Hallwylska', NULL, false, NULL),
  ('1095', 'Mr French', NULL, false, NULL),
  ('1096', 'Artipelag', NULL, false, NULL),
  ('1097', 'ASPACE NYA', NULL, false, NULL),
  ('1098', 'Svenska stortvätten AB', NULL, false, NULL),
  ('1099', 'Hagastrand', NULL, false, NULL),
  ('1100', 'Hötorget Hotel', NULL, false, NULL),
  ('1101', 'Cafe Nizza', NULL, false, NULL),
  ('1102', 'Pizza', NULL, false, NULL),
  ('1103', 'italiano', NULL, false, NULL),
  ('1104', 'Rigoletto', NULL, false, NULL),
  ('1105', 'Bobergs Matsal', NULL, false, NULL),
  ('1106', 'Good Morning Sollentuna', NULL, false, NULL),
  ('1107', 'Sluss', 500.00, false, NULL),
  ('1108', 'La Civetta', NULL, false, NULL),
  ('1109', 'FESTIVITY', NULL, false, NULL),
  ('1110', 'Matateljén Slakthuset', NULL, false, NULL),
  ('1111', 'Boo Boo', NULL, false, NULL),
  ('1112', 'Sigtuna Hotel', NULL, false, NULL),
  ('1113', 'Kaggeholm', NULL, false, NULL),
  ('1114', 'RUBY', NULL, false, NULL),
  ('1115', 'Stockholm Meeting Selection AB', NULL, false, NULL)
ON CONFLICT (customer_no) DO NOTHING;

-- 0004: produktinnehållet flyttar hem. Se drizzle/0004_catalog_content.sql.
ALTER TABLE "products" ALTER COLUMN "shopify_product_id" DROP NOT NULL;
ALTER TABLE "product_variants" ALTER COLUMN "shopify_variant_id" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "source" SET DEFAULT 'linnevik';

DROP INDEX IF EXISTS "products_shopify_product_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "products_shopify_product_id_key"
  ON "products" ("shopify_product_id") WHERE "shopify_product_id" IS NOT NULL;
DROP INDEX IF EXISTS "product_variants_shopify_variant_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_shopify_variant_id_key"
  ON "product_variants" ("shopify_variant_id") WHERE "shopify_variant_id" IS NOT NULL;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "title_en" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_html" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_html_en" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "vendor" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplier" text DEFAULT 'unknown' NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_title" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_description" text;

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

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "product_images_product_id_position_idx"
  ON "product_images" ("product_id", "position");

-- 0005: egen korg, parallellt med Shopify. Se drizzle/0005_owned_carts.sql.
ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "minimum_order_quantity" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "order_increment" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "inventory_tracked" boolean DEFAULT true NOT NULL;

DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_minimum_order_quantity_check"
    CHECK ("minimum_order_quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_order_increment_check"
    CHECK ("order_increment" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "carts" (
  "id" text PRIMARY KEY,
  "status" text DEFAULT 'active' NOT NULL,
  "customer_no" text,
  "locale" text DEFAULT 'sv' NOT NULL,
  "currency" text DEFAULT 'sek' NOT NULL,
  "pricing_version" text DEFAULT 'v1' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL CHECK ("version" > 0),
  "expires_at" timestamp with time zone NOT NULL,
  "checkout_started_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "carts_status_expires_at_idx" ON "carts" ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "cart_id" text NOT NULL,
  "variant_id" integer NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk"
    FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk"
    FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_variant_key" ON "cart_items" ("cart_id", "variant_id");
CREATE INDEX IF NOT EXISTS "cart_items_cart_id_idx" ON "cart_items" ("cart_id");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cart_id" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cart_version" integer;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk"
    FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_cart_version_key"
  ON "orders" ("cart_id", "cart_version")
  WHERE "cart_id" IS NOT NULL AND "cart_version" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_supplier_check"
    CHECK (length(btrim("supplier")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "products_supplier_idx" ON "products" ("supplier");

-- 0007: full localized collection content and repeatable image imports.
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
