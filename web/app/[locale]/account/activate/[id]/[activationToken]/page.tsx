
import { redirect } from 'next/navigation';

// This page must be dynamic - we can't pre-generate all possible activation tokens
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string; id: string; activationToken: string }>;
};

export default async function ActivateAccountPage({ params }: Props) {
    const { locale } = await params;
    redirect(`/${locale === 'en' ? 'en' : 'sv'}/login`);
}
