import ProductGallery from '@/components/ProductGallery';
import ProductForm from '@/components/ProductForm';
import Breadcrumbs from '@/components/Breadcrumbs';
import { getProductByHandle } from '@/lib/shopify';

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
    const { handle } = await params;
    const product = await getProductByHandle(handle);
    if (!product) return <div className="p-8">Produkten hittades inte.</div>;

    const images = product.images.edges.map(e => e.node);
    const variants = product.variants.edges.map(e => e.node);
    const moq = product.moq?.value ? Number(product.moq.value) : null;
    const packSize = product.packSize?.value ? Number(product.packSize.value) : null;

    // Build breadcrumbs with collection information
    const collections = product.collections.edges.map(e => e.node);
    const primaryCollection = collections[0]; // Use the first collection

    const breadcrumbItems = primaryCollection
        ? [
            { href: "/collections", label: "Kategorier" },
            { href: `/collections/${primaryCollection.handle}`, label: primaryCollection.title },
            { href: `/products/${handle}`, label: product.title }
          ]
        : [
            { href: "/products", label: "Produkter" },
            { href: `/products/${handle}`, label: product.title }
          ];

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-7xl mx-auto px-6 pt-32 pb-16">
                <Breadcrumbs items={breadcrumbItems} />

                {/* Product grid */}
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 mt-8">
                    {/* Gallery */}
                    <ProductGallery images={images} />

                    {/* Product info */}
                    <div className="space-y-8">
                        {/* Title and SKU */}
                        <div className="space-y-2">
                            <h1 className="text-4xl lg:text-5xl font-bold text-primary leading-tight">{product.title}</h1>
                            {variants[0]?.sku && (
                                <p className="text-sm text-secondary">SKU: {variants[0].sku}</p>
                            )}
                        </div>

                        {/* Product Form */}
                        <ProductForm
                            options={product.options}
                            variants={variants}
                            moq={moq}
                            packSize={packSize}
                        />

                        {/* Lead time */}
                        {product.leadTime?.value && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-[#F3EDE4] dark:bg-[#1f2937] rounded-xl border border-[#EBDCCB] dark:border-[#374151]">
                                <svg className="w-5 h-5 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-primary">Leveranstid: {product.leadTime.value}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Product description */}
                {product.descriptionHtml && (
                    <div className="mt-16 pt-16 border-t border-[#E7EDF1] dark:border-[#374151]">
                        <h2 className="text-2xl font-bold text-primary mb-6">Produktinformation</h2>
                        <div
                            className="prose prose-lg prose-neutral dark:prose-invert max-w-none prose-headings:text-primary prose-p:text-secondary prose-li:text-secondary prose-strong:text-primary"
                            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                        />
                    </div>
                )}
            </div>
        </main>
    );
}