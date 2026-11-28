import ProductTable from '@/components/admin/ProductTable';
import { Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listProductsForAdmin, productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const products = await listProductsForAdmin();

  const variants = products.reduce((sum, p) => sum + p.variantCount, 0);

  return (
    <>
      <PageHeader
        kicker="Katalog"
        title="Produkter"
        accent={accentFor('/admin/products')}
        description="Katalogen som kassan säljer ur. Listpriset på varianten är exklusive moms och är
          det kassan tar betalt — ändrar du det här ändras det i kassan."
      />

      <StatRow>
        <StatTile label="Produkter" value={products.length} accent="var(--adm-brand)" />
        <StatTile label="Varianter" value={variants} accent="var(--viz-s4)" />
      </StatRow>

      {!productsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Katalogen är tom i den här miljön.
        </Notice>
      )}

      <ProductTable products={products} />
    </>
  );
}
