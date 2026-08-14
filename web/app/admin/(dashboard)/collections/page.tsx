import CollectionTree from '@/components/admin/CollectionTree';
import { Notice, PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
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
      <PageHeader
        kicker={`${collections.length} kategorier · ${withoutPrimary.length} produkter utan primär`}
        title="Kategorier"
        accent={accentFor('/admin/collections')}
        description="Trädet som brödsmulorna på sajten går efter. Föräldern ger hierarkin,
          positionen ger ordningen. Titlarna finns på båda språken — det är den
          enda tvåspråkiga texten sajten har utan att fråga någon annan."
      />

      {!productsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Trädet är tomt i den här miljön.
        </Notice>
      )}

      {withoutPrimary.length > 0 && (
        <Notice tone="warn" title="Produkter utan primär kategori">
          {withoutPrimary.map(product => product.title).join(', ')}. De produkterna får en tom
          brödsmula på sajten.
        </Notice>
      )}

      <CollectionTree collections={collections} />
    </>
  );
}
