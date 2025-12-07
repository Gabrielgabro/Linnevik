import { LocaleLink } from "@/components/LocaleLink";

type BreadcrumbsProps = {
    items: Array<{ href: string; label: string }>;
    homeLabel?: string;
    ariaLabel?: string;
};

export default function Breadcrumbs({
    items,
    homeLabel = "Home",
    ariaLabel = "Breadcrumbs",
}: BreadcrumbsProps) {
    return (
        <nav aria-label={ariaLabel} className="text-sm text-secondary">
            <ol className="flex flex-wrap gap-1">
                <li><LocaleLink href="/" className="hover:underline">{homeLabel}</LocaleLink></li>
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