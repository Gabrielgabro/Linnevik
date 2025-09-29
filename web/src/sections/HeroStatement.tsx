export default function HeroStatement() {
    return (
        <section className="bg-white">
            {/* Luft under den fixed headern */}
            <div className="mx-auto max-w-6xl px-6 pt-28 md:pt-36 pb-24 md:pb-40">
                <h1
                    className="
            text-[clamp(2.5rem,8vw,6.5rem)]
            leading-[0.95]
            font-semibold
            tracking-tight
            text-[#101423]
          "
                >
                    En ny identitet <br className="hidden sm:block" />
                    för ditt hotell.
                </h1>
            </div>
        </section>
    );
}