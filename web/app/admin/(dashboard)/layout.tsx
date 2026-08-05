import Link from 'next/link';
import LogoutButton from './LogoutButton';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        className="border-b"
        style={{ borderColor: 'var(--viz-rule)', background: 'var(--viz-surface)' }}
      >
        <div className="mx-auto flex max-w-[1060px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
          <Link
            href="/admin"
            className="font-heading text-[15px] tracking-tight"
            style={{ color: 'var(--viz-ink)' }}
          >
            Linnevik
          </Link>
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            Admin
          </span>
          <nav className="ml-auto flex items-center gap-5 text-[13px]">
            <Link href="/admin" className="hover:underline" style={{ color: 'var(--viz-ink-2)' }}>
              Prisbild
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1060px] flex-col gap-7 px-5 pb-20 pt-10">{children}</main>
    </>
  );
}
