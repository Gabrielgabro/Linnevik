import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
import { getCanonicalUrl } from '@/lib/metadata';
import ContactClient from './ContactClient';
import { getStaticLocaleParams } from '@/lib/staticParams';

export async function generateStaticParams() {
    return getStaticLocaleParams();
}

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.contact.hero.title + " | Linnevik",
        description: t.contact.metadata.description,
        alternates: getHreflang('/contact'),
    };
}

export default function ContactPage() {
    return <ContactClient />;
}
