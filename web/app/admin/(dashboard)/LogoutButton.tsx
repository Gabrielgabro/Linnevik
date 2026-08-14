'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';

/** Ligger längst ned i sidomenyn, alltså på den mörkgröna ytan. */
export default function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await fetch('/api/admin/session', { method: 'DELETE' });
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      title={collapsed ? 'Logga ut' : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-ctl px-2.5 py-2 text-[13.5px] opacity-75 transition-colors',
        'hover:bg-white/10 hover:opacity-100 disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-fg',
        collapsed && 'lg:justify-center lg:px-0'
      )}
    >
      <LogOut size={17} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className={clsx(collapsed && 'lg:sr-only')}>
        {busy ? 'Loggar ut…' : 'Logga ut'}
      </span>
    </button>
  );
}
