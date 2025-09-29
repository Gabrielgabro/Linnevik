import Link from "next/link";

export default function Breadcrumbs({
                                        items,
                                    }: {
    items: Array<{ href: string; label: string }>;
}) {
    return (
        <nav aria-label="Brödsmulor" className="text-sm text-black/60">
            <ol className="flex flex-wrap gap-1">
                <li><Link href="/" className="hover:underline">Hem</Link></li>
                {items.map((it, i) => (
                    <li key={it.href} className="flex items-center gap-1">
                        <span>›</span>
                        {i < items.length - 1 ? (
                            <Link href={it.href} className="hover:underline">{it.label}</Link>
                        ) : (
                            <span className="text-black/80">{it.label}</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}