import ProductTable from '@/components/admin/ProductTable';
import { Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listProductsForAdmin, productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const products = await listProductsForAdmin();

  const variants = products.reduce((sum, p) => sum + p.variantCount, 0);
  const linked = products.filter(p => p.stripeProductId).length;

  return (
    <>
      <PageHeader
        kicker="Katalog"
        title="Produkter"
        accent={accentFor('/admin/products')}
        description="Katalogen som kassan säljer ur. Priset på varianten är det pricing.ts räknar
          fram och skickar till Stripe — ändrar du det här ändras det i kassan."
      />

      <StatRow>
        <StatTile label="Produkter" value={products.length} accent="var(--adm-brand)" />
        <StatTile label="Varianter" value={variants} accent="var(--viz-s4)" />
        <StatTile
          label="I Stripe"
          value={linked}
          accent={linked === products.length ? 'var(--adm-ok)' : 'var(--adm-warn)'}
          hint={
            linked === products.length
              ? 'Hela katalogen är kopplad'
              : `${products.length - linked} saknar koppling`
          }
        />
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
