import ProductTable from '@/components/admin/ProductTable';
import { listProductsForAdmin, productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const products = await listProductsForAdmin();

  const variants = products.reduce((sum, p) => sum + p.variantCount, 0);
  const linked = products.filter(p => p.stripeProductId).length;

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
          Katalog · {products.length} produkter · {variants} varianter · {linked} i Stripe
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Produkter
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
          Katalogen som kassan säljer ur. Priset på varianten är det pricing.ts räknar
          fram och skickar till Stripe — ändrar du det här ändras det i kassan.
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
          DATABASE_URL saknas, så katalogen är tom i den här miljön.
        </p>
      )}

      <ProductTable products={products} />
    </>
  );
}
