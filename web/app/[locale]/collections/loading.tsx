export default function Loading() {
    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
            <div className="h-7 w-40 bg-gray-200 rounded mb-6 animate-pulse" />
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden">
                        <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                        <div className="p-4">
                            <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 w-24 bg-gray-200 rounded mt-2 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}