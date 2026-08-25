'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import LogoutButton from './LogoutButton';
import { NAV, activeItem, type NavItem } from './nav';

const COLLAPSE_KEY = 'linnevik.admin.sidebar.collapsed';

/**
 * Sidomeny i varumärkets gröna. Ersätter den gamla raden med åtta likadana
 * textlänkar: ikon + etikett, grupperade, med tydlig markering av var man står.
 * Fäller ihop till en ikonlist på stora skärmar och blir en utfällbar panel
 * under lg.
 */
export default function Sidebar({
  user,
  openAlerts = 0,
}: {
  user: string | null;
  openAlerts?: number;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const active = activeItem(pathname);

  // Läses efter montering — annars skiljer sig servern från klienten.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  // Stäng panelen när man navigerar, annars ligger den kvar över innehållet.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed(value => {
      window.localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      return !value;
    });
  };

  return (
    <>
      {/* Mobiltoppen: bara logotyp och en knapp som fäller ut menyn. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-brand px-4 py-3 text-brand-fg lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Öppna meny"
          className="-ml-1 rounded-ctl p-1.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-fg"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
        <Link href="/admin" className="font-heading text-[15px] tracking-tight">
          Linnevik
        </Link>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-70">
          {active?.label ?? 'Admin'}
        </span>
      </header>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          'z-50 flex shrink-0 flex-col bg-brand text-brand-fg transition-[width] duration-150',
          // Under lg: panel som glider in från vänster.
          'fixed inset-y-0 left-0 w-[264px] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          sheetOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[68px]' : 'lg:w-[240px]'
        )}
      >
        <div
          className={clsx(
            'flex items-center gap-2 px-4 py-4',
            collapsed && 'lg:justify-center lg:px-0'
          )}
        >
          <Link
            href="/admin"
            className={clsx(
              'font-heading text-[16px] tracking-tight',
              collapsed && 'lg:sr-only'
            )}
          >
            Linnevik
          </Link>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Stäng meny"
            className="ml-auto rounded-ctl p-1.5 hover:bg-white/10 lg:hidden"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Fäll ut meny' : 'Fäll ihop meny'}
            className="ml-auto hidden rounded-ctl p-1.5 opacity-60 hover:bg-white/10 hover:opacity-100 lg:block"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          {NAV.map((group, index) => (
            <div key={group.label ?? `top-${index}`} className="flex flex-col gap-0.5">
              {group.label && (
                <span
                  className={clsx(
                    'px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] opacity-55',
                    collapsed && 'lg:sr-only'
                  )}
                >
                  {group.label}
                </span>
              )}
              {group.items.map(item => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={active?.href === item.href}
                  collapsed={collapsed}
                  badge={item.href === '/admin/alerts' ? openAlerts : 0}
                />
              ))}
            </div>
          ))}
        </nav>

        <div
          className={clsx(
            'flex flex-col gap-1 border-t border-white/10 px-3 py-3',
            collapsed && 'lg:items-center'
          )}
        >
          <span
            className={clsx(
              'px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] opacity-55',
              collapsed && 'lg:sr-only'
            )}
          >
            {user ?? 'Admin'}
          </span>
          <LogoutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** Antal okvitterade larm. Noll döljer märket helt. */
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={clsx(
        'relative flex items-center gap-3 rounded-ctl px-2.5 py-2 text-[13.5px] transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-fg',
        active ? 'bg-white/12 font-medium' : 'opacity-75 hover:bg-white/8 hover:opacity-100',
        collapsed && 'lg:justify-center lg:px-0'
      )}
    >
      {/* Markören är alltid beige, inte sektionens accentfärg: flera accenter
          (grönt, blått) skulle försvinna mot den mörkgröna menyn. Accenten får
          i stället bära sidrubriken, där duken är ljus. */}
      {active && (
        <span
          className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-brand-fg"
          aria-hidden
        />
      )}
      <Icon
        size={17}
        strokeWidth={1.75}
        aria-hidden
        className={clsx('shrink-0', collapsed && 'lg:mx-auto')}
      />
      <span className={clsx(collapsed && 'lg:sr-only')}>{item.label}</span>
      {badge > 0 && (
        <span
          // I ihopfällt läge sitter märket som en prick på ikonen — siffran
          // ryms inte, men att det finns något måste ändå synas.
          className={clsx(
            'ml-auto rounded-full bg-brand-fg px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-brand',
            collapsed && 'lg:absolute lg:right-2 lg:top-1.5 lg:ml-0 lg:px-1 lg:py-0'
          )}
        >
          {badge > 99 ? '99+' : badge}
          <span className="sr-only"> okvitterade larm</span>
        </span>
      )}
    </Link>
  );
}
