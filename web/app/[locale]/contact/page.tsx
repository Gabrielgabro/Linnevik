import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getCanonicalUrl } from '@/lib/metadata';
import ContactClient from './ContactClient';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.contact.hero.title + " | Linnevik",
        description: "Kontakta oss för frågor om våra produkter, offerter eller samarbeten.",
        metadataBase: new URL('https://linnevik.se'),
        alternates: {
            canonical: getCanonicalUrl(locale, '/contact'),
            languages: {
                'sv': 'https://linnevik.se/sv/contact',
                'en': 'https://linnevik.se/en/contact',
            },
        },
    };
}

export default function ContactPage() {
    return <ContactClient />;
}
