import { redirect } from 'next/navigation';

// This page must be dynamic - we can't pre-generate all possible reset tokens
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string; id: string; resetToken: string }>;
};

export default async function ResetPasswordPage({ params }: Props) {
    const { locale } = await params;
    redirect(`/${locale === 'en' ? 'en' : 'sv'}/login`);
}
