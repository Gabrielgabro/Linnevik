/**
 * Lägger upp bilderna till Fritz Magnus-badrockarna (0039) i Vercel Blob.
 *
 * Syskon till `import-franzen-images.mjs`, med samma pipeline — skala till
 * 2000 px, skriv om till jpeg, `source_url` som omkörningsnyckel — men en
 * annan källa. Artikelfilens produkter har en bildmapp per artikel som vi fått
 * som filer; de här fyra saknade bilder helt, och URL:erna kom i stället ur
 * skrapningen (`hidden_products/Badrock_produkter_franzenstextil.xlsx`, bladet
 * "Bilder"). Filerna är hämtade därifrån till `hidden_products/bilder/<art>/`.
 *
 * Tre saker skiljer sig från syskonet, alla på grund av källan:
 *
 *  1. **Dubbletter mellan artiklar.** Prestige och Alexia har ett artikelnummer
 *     per storlek, och Pimcore har laddat upp samma foton en gång per artikel
 *     (filnamn `..._2.jpg` och `..._2_1.jpg`). De är byte-identiska, så
 *     urvalet dedupliceras på sha256 och inte på filnamn.
 *  2. **Upplösning säger ingenting om nyttan här.** Det frestande vore att
 *     sortera på storlek och slänga småbilderna. Det vore fel: de stora
 *     filerna (4000 px, 7–15 MB) är *miljöbilder* — en kvinna vid ett fönster,
 *     en man vid en isfontän i blått spa-ljus — medan sajtens 450 × 600-filer
 *     är de riktiga packshotsen på skyltdocka: fram, bak, ficka, krage. En
 *     blåtonad miljöbild som huvudbild får en vit rock att se blå ut. Ordningen
 *     nedan är därför satt efter vad bilden *visar*, efter att varje fil
 *     granskats, och inte efter antalet pixlar.
 *  3. **Tom fil.** 7709400_..._06.jpg är 0 byte hos leverantören och hoppas
 *     över.
 *
 * Torrkörning: node scripts/import-franzen-badrock-images.mjs
 * Skriv:       node scripts/import-franzen-badrock-images.mjs --apply
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(here, '../.env.local'));

const BILDER = resolve(here, '../../catalog/external_suppliers/franzen/hidden_products/bilder');
const MAX_EDGE = 2000;
const QUALITY = 82;
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

/**
 * Galleriordningen per produkt, som `<artikelkod>/<filnamn>`. Packshot först,
 * detaljer sedan, miljöbild sist — samma logik som en produktsida vill ha.
 *
 * Prestige och Alexia har ett artikelnummer per storlek (M och XL) men delar
 * samtliga foton; bara den ena artikelns filer räknas upp, resten faller bort
 * som dubbletter ändå.
 */
const PRODUCT_ARTICLES = [
  {
    handle: 'morgonrock-gap',
    // _02 är helbilden på docka, _01 kragen, _03 fickan.
    filer: ['7703101/7703101_gap-badrock-piping-xl-vit_02.webp',
            '7703101/7703101_gap-badrock-piping-xl-vit_01.webp',
            '7703101/7703101_gap-badrock-piping-xl-vit_03.webp'],
  },
  {
    handle: 'morgonrock-prestige',
    // _01–_03 packshots (fram, ärm/ficka, bak), sedan miljöbilderna.
    filer: ['7705200/7705200_prestige-badrock-velour-schalkrage-piping-m_01.jpg',
            '7705200/7705200_prestige-badrock-velour-schalkrage-piping-m_02.jpg',
            '7705200/7705200_prestige-badrock-velour-schalkrage-piping-m_03.jpg',
            '7705200/7705200_prestige-badrock-velour-schalkrage-piping-m_05.jpg',
            '7705200/7705200_prestige-badrock-velour-schalkrage-piping-m_04.jpg'],
  },
  {
    handle: 'morgonrock-gossip',
    // _01–_04 packshots. _05 är miljöbilden i blått spa-ljus och ligger sist
    // med flit: som huvudbild hade den fått den vita rocken att se blå ut.
    filer: ['7707100/7707100_gossip-badrock-velour-kimono-designfickor_01.jpg',
            '7707100/7707100_gossip-badrock-velour-kimono-designfickor_02.jpg',
            '7707100/7707100_gossip-badrock-velour-kimono-designfickor_03.jpg',
            '7707100/7707100_gossip-badrock-velour-kimono-designfickor_04.jpg',
            '7707100/7707100_gossip-badrock-velour-kimono-designfickor_05.jpg'],
  },
  {
    handle: 'morgonrock-alexia',
    // _01 är packshot i 1339 × 1771 — enda produkten med en helbild i vettig
    // upplösning. Ingen miljöbild finns. _06 är dubblett av _02.
    filer: ['7709200/7709200_alexia-badrock-velour-schalkrage-m_01.jpg',
            '7709200/7709200_alexia-badrock-velour-schalkrage-m_02.jpg',
            '7709200/7709200_alexia-badrock-velour-schalkrage-m_03.jpg',
            '7709200/7709200_alexia-badrock-velour-schalkrage-m_04.jpg',
            '7709200/7709200_alexia-badrock-velour-schalkrage-m_05.jpg'],
  },
];

const ALT = {
  '7703101': 'Vit badrock Gap i våffelvävd bomullsblandning med sjalkrage och vit satinpasspoal',
  '7705200': 'Vit badrock Prestige i velour med sjalkrage och vit satinpasspoal',
  '7705300': 'Vit badrock Prestige i velour med sjalkrage och vit satinpasspoal',
  '7707100': 'Vit badrock Gossip i velour, kimonomodell med dekorativa stickningar',
  '7709200': 'Vit badrock Alexia i randig velourjacquard med sjalkrage och broderad krona',
  '7709400': 'Vit badrock Alexia i randig velourjacquard med sjalkrage och broderad krona',
};

const IMAGE = /\.(jpe?g|png|webp)$/i;
const sql = neon(process.env.DATABASE_URL);

let uploaded = 0;
let sourceBytes = 0;
let outputBytes = 0;
const skipped = [];

for (const { handle, filer } of PRODUCT_ARTICLES) {
  const [product] = await sql`select id, title from products where handle = ${handle}`;
  if (!product) throw new Error(`${handle}: produkten finns inte — kör migrering 0039 först`);

  const existing = await sql`
    select id, url, blob_pathname, source_url from product_images
     where product_id = ${product.id} order by position`;
  const alreadyUploaded = new Map(
    existing.filter(row => row.source_url?.startsWith('franzen:')).map(row => [row.source_url, row])
  );

  // Kandidaterna i den ordning listan anger. Ingen sortering här: ordningen
  // *är* redaktionell och står i PRODUCT_ARTICLES.
  const seen = new Set();
  const candidates = [];
  for (const rel of filer) {
    const [artikelkod, file] = rel.split('/');
    const path = join(BILDER, artikelkod, file);
    let bytes;
    try {
      bytes = statSync(path).size;
    } catch {
      throw new Error(`${rel}: filen saknas — hämta bilderna först (se skriptets huvud)`);
    }
    if (bytes === 0) {
      skipped.push(`${rel} — tom fil (0 byte hos leverantören)`);
      continue;
    }
    const source = readFileSync(path);
    const sha = createHash('sha256').update(source).digest('hex');
    if (seen.has(sha)) {
      skipped.push(`${rel} — dubblett av en bild som redan tagits med`);
      continue;
    }
    const meta = await sharp(source).metadata();
    seen.add(sha);
    candidates.push({ artikelkod, file, source, meta, bytes });
  }

  console.log(`\n${handle} (#${product.id}) — ${candidates.length} bilder`);
  if (!candidates.length) throw new Error(`${handle}: inga användbara bilder`);

  const inserts = [];
  let position = 0;
  for (const c of candidates) {
    const body = await sharp(c.source)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    const { width, height } = await sharp(body).metadata();
    sourceBytes += c.bytes;
    outputBytes += body.length;

    const sourceUrl = `franzen:${c.artikelkod}/${c.file}`;
    const reused = apply && !force && alreadyUploaded.has(sourceUrl);
    console.log(
      `  ${String(position).padStart(2)}  ${c.file.slice(0, 56).padEnd(56)}  ` +
        `${(c.bytes / 1e6).toFixed(1)} MB → ${(body.length / 1e6).toFixed(2)} MB  ` +
        `${c.meta.width}×${c.meta.height} → ${width}×${height}` + (reused ? '  (ligger redan uppe)' : '')
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
        alt: ALT[c.artikelkod] ?? null,
        width,
        height,
        position,
      });
    }
    uploaded += 1;
    position += 1;
  }

  if (apply) {
    const written = new Set();
    for (const row of inserts) {
      const [saved] = await sql`
        insert into product_images
          (product_id, url, blob_pathname, source_url, alt_text, width, height, position)
        values (${product.id}, ${row.url}, ${row.pathname}, ${row.sourceUrl}, ${row.alt},
                ${row.width}, ${row.height}, ${row.position})
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
    if (stale.length > 0) await sql`delete from product_images where id = any(${stale.map(r => r.id)})`;
    await sql`update products set updated_at = now() where id = ${product.id}`;
  }
}

console.log(
  `\n${uploaded} bilder, ${(sourceBytes / 1e6).toFixed(0)} MB original → ${(outputBytes / 1e6).toFixed(1)} MB uppladdat`
);
if (skipped.length) {
  console.log(`\n${skipped.length} bortsorterade:`);
  for (const s of skipped) console.log(`  ${s}`);
}
if (!apply) console.log('\nTorrkörning. Kör med --apply för att ladda upp och koppla.');
