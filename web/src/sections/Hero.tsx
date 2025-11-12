
'use client'

export default function Example() {
    return (
        <div className="px-6 pt-14 lg:px-8">
            <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
                <div className="mb-8 flex justify-center px-4">
                    <div className="relative rounded-2xl md:rounded-full px-4 py-2.5 text-sm leading-relaxed text-center text-muted ring-1 ring-custom hover:ring-custom-hover transition-all max-w-lg">
                        Vår senaste nyhet - handtvål med specialbeställda förpacknignar och dofter.{' '}
                        <a href="#" className="font-semibold text-accent whitespace-nowrap inline-block">
                            <span aria-hidden="true" className="absolute inset-0 rounded-2xl md:rounded-full" />
                            Läs mer <span aria-hidden="true">&rarr;</span>
                        </a>
                    </div>
                </div>
                <div className="text-center">
                    <h1 className="text-4xl font-semibold tracking-tight text-balance text-primary sm:text-5xl lg:text-7xl">
                        En ny identitet för ditt hotell
                    </h1>
                    <p className="mt-6 text-base font-medium text-pretty text-secondary sm:mt-8 sm:text-lg lg:text-xl/8">
                        Linnevik är en hotellgrossist som har samarbetat med många hotell i Sverige.
                        Sedan 1986 har Linnevik utvecklat och stött sina kunder inom design, utveckling och produktion av skräddarsydda hotellprodukter och dekorativa textilier.
                    </p>
                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        <a
                            href="/collections"
                            className="rounded-md bg-accent-primary px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-500"
                        >
                            Produkter
                        </a>
                        <a href="about" className="text-sm leading-6 font-semibold text-primary">
                            Mer om oss <span aria-hidden="true">→</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
