import type { Metadata } from "next";
import "../globals.css";
import DocumentShell from "@/components/DocumentShell";
import { baseMetadata } from "@/lib/baseMetadata";
import { normalizeLocale } from "@/lib/i18n";
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from "@/lib/languageConfig";
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site';
import { LocaleProvider } from "@/contexts/LocaleContext";
import Header from "@/sections/Header";
import Footer from "@/sections/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import RegionSelectorModal from "@/components/RegionSelectorModal";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return SUPPORTED_LANGUAGES.map((lang) => ({
    locale: lang.code,
  }));
}

// `dynamicParams = false` stod här förr och gjorde jobbet med att 404:a ett
// okänt språk. Den togs bort med flit: Next avgör den inställningen för hela
// rutten och inte per segment (se build/static-paths/app.js), så flaggan här
// styrde även /[locale]/products/[handle] — där den hade betytt att varje
// produkt skapad efter senaste bygget svarade 404. (Det märktes inte då, eftersom
// den gamla rot-layouten läste headers() och gjorde allt dynamiskt.)
//
// Kontrollen av språket görs i stället uttryckligen nedan, i både
// generateMetadata och layouten: ett okänt språk anropar notFound() direkt.

// Den här layouten är butikens rot-layout och sätter <html lang> ur URL:en.
// Därför kan de publika sidorna förrenderas och cachas.
//
// Sidorna under den byggs om senast efter 60 sekunder. Det är bara ett
// skyddsnät: när något ändras i /admin töms cachen direkt (se
// src/lib/storefrontCache.ts). De 60 sekunderna gäller sådant som ändras utan
// att admin är inblandad, främst lagersaldot efter en order. Kassan räknar
// alltid pris och lager mot databasen, inte mot en cachad sida.
export const revalidate = 60;


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isSupportedLanguage(localeParam)) notFound();
  const locale = normalizeLocale(localeParam);

  return {
    ...baseMetadata,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        sv: `${SITE_URL}/sv`,
        en: `${SITE_URL}/en`,
        'x-default': `${SITE_URL}/sv`,
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  if (!isSupportedLanguage(localeParam)) notFound();
  const locale = normalizeLocale(localeParam);

  return (
    <DocumentShell lang={locale}>
      <LocaleProvider locale={locale}>
        <Header />
        {children}
        <Footer />
        <CookieBanner />
        <RegionSelectorModal />
      </LocaleProvider>
    </DocumentShell>
  );
}
