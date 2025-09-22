import { getFirstProduct } from '@/lib/shopify';
import Button from '@/components/Button';
import ClientLogosRotating from '@/components/ClientLogosRotating';

export default async function Home() {
  const data   = await getFirstProduct();
  const edge   = data?.data?.products?.edges?.[0];
  const title  = edge?.node?.title ?? 'Inga produkter hittades';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base">
      <h1 className="mb-4 text-2xl font-bold text-ink">{title}</h1>
      <Button>Skapa företagskonto</Button>
      <div className="mt-12 w-full">
        <ClientLogosRotating />
      </div>
    </main>
  );
}

