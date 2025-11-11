import ProductGallery from '@/components/ProductGallery';
import ProductForm from '@/components/ProductForm';
import Breadcrumbs from '@/components/Breadcrumbs';
import { getProductByHandle } from '@/lib/shopify';

export default async function ProductPage({ params }: { params: { handle: string } }) {
    const product = await getProductByHandle(params.handle);
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
            { href: `/products/${params.handle}`, label: product.title }
          ]
        : [
            { href: "/products", label: "Produkter" },
            { href: `/products/${params.handle}`, label: product.title }
          ];

    return (
        <main className="max-w-6xl mx-auto px-6 pt-32 pb-10 space-y-6">
            <Breadcrumbs items={breadcrumbItems} />
            <div className="grid gap-10 md:grid-cols-2">
                <ProductGallery images={images} />
            <section>
                <h1 className="text-3xl font-semibold text-primary mb-2">{product.title}</h1>
                <div className="prose prose-neutral max-w-none mb-6" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
                <ProductForm
                    options={product.options}
                    variants={variants}
                    moq={moq}
                    packSize={packSize}
                />
                {product.leadTime?.value && (
                    <p className="text-sm text-secondary mt-4">Leveranstid: {product.leadTime.value}</p>
                )}
            </section>
            </div>
        </main>
    );
}