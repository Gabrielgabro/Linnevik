

'use client'



export default function Example() {
    return (
            <div className="px-6 pt-14 lg:px-8">
                <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
                    <div className="hidden sm:mb-8 sm:flex sm:flex-col sm:items-center sm:justify-center sm:space-y-3">
                        <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-muted ring-1 ring-custom ring-custom-hover">
                            Vår senaste nyhet - handtvål med specialbeställda förpacknignar och dofter.{' '}
                            <a href="#" className="font-semibold text-accent">
                                <span aria-hidden="true" className="absolute inset-0" />
                                Läs mer <span aria-hidden="true">&rarr;</span>
                            </a>
                        </div>
                    <div className="text-center">
                        <h1 className="text-5xl font-semibold tracking-tight text-balance text-primary sm:text-7xl">
                            En ny identitet för ditt hotell.
                        </h1>
                        <p className="mt-8 text-lg font-medium text-pretty text-secondary sm:text-xl/8">
                            Linnevik är en hotellgrossist som har samarbetat med många hotell i Sverige.
                            Sedan 1986 har Linnevik utvecklat och stött sina kunder inom design, utveckling och produktion av skräddarsydda hotellprodukter och dekorativa textilier.
                        </p>
                        <div className="mt-10 flex items-center justify-center gap-x-6">
                            <a
                                href="#"
                                className="rounded-md bg-accent-primary px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-500"
                            >
                                Utbud
                            </a>
                            <a href="#" className="text-sm leading-6 font-semibold text-primary">
                                Mer om oss <span aria-hidden="true">→</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
