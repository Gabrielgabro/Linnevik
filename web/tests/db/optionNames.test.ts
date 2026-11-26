/**
 * §1.5–1.7: ett alternativnamn har inga mellanslag runt sig, två varianter
 * med samma namn hör till samma val, och det engelska namnet är översatt.
 * Kudde Eric visade storleken som två val (A2). Datan rättas av
 * drizzle/0044_alternativnamn.sql, som globalSetup har kört på grenen.
 */

import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { deriveOptions } from '@/lib/catalogDb';

type Option = { name: string; value: string };
type Row = { handle: string; option_values: Option[]; option_values_en: Option[] | null };

async function variants(): Promise<Row[]> {
  const result = await getDb().execute(sql`
    select p.handle, v.option_values, v.option_values_en
      from product_variants v join products p on p.id = v.product_id
     order by v.id
  `);
  return result.rows as Row[];
}

describe('alternativens namn', () => {
  it('har inga mellanslag runt sig och börjar med versal', async () => {
    for (const row of await variants()) {
      for (const option of [...row.option_values, ...(row.option_values_en ?? [])]) {
        expect(option.name, row.handle).toBe(option.name.trim());
        expect(option.name[0], row.handle).toBe(option.name[0].toUpperCase());
      }
    }
  });

  it('är översatta till engelska', async () => {
    const untranslated = new Set(['Storlek', 'Fyllning', 'Färg', 'Brodyr', 'Kvalitet', 'Doftprofil']);
    for (const row of await variants()) {
      for (const option of row.option_values_en ?? []) {
        expect(untranslated.has(option.name), `${row.handle}: ${option.name}`).toBe(false);
      }
    }
  });

  it('ger Kudde Eric ett enda storleksval med båda storlekarna', async () => {
    const rows = (await variants()).filter(row => row.handle === 'standard-kudde');
    expect(rows).toHaveLength(2);
    const asVariantRows = rows.map(row => ({ option_values: row.option_values })) as Parameters<typeof deriveOptions>[0];
    expect(deriveOptions(asVariantRows)).toEqual([{ name: 'Storlek', values: ['50 x 70', '60 x 80'] }]);
  });
});
