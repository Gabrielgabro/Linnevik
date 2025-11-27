'use client';

import { useTranslation } from '@/hooks/useTranslation';

export default function SampleCTA() {
  const { t } = useTranslation();

  return (
    <section className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center bg-[#0B3D2E] dark:bg-[#145C45] rounded-3xl overflow-hidden">
          {/* Content side - Left */}
          <div className="px-6 py-6 lg:pl-12">
            <p className="text-sm font-medium text-white/90 uppercase tracking-wide mb-4">
              {t.home.sampleCta.eyebrow}
            </p>
            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              {t.home.sampleCta.title}
            </h3>
            <p className="text-lg text-white/90 mb-6 max-w-lg">
              {t.home.sampleCta.body}
            </p>
            <a
              href="/samples"
              className="inline-flex items-center justify-center rounded-none bg-[#2E5A8F] hover:bg-[#4F6F8E] px-6 py-3 text-base font-semibold text-white hover:text-white shadow-lg transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F6F8E]"
            >
              {t.home.sampleCta.button}
            </a>
          </div>

          {/* Image side - Right */}
          <div className="relative h-[180px] lg:h-[400px] min-h-[100px]">
            <img
              alt={t.home.sampleCta.imageAlt}
              src="/Supporting_visuals/Sample1.jpg"
              className="absolute inset-0 w-full h-full object-cover dark:hidden"
            />
            <img
              alt={t.home.sampleCta.imageAlt}
              src="/Supporting_visuals/sample_1_darkmode.jpg"
              className="absolute inset-0 w-full h-full object-cover hidden dark:block"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
