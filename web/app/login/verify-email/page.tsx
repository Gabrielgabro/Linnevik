import type { Metadata } from 'next';
import VerifyEmailClient from './VerifyEmailClient';
import { getTranslations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE } from '@/lib/languageConfig';

const t = getTranslations(DEFAULT_LANGUAGE);

export const metadata: Metadata = {
    title: t.verifyEmail.metadata.title,
    description: t.verifyEmail.metadata.description,
};

export default function VerifyEmailPage() {
    return <VerifyEmailClient />;
}
