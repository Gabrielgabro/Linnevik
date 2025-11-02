export default function SampleCTA() {
  return (
    <section className="bg-[hsl(var(--surface))]">
      <div className="mx-auto max-w-7xl py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="relative isolate overflow-hidden border border-[hsl(var(--ring)/0.12)] bg-[hsl(var(--surface-elevated)/0.80)] px-6 pt-16 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--surface-elevated)/0.60)] sm:rounded-3xl sm:px-16 md:pt-24 lg:flex lg:gap-x-20 lg:px-24 lg:pt-0">
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-y-1/2 mask-[radial-gradient(closest-side,white,transparent)] sm:left-full sm:-ml-80 lg:left-1/2 lg:ml-0 lg:-translate-x-1/2 lg:translate-y-0"
          >
            <circle r={512} cx={512} cy={512} fill="url(#759c1415-0410-454c-8f7c-9a820de03641)" fillOpacity="0.7" />
            <defs>
              <radialGradient id="759c1415-0410-454c-8f7c-9a820de03641">
                <stop stopColor="#7775D6" />
                <stop offset={1} stopColor="#E935C1" />
              </radialGradient>
            </defs>
          </svg>

          <div className="mx-auto max-w-md text-center lg:mx-0 lg:flex-auto lg:py-32 lg:text-left">
            <h2 className="text-3xl font-semibold tracking-tight text-balance text-zinc-900 dark:text-white sm:text-4xl">
              Osäker? Beställ prover vetja!
            </h2>
            <p className="mt-6 text-lg/8 text-pretty text-zinc-600 dark:text-zinc-300">
              Du har möjlighet att beställa prover kostnadsfritt och artiklarna kommer levereras till ditt hotell.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6 lg:justify-start">
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/5 ring-1 ring-black/10 transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 dark:focus-visible:outline-white"
              >
                Beställ prover
              </a>
            </div>
          </div>

          <div className="relative mt-16 h-80 lg:mt-8">
            <img
              alt="App screenshot"
              src="https://tailwindcss.com/plus-assets/img/component-images/dark-project-app-screenshot.png"
              width={1824}
              height={1080}
              className="absolute top-0 left-0 w-228 max-w-none rounded-md bg-white/5 ring-1 ring-[hsl(var(--ring)/0.10)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
