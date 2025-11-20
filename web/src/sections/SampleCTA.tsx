'use client';

import { useTranslation } from '@/hooks/useTranslation';

export default function SampleCTA() {
  const { t } = useTranslation();

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center bg-[#0B3D2E] dark:bg-[#145C45] rounded-3xl overflow-hidden">
          {/* Image side - Left */}
          <div className="relative h-96 lg:h-full min-h-[400px]">
            <img
              alt={t.home.sampleCta.imageAlt}
              src="/Supporting_visuals/Sample.png"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* Content side - Right */}
          <div className="px-6 py-12 lg:py-16 lg:pr-12">
            <p className="text-sm font-medium text-white/90 uppercase tracking-wide mb-4">
              {t.home.sampleCta.eyebrow}
            </p>
            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
              {t.home.sampleCta.title}
            </h3>
            <p className="text-lg text-white/90 mb-8 max-w-lg">
              {t.home.sampleCta.body}
            </p>
            <a
              href="/samples"
              className="inline-flex items-center justify-center rounded-xl bg-[#2E5A8F] hover:bg-[#4F6F8E] px-6 py-3 text-base font-semibold text-white hover:text-white shadow-lg transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F6F8E]"
            >
              {t.home.sampleCta.button}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
