import FeaturedGrid from "@/sections/FeaturedGrid";
import ClientLogosRotating from "@/sections/ClientLogosRotating";
import CategoriesTeaser from "@/sections/CategoriesTeaser";
import SampleCTA from '@/sections/SampleCTA';
import Hero from "@/sections/Hero";
import HomePageBubbles from "@/components/HomePageBubbles";
import { Metadata } from 'next';
import { normalizeLocale } from '@/lib/i18n';
import { getTranslations } from '@/lib/getTranslations';
import { getHreflang } from '@/lib/metadata';

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    const title = locale === 'sv'
        ? 'Linnevik - Hållbara textilier för hotell och offentlig miljö'
        : 'Linnevik - Sustainable Textiles for Hotels and Public Spaces';

    const description = locale === 'sv'
        ? 'Linnevik levererar hållbara och hållbara textilier för hotell, restauranger och offentliga miljöer. Högkvalitativa linnevaror för professionell användning.'
        : 'Linnevik supplies sustainable and durable textiles for hotels, restaurants and public spaces. High-quality linens for professional use.';

    return {
        title,
        description,
        alternates: getHreflang('/', locale),
        openGraph: {
            title,
            description,
            url: `https://linnevik.se/${locale}`,
            siteName: 'Linnevik',
            locale: locale === 'sv' ? 'sv_SE' : 'en_US',
            type: 'website',
        },
    };
}

export default async function Home({ params }: Props) {
    const { locale } = await params;
    return (
        <>
            <HomePageBubbles />
            <Hero />
            <ClientLogosRotating />
            <CategoriesTeaser locale={locale} />
            <FeaturedGrid locale={locale} />
            <SampleCTA />
        </>
    );
}