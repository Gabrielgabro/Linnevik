import { LocaleLink } from "@/components/LocaleLink";

export default function Breadcrumbs({
    items,
}: {
    items: Array<{ href: string; label: string }>;
}) {
    return (
        <nav aria-label="Brödsmulor" className="text-sm text-secondary">
            <ol className="flex flex-wrap gap-1">
                <li><LocaleLink href="/" className="hover:underline">Hem</LocaleLink></li>
                {items.map((it, i) => (
                    <li key={it.href} className="flex items-center gap-1">
                        <span>›</span>
                        {i < items.length - 1 ? (
                            <LocaleLink href={it.href} className="hover:underline">{it.label}</LocaleLink>
                        ) : (
                            <span className="text-primary">{it.label}</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}