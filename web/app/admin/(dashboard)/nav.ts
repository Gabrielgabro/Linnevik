import {
  Activity,
  BellRing,
  Download,
  FolderTree,
  LineChart,
  Package,
  PackageOpen,
  Percent,
  Settings2,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Enda källan för adminmenyn. Accentfärgen används både av ikonen i sidomenyn
 * och av linjen över sidrubriken, så att man ser vilken del man står i.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** CSS-variabel, aldrig en hex — mörkt läge går via tokens. */
  accent: string;
};

export type NavGroup = {
  /** Utelämnas för toppobjekt som står utan rubrik. */
  label?: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    // Mängdrabatten hör ihop med prisbilden, inte med försäljningen: båda är
    // underlag för att bestämma pris, inte något som körs i den dagliga driften.
    items: [
      {
        href: '/admin',
        label: 'Prisbild - egna produkter',
        icon: LineChart,
        accent: 'var(--adm-info)',
      },
      {
        href: '/admin/franzen',
        label: 'Prisbild - Franzén',
        icon: LineChart,
        accent: 'var(--viz-s2)',
      },
      { href: '/admin/pricing', label: 'Mängdrabatt', icon: Percent, accent: 'var(--viz-s1)' },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { href: '/admin/products', label: 'Produkter', icon: Package, accent: 'var(--adm-brand)' },
      {
        href: '/admin/collections',
        label: 'Kategorier',
        icon: FolderTree,
        accent: 'var(--viz-s4)',
      },
    ],
  },
  {
    label: 'Försäljning',
    items: [
      { href: '/admin/orders', label: 'Ordrar', icon: ShoppingCart, accent: 'var(--viz-s2)' },
      {
        href: '/admin/prover',
        label: 'Provbeställningar',
        icon: PackageOpen,
        accent: 'var(--viz-s3)',
      },
      { href: '/admin/commerce', label: 'Handel', icon: Settings2, accent: 'var(--adm-warn)' },
      { href: '/admin/export', label: 'Export', icon: Download, accent: 'var(--viz-s4)' },
    ],
  },
  {
    label: 'Kundregister',
    items: [
      { href: '/admin/clients', label: 'Kunder', icon: Users, accent: 'var(--viz-s1)' },
      { href: '/admin/activity', label: 'Aktivitet', icon: Activity, accent: 'var(--viz-ink-3)' },
      // Sist i menyn men först i uppmärksamhet när siffran på den är röd:
      // driftlarmen är det enda i /admin som betyder "titta nu".
      { href: '/admin/alerts', label: 'Driftlarm', icon: BellRing, accent: 'var(--adm-danger)' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap(group => group.items);

/**
 * Aktiv post för en sökväg. `/admin` är exakt matchning — annars skulle
 * startsidan vara aktiv på varje undersida. Längsta träffen vinner.
 */
export function activeItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter(item =>
    item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

/** Accentfärgen för en sökväg, med bläck som neutral reserv. */
export function accentFor(pathname: string): string {
  return activeItem(pathname)?.accent ?? 'var(--viz-ink)';
}
