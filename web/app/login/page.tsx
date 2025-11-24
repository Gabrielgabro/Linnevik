import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import LoginClient from './LoginClient';
import { getTranslations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE } from '@/lib/languageConfig';

const t = getTranslations(DEFAULT_LANGUAGE);

export const metadata: Metadata = {
    title: t.login.metadata.title,
    description: t.login.metadata.description,
};

export default async function LoginPage() {
    // Check if already logged in
    const cookieStore = await cookies();
    const token = cookieStore.get('shopify_customer_token')?.value;

    if (token) {
        redirect('/account');
    }

    return <LoginClient />;
}
