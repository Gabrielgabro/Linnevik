import Link from 'next/link';

export default function Hero() {
    return (
        <section className="relative h-screen flex flex-col items-center justify-center text-center bg-base overflow-hidden">
            {/* optional background image */}
            <img
                src="/hero-hotellroom.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-20"
            />

            <div className="relative z-10 max-w-2xl px-6">
                <h1 className="font-head text-4xl md:text-6xl font-bold text-ink mb-4">
                    Bedding made easy for hotels
                </h1>
                <p className="text-lg md:text-xl text-ink/80 mb-8">
                    Swedish-designed pillows, duvets & mattress protectors — delivered in
                    bulk, at fair prices.
                </p>

                <Link
                    href="/account/login"
                    className="inline-block bg-accent hover:bg-ink text-white px-8 py-4 rounded transition-colors"
                >
                    Create business account
                </Link>
            </div>
        </section>
    );
}