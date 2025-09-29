export default function Loading() {
    const pulse = "animate-pulse bg-neutral-200";
    return (
        <main className="max-w-6xl mx-auto px-6 py-8 md:py-12">
            <div className="grid gap-8 md:grid-cols-2">
                <div className={`aspect-square rounded ${pulse}`} />
                <div className="space-y-4">
                    <div className={`h-8 w-2/3 rounded ${pulse}`} />
                    <div className={`h-4 w-5/6 rounded ${pulse}`} />
                    <div className={`h-4 w-3/4 rounded ${pulse}`} />
                    <div className={`h-10 w-40 rounded ${pulse}`} />
                </div>
            </div>
        </main>
    );
}