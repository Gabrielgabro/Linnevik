// web/app/about/page.tsx (utdrag)

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            {/* Hero Section */}
            <section className="relative h-[80vh] min-h-[520px] w-full overflow-hidden">
                {/* Bakgrundsbild */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: "url('/images/about-hero-archipelago.jpg')" }}
                />

                {/* Ljus overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/70 to-white/60 dark:from-[#111827]/70 dark:via-[#111827]/70 dark:to-[#111827]/60" />

                {/* Innehåll */}
                <div className="relative z-10 h-full max-w-6xl mx-auto px-6 flex items-center">
                    <div className="max-w-xl">
                        <div className="mt-8">
                            <a
                                href="#our-story"
                                className="inline-flex items-center text-sm font-semibold text-[#0B3D2E] hover:underline underline-offset-4"
                            >
                                Läs vår historia
                                <span className="ml-2 text-xs">↓</span>
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Resten av about-sidan */}
            <section id="our-story" className="py-24 lg:py-32">
                {/* ...din nuvarande story/values osv... */}
            </section>
        </main>
    );
}