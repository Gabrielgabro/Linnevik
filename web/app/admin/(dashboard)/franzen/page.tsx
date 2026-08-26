import Link from 'next/link';
import { cookies } from 'next/headers';
import FranzenPricing from '@/components/admin/FranzenPricing';
import { PageHeader, StatRow, StatTile, buttonClass } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { articleForSku } from '@/data/franzenArticles';
import {
  franzenCollectedAt,
  franzenVariantCompetitors,
  SPIS_SERVIS_NOTE,
} from '@/data/franzenCompetitorPrices';
import { listFranzenVariantProducts } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

const sek = (v: number, decimals = 0) =>
  v.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default async function AdminFranzenPricingPage() {
  const user = await readSessionValue((await cookies()).get(ADMIN_COOKIE)?.value);
  const products = await listFranzenVariantProducts();

  const variants = products.flatMap(p => p.variants);
  const withCost = variants.filter(v => articleForSku(v.sku) !== null);
  const withMarket = variants.filter(v => (franzenVariantCompetitors[v.sku] ?? []).length > 0);

  // Påslaget mätt över de varianter där båda talen finns. Ett enkelt medel per
  // variant, inte ett volymvägt — vi har ingen försäljningsvolym att väga med.
  const markups = withCost
    .map(v => {
      const cost = articleForSku(v.sku)!.inköpspris;
      return cost && cost > 0 ? v.priceMinor / 100 / cost : null;
    })
    .filter((n): n is number => n !== null);
  const avgMarkup = markups.length ? markups.reduce((a, b) => a + b, 0) / markups.length : 0;

  // Varianter där någon av de fem säljer exakt vår artikel — och gör det
  // billigare än vi. Det är sidans skarpaste siffra.
  const undercut = variants.filter(v => {
    const rows = franzenVariantCompetitors[v.sku] ?? [];
    return rows.some(r => r.sameArticle && r.priceSek < v.priceMinor / 100);
  });

  return (
    <>
      <PageHeader
        kicker={`Franzén's Textil i Kinna AB · marknadsdata insamlad ${franzenCollectedAt}`}
        title="Vad andra tar för de produkter vi köper av Franzén"
        accent={accentFor('/admin/franzen')}
        description={
          <>
            Samma uppställning som prisbilden för Kina-sändningen, men med ett annat
            kostnadsunderlag: här är <b className="font-semibold text-ink">Franzéns inköpspris</b>{' '}
            ur artikelfilen, inte en landad kostnad — frakten in till oss ligger utanför, så den
            verkliga marginalen är något lägre än den som räknas ut här. Konkurrenterna är Livv,
            Tingstad, Sovtex, Bygghemma och Spis & Servis. Alla belopp i SEK per styck exklusive
            moms; konsumentpriser är omräknade med /1,25.
          </>
        }
        actions={
          <Link href="/admin" className={buttonClass('secondary', 'sm')}>
            Prisbild – egna produkter
          </Link>
        }
      />

      <StatRow>
        <StatTile
          label="Varianter"
          value={String(variants.length)}
          accent="var(--adm-brand)"
          hint={`${products.length} produkter med leverantör Franzén`}
        />
        <StatTile
          label="Med inköpspris"
          value={String(withCost.length)}
          accent="var(--viz-s3)"
          hint={`${variants.length - withCost.length} varianter är obelagda mot Franzéns artikelfil`}
        />
        <StatTile
          label="Med marknadsdata"
          value={String(withMarket.length)}
          accent="var(--viz-s2)"
          hint="Varianter där minst en av de fem har en jämförbar artikel"
        />
        <StatTile
          label="Snittpåslag"
          value={`${sek(avgMarkup, 2)}×`}
          accent="var(--viz-s1)"
          hint="Nuvarande pris delat med inköpspris, snitt över de belagda varianterna"
        />
      </StatRow>

      {undercut.length > 0 && (
        <div
          className="rounded-card border bg-surface px-5 py-4 text-[13px] leading-relaxed shadow-card sm:px-6"
          style={{ borderColor: 'var(--adm-danger)' }}
        >
          <b className="font-semibold text-ink">
            {undercut.length} {undercut.length === 1 ? 'variant säljs' : 'varianter säljs'} billigare
            av någon annan — som exakt samma artikel.
          </b>{' '}
          Sovtex för Textilgruppens och Borganäs egna varor direkt till slutkund, med samma
          artikelnummer som står på vår inköpsfaktura. En hotellinköpare som söker på
          produktnamnet hittar dem. De raderna är rödmarkerade i graferna nedanför:{' '}
          {undercut.map(v => v.sku).join(', ')}.
        </div>
      )}

      <FranzenPricing user={user} products={products} />

      <p className="text-[12.5px] leading-relaxed text-ink-3">{SPIS_SERVIS_NOTE}</p>
    </>
  );
}
