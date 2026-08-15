import type { Metadata } from 'next';
import VerifyClient from './VerifyClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, noIndexMetadata } from '@/lib/metadata';

// Kan inte förgenereras — token är dynamisk per mejl.
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.magicLinkVerify.metadata.title,
        description: t.magicLinkVerify.metadata.description,
        alternates: getHreflang('/login/verify', locale),
        ...noIndexMetadata,
    };
}

/**
 * Visar bara en knapp — löser aldrig in token vid sidladdning (GET). Det är
 * det som gör länken säker att skicka i ett mejl: säkerhetsfilter som Microsoft
 * Defender hämtar länkar automatiskt för att granska dem, och om den hämtningen
 * konsumerade token skulle länken vara förbrukad innan mottagaren klickat.
 * Se lib/magicLink.ts.
 */
export default async function VerifyMagicLinkPage({ searchParams }: Props) {
    const { token } = await searchParams;
    return <VerifyClient token={token ?? null} />;
}
