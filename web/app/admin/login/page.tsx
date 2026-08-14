'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ADMIN_USERS, type AdminUser } from '@/lib/adminAuth';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [user, setUser] = useState<AdminUser>(ADMIN_USERS[0]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });

    if (response.ok) {
      router.replace(next && next.startsWith('/admin') ? next : '/admin');
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? 'Inloggningen misslyckades.');
    setPassword('');
    setBusy(false);
  };

  const controlClass =
    'rounded-ctl border border-rule bg-surface px-3 py-2 text-[14px] text-ink outline-none ' +
    'focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]';

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-[400px] flex-col overflow-hidden rounded-lg2 border border-rule bg-surface shadow-pop"
    >
      {/* Grön topp, samma som sidomenyn — man ser vilket hus man loggar in i. */}
      <div className="flex flex-col gap-1 bg-brand px-8 py-6 text-brand-fg">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-70">
          Linnevik Admin
        </span>
        <h1 className="font-heading text-[24px] tracking-tight">Logga in</h1>
      </div>

      <div className="flex flex-col gap-5 px-8 py-7">
        <p className="text-[13.5px] leading-[1.6] text-ink-2">
          Adminvyn är intern och skild från kundinloggningen.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
            Vem är du?
          </span>
          <select
            name="user"
            value={user}
            onChange={e => setUser(e.target.value as AdminUser)}
            className={controlClass}
          >
            {ADMIN_USERS.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
            Lösenord
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={controlClass}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-ctl border px-3 py-2 text-[13px] text-danger"
            style={{
              borderColor: 'color-mix(in srgb, var(--adm-danger) 40%, transparent)',
              background: 'color-mix(in srgb, var(--adm-danger) 9%, transparent)',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-ctl bg-brand px-4 py-2.5 text-[14px] font-medium text-brand-fg transition-colors hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text disabled:opacity-50"
        >
          {busy ? 'Loggar in…' : 'Logga in'}
        </button>
      </div>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
