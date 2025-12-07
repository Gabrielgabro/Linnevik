
import ActivateAccountClient from './ActivateAccountClient';

// This page must be dynamic - we can't pre-generate all possible activation tokens
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string; id: string; activationToken: string }>;
};

export const metadata = {
    title: 'Activate Account | Linnevik',
    description: 'Activate your Linnevik account',
};

export default async function ActivateAccountPage({ params }: Props) {
    const { id, activationToken } = await params;

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-6 py-16">
            <ActivateAccountClient id={id} activationToken={activationToken} />
        </main>
    );
}
