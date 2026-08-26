/**
 * Lägger upp Franzéns produktbilder i Vercel Blob och kopplar dem till våra
 * produkter, i stället för de AI-genererade platshållarna som ligger där nu.
 *
 * Källa: catalog/external_suppliers/franzen/franzén_products_2026/, en mapp per
 * artikel namngiven "Benämning (Artikelkod)". Vilken artikel som hör till
 * vilken variant står i src/data/franzenArticles.ts (`skuToArtikelkod`).
 *
 *   node scripts/import-franzen-images.mjs           # visar vad som skulle hända
 *   node scripts/import-franzen-images.mjs --apply   # gör det
 *
 * Originalen är upp till 15 MB styck och ska inte upp som de är. Varje bild
 * skalas till max 2000 px och skrivs om till jpeg innan den laddas upp.
 *
 * Bilderna kopplas på produkten och inte på varianten, eftersom produktsidan
 * läser product_images utan att bry sig om variant_id (se catalogDb.ts). För
 * en produkt med två artiklar — Handduk Enzo, vit och grå — hamnar därför båda
 * artiklarnas bilder i samma galleri, i den ordning artiklarna står i
 * mappningen.
 *
 * Platshållarraderna tas bort ur databasen, men blob-filerna raderas inte:
 * skriptet skriver ut deras pathnames så att de går att städa när de nya
 * bilderna är godkända.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(here, '../.env.local'));

const CATALOG = resolve(here, '../../catalog/external_suppliers/franzen/franzén_products_2026');
const MAX_EDGE = 2000;
const QUALITY = 82;
const apply = process.argv.includes('--apply');
// En omkörning laddar inte upp på nytt: bilder som redan ligger uppe känns
// igen på source_url och behåller sin blob. --force skriver upp dem ändå, för
// när originalet eller skalningen har ändrats.
const force = process.argv.includes('--force');

/**
 * Vilka artiklar som hör till vilken produkt, i galleriordning. Samma mappning
 * som `skuToArtikelkod` i src/data/franzenArticles.ts, men grupperad per
 * produkt — bilderna sitter på produkten, inte på varianten.
 */
const PRODUCT_ARTICLES = [
  { handle: 'lakan', artiklar: ['2676101', '2676301'] },
  { handle: 'paslakan', artiklar: ['2669101'] },
  { handle: 'handduk-ludde', artiklar: ['2649301', '2649343'] },
  { handle: 'morgonrock', artiklar: ['2660001'] },
  { handle: 'morgonrock-vaffel', artiklar: ['2662101'] },
];

const ALT = {
  '2676101': 'Vitt hotellakan 150 × 280 cm med grön märktråd',
  '2676301': 'Vitt hotellakan 240 × 280 cm med blå märktråd',
  '2669101': 'Vitt hotellpåslakan med vävd satinrand',
  '2649301': 'Vit frottéhandduk 450 g/m² med stapelbård',
  '2649343': 'Mörkgrå frottéhandduk 450 g/m² med stapelbård',
  '2660001': 'Vit badrock i frotté med sjalkrage och knytskärp',
  '2662101': 'Vit våffelbadrock, 200 g/m²',
};

/** Bilder som inte är packshots och behöver en egen alt-text. */
const ALT_BY_FILE = {
  'Rock.png': 'Måttskiss för badrocken: längd 128 cm, bröstvidd 72 cm, ärmlängd 50 cm, skärp 210 × 4 cm, fickor 20 × 18 cm',
};

const IMAGE = /\.(jpe?g|png|webp)$/i;

/**
 * Mapparna heter "Benämning (Artikelkod)". Fem artiklar har snedstreck i
 * benämningen ("Lakan b/p 150x280 cm") och har därför blivit två katalognivåer
 * när filerna packades upp, så sökningen måste gå ett steg ned också.
 */
function findArticleDir(artikelkod) {
  const suffix = `(${artikelkod})`;
  const hits = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.name.endsWith(suffix)) hits.push(full);
      else if (depth > 0) walk(full, depth - 1);
    }
  };
  walk(CATALOG, 1);
  if (hits.length !== 1) throw new Error(`${artikelkod}: hittade ${hits.length} mappar, väntade 1`);
  return hits[0];
}

/**
 * Packshoten först — den heter bara en artikelkod — sedan de numrerade i
 * ordning, och sist allt annat. Utan det bestämmer filsystemets sortering
 * vilken bild som blir produktens huvudbild, och "2660001_1.jpg" hade vunnit
 * över "2660001.JPG".
 *
 * Koden i filnamnet jämförs inte med mappens artikelkod: påslakanets bilder
 * heter 2682101 fast mappen heter (2669101). Bilderna föreställer rätt vara,
 * så filnamnen matchas mot vilken kod som helst i stället för mot mappens.
 */
function sortImages(files) {
  const rank = name => {
    const base = name.replace(IMAGE, '');
    if (/^\d+$/.test(base)) return [0, 0];
    const numbered = /^\d+[-_](\d+)$/.exec(base);
    if (numbered) return [1, Number(numbered[1])];
    return [2, 0];
  };
  return [...files].sort((a, b) => {
    const [ga, na] = rank(a);
    const [gb, nb] = rank(b);
    return ga - gb || na - nb || a.localeCompare(b);
  });
}

const sql = neon(process.env.DATABASE_URL);
let uploaded = 0;
let sourceBytes = 0;
let outputBytes = 0;
const orphaned = [];

for (const { handle, artiklar } of PRODUCT_ARTICLES) {
  const [product] = await sql`select id, title from products where handle = ${handle}`;
  if (!product) throw new Error(`${handle}: produkten finns inte`);

  const existing = await sql`
    select id, url, blob_pathname, source_url from product_images where product_id = ${product.id} order by position`;

  const placeholderCount = existing.filter(row => !row.source_url?.startsWith('franzen:')).length;
  console.log(
    `\n${handle} (#${product.id})` + (placeholderCount ? ` — ${placeholderCount} platshållare ersätts` : '')
  );
  // Bara platshållarna är intressanta att städa; en omkörnings egna rader
  // känns igen på source_url och ska inte hamna i städlistan.
  for (const row of existing) {
    if (!row.source_url?.startsWith('franzen:')) orphaned.push(row.blob_pathname);
  }

  const alreadyUploaded = new Map(
    existing.filter(row => row.source_url?.startsWith('franzen:')).map(row => [row.source_url, row])
  );

  let position = 0;
  const inserts = [];
  for (const artikelkod of artiklar) {
    const dir = findArticleDir(artikelkod);
    const files = sortImages(
      readdirSync(dir).filter(name => IMAGE.test(name) && !name.startsWith('.'))
    );
    if (files.length === 0) throw new Error(`${artikelkod}: inga bilder i ${dir}`);

    for (const file of files) {
      const source = readFileSync(join(dir, file));
      sourceBytes += statSync(join(dir, file)).size;
      const image = sharp(source).rotate().resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });
      const body = await image.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
      const { width, height } = await sharp(body).metadata();
      outputBytes += body.length;

      // Var bilden kom ifrån, så att en omkörning kan se att den redan ligger
      // uppe. Unikt per produkt via product_images_product_source_key.
      const sourceUrl = `franzen:${artikelkod}/${file}`;
      const sizeMb = (source.length / 1e6).toFixed(1);
      const outMb = (body.length / 1e6).toFixed(2);
      const reused = apply && !force && alreadyUploaded.has(sourceUrl);
      console.log(
        `  ${String(position).padStart(2)}  ${file}  ${sizeMb} MB → ${outMb} MB  ${width}×${height}` +
          (reused ? '  (ligger redan uppe)' : '')
      );

      if (apply) {
        const known = force ? undefined : alreadyUploaded.get(sourceUrl);
        const blob =
          known ??
          (await put(`products/${product.id}/${position}.jpg`, body, {
            access: 'public',
            contentType: 'image/jpeg',
            addRandomSuffix: true,
          }));
        inserts.push({
          url: known ? known.url : blob.url,
          pathname: known ? known.blob_pathname : blob.pathname,
          sourceUrl,
          alt: ALT_BY_FILE[file] ?? ALT[artikelkod] ?? null,
          width,
          height,
          position,
        });
      }
      uploaded += 1;
      position += 1;
    }
  }

  if (apply) {
    // Först in med de nya, sedan bort med platshållarna, i en följd — så att
    // produktsidan aldrig hinner rendera utan bild.
    //
    // Vid en omkörning träffar upserten raderna från förra körningen och
    // uppdaterar dem i stället för att skapa nya. De id:na står då kvar i
    // `existing`, och en blind radering av `existing` skulle ta bort precis
    // det som just skrevs. Därför samlas de uppdaterade id:na in och undantas.
    const written = new Set();
    for (const row of inserts) {
      const [saved] = await sql`
        insert into product_images
          (product_id, url, blob_pathname, source_url, alt_text, width, height, position)
        values (${product.id}, ${row.url}, ${row.pathname}, ${row.sourceUrl}, ${row.alt},
                ${row.width}, ${row.height}, ${row.position})
        -- Indexet är partiellt (source_url is not null), och ON CONFLICT måste
        -- upprepa villkoret för att Postgres ska hitta det.
        on conflict (product_id, source_url) where source_url is not null do update set
          url = excluded.url,
          blob_pathname = excluded.blob_pathname,
          alt_text = excluded.alt_text,
          width = excluded.width,
          height = excluded.height,
          position = excluded.position
        returning id`;
      written.add(saved.id);
    }
    const stale = existing.filter(row => !written.has(row.id));
    if (stale.length > 0) {
      await sql`delete from product_images where id = any(${stale.map(r => r.id)})`;
    }
    await sql`update products set updated_at = now() where id = ${product.id}`;
  }
}

console.log(
  `\n${uploaded} bilder, ${(sourceBytes / 1e6).toFixed(0)} MB original → ${(outputBytes / 1e6).toFixed(1)} MB uppladdat`
);
if (!apply) {
  console.log('Torrkörning. Kör med --apply för att ladda upp och koppla.');
} else {
  console.log('\nPlatshållarnas blob-filer ligger kvar och kan städas när bilderna är godkända:');
  for (const pathname of orphaned) console.log(`  ${pathname}`);
}
