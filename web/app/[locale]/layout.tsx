import type { Metadata } from "next";
import { normalizeLocale } from "@/lib/i18n";
import { SUPPORTED_LANGUAGES } from "@/lib/languageConfig";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://linnevik.se';

  return {
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        sv: `${baseUrl}/sv`,
        en: `${baseUrl}/en`,
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  return (
    <LocaleProvider locale={locale}>
      <Header />
      {children}
      <Footer />
      <CookieBanner />
      <RegionSelectorModal />
    </LocaleProvider>
  );
}

