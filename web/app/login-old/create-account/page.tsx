import type { Metadata } from 'next';
import CreateAccountClient from './CreateAccountClient';

export const metadata: Metadata = {
    title: 'Skapa konto | Linnevik',
    description: 'Create your Linnevik customer account.',
};

export default function CreateAccountPage() {
    return <CreateAccountClient />;
}
