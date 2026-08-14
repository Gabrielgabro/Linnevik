import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import ProductEditor from '@/components/admin/ProductEditor';
import { getProductBreadcrumb } from '@/lib/catalogDb';
import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import { getProductDetail, listCollectionsForAdmin, productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  if (!productsConfigured()) notFound();

  const detail = await getProductDetail(handle);
  if (!detail) notFound();

  const [collections, crumbs] = await Promise.all([
    listCollectionsForAdmin(),
    getProductBreadcrumb(handle, 'sv'),
  ]);

  // Landad kostnad finns bara för de sex vi faktiskt lagerför. Där den finns
  // är den värd att visa bredvid priset — en variant som säljs under självkost
  // ska inte behöva upptäckas i efterhand.
  const landed = landedProducts.find(row => row.handle === handle);
  const landedCostSek = landed ? landedPerPcs(landed) : null;

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 rounded-ctl px-1.5 py-1 hover:bg-surface hover:text-ink"
        >
          <ArrowLeft size={13} strokeWidth={2} aria-hidden />
          Produkter
        </Link>
        {crumbs.map(crumb => (
          <span key={crumb.handle} className="flex items-center gap-1">
            <ChevronRight size={13} strokeWidth={2} aria-hidden className="opacity-60" />
            {crumb.title}
          </span>
        ))}
        {crumbs.length === 0 && (
          <span className="flex items-center gap-1 text-danger">
            <ChevronRight size={13} strokeWidth={2} aria-hidden className="opacity-60" />
            Ingen kategori — brödsmulan på sajten blir tom
          </span>
        )}
      </nav>

      <ProductEditor
        detail={detail}
        collections={collections}
        landedCostSek={landedCostSek}
        landedConfidence={landed?.confidence ?? null}
      />
    </>
  );
}
