import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
    title: 'Logga in | Linnevik',
    description: 'Sign in to your Linnevik account to manage orders and deliveries.',
};

export default function LoginPage() {
    return <LoginClient />;
}
