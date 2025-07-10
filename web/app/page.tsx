import { getFirstProduct } from '@/lib/shopify';
import Button from '@/components/Button';

export default async function Home() {
  const data   = await getFirstProduct();
  const edge   = data?.data?.products?.edges?.[0];
  const title  = edge?.node?.title ?? 'Inga produkter hittades';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base">
      <h1 className="mb-4 text-2xl font-bold text-ink">{title}</h1>
      <Button>Skapa företagskonto</Button>
    </main>
  );
}

