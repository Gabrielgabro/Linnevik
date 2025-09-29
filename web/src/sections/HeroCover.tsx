// web/src/components/HeroCover.tsx
export default function HeroCover() {
  return (
    <section className="bg-white">
      <div className="w-full pr-6 pl-6 sm:pl-10 md:pl-16 lg:pl-24 xl:pl-32 pt-24 md:pt-32 pb-20 md:pb-32">
        <h1
          className="
            max-w-[18ch]
            text-[clamp(2rem,6.5vw,5rem)]
            leading-[0.95]
            font-semibold
            tracking-tight
            text-[#0f1220]
          "
        >
          En ny identitet <br className="hidden sm:block" />
          för ditt hotell.
        </h1>
      </div>
    </section>
  );
}