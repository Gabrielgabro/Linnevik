'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

export default function ThankYouPage() {
    const { t } = useTranslation();

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-[#D9F0E8] dark:bg-[#0B3D2E] rounded-full flex items-center justify-center mx-auto mb-8 animate-fade-in-up">
                    <svg
                        className="w-10 h-10 text-[#0B3D2E] dark:text-[#379E7D]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                </div>

                {/* Text Content */}
                <div className="space-y-4 animate-fade-in-up delay-100">
                    <h1 className="text-4xl font-bold text-primary">
                        {t.thankYou?.title || 'Thank You!'}
                    </h1>
                    <p className="text-lg text-secondary leading-relaxed">
                        {t.thankYou?.message || 'We have received your request and will get back to you shortly.'}
                    </p>
                </div>

                {/* Action Button */}
                <div className="pt-4 animate-fade-in-up delay-200">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white transition-all duration-200 bg-[#0B3D2E] border border-transparent rounded-xl hover:bg-[#145C45] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0B3D2E] dark:bg-[#145C45] dark:hover:bg-[#1E755C] shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {t.thankYou?.backToHome || 'Back to Home'}
                    </Link>
                </div>
            </div>
        </main>
    );
}
