import {
  Activity,
  BellRing,
  Building2,
  Download,
  FolderTree,
  LayoutDashboard,
  LineChart,
  Package,
  PackageOpen,
  Percent,
  Settings2,
  ShoppingCart,
  Users2,
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

/**
 * Varje sak har ett hem i admin, och bara ett (source_of_truth §15.3).
 */
export const NAV: NavGroup[] = [
  {
    items: [
      // Det som väntar på någon: ordrar att skicka, lagerundantag, förfallna
      // fakturor, nya provbeställningar och öppna driftlarm.
      { href: '/admin', label: 'Översikt', icon: LayoutDashboard, accent: 'var(--adm-brand)' },
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
    // Underlaget för att bestämma pris. Ett föreslaget pris kan tillämpas
    // härifrån (§4.15); annars ändras priset på produkten.
    label: 'Priser',
    items: [
      {
        href: '/admin/priser',
        label: 'Egna produkter',
        icon: LineChart,
        accent: 'var(--adm-info)',
      },
      { href: '/admin/franzen', label: 'Franzén', icon: LineChart, accent: 'var(--viz-s2)' },
      { href: '/admin/pricing', label: 'Mängdrabatt', icon: Percent, accent: 'var(--viz-s1)' },
      {
        href: '/admin/commerce',
        label: 'Rabattkoder och frakt',
        icon: Settings2,
        accent: 'var(--adm-warn)',
      },
    ],
  },
  {
    label: 'Kunder',
    items: [
      // Ett enda register (§11.4). Tvätterikunderna är ett filter där, och
      // webbkontona hör till företagen.
      { href: '/admin/clients', label: 'Företag', icon: Building2, accent: 'var(--viz-s1)' },
    ],
  },
  {
    label: 'System',
    items: [
      // Besökssidan räknar folk som ännu inte är kunder.
      { href: '/admin/analytics', label: 'Besökare', icon: Users2, accent: 'var(--viz-s3)' },
      { href: '/admin/export', label: 'Export', icon: Download, accent: 'var(--viz-s4)' },
      { href: '/admin/activity', label: 'Aktivitet', icon: Activity, accent: 'var(--viz-ink-3)' },
      // Driftlarmen är det enda i /admin som betyder "titta nu".
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
