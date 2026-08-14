import CollectionTree from '@/components/admin/CollectionTree';
import { listCollectionsForAdmin, listProductsForAdmin, productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

export default async function AdminCollectionsPage() {
  const [collections, products] = await Promise.all([
    listCollectionsForAdmin(),
    listProductsForAdmin(),
  ]);

  // En produkt utan primär kategori får en tom brödsmula på sajten. Det syns
  // inte någon annanstans, så det räknas här.
  const withoutPrimary = products.filter(product => !product.primaryCollection);

  return (
    <>
      <header
        className="flex flex-col gap-[18px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          {collections.length} kategorier · {withoutPrimary.length} produkter utan primär
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Kategorier
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
          Trädet som brödsmulorna på sajten går efter. Föräldern ger hierarkin,
          positionen ger ordningen. Titlarna finns på båda språken — det är den
          enda tvåspråkiga texten sajten har utan att fråga någon annan.
        </p>
      </header>

      {!productsConfigured() && (
        <p
          className="rounded-[3px] border-l-2 py-2 pl-3 pr-3 text-[13.5px]"
          style={{
            color: 'var(--viz-ink-2)',
            borderColor: 'var(--viz-flag)',
            background: 'color-mix(in srgb, var(--viz-flag) 8%, transparent)',
          }}
        >
          DATABASE_URL saknas, så trädet är tomt i den här miljön.
        </p>
      )}

      {withoutPrimary.length > 0 && (
        <p
          className="rounded-[3px] border-l-2 py-2 pl-3 pr-3 text-[13.5px]"
          style={{
            color: 'var(--viz-ink-2)',
            borderColor: 'var(--viz-flag)',
            background: 'color-mix(in srgb, var(--viz-flag) 8%, transparent)',
          }}
        >
          Utan primär kategori: {withoutPrimary.map(product => product.title).join(', ')}. De
          produkterna får en tom brödsmula på sajten.
        </p>
      )}

      <CollectionTree collections={collections} />
    </>
  );
}
