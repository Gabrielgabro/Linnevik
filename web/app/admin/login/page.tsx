'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
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
      body: JSON.stringify({ password }),
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

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-[380px] flex-col gap-5 rounded-[3px] border p-8"
      style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)' }}
    >
      <div className="flex flex-col gap-1.5">
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Linnevik Admin
        </span>
        <h1 className="font-heading text-[22px] tracking-tight" style={{ color: 'var(--viz-ink)' }}>
          Logga in
        </h1>
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-2)' }}>
          Adminvyn är intern och skild från kundinloggningen.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[13px]" style={{ color: 'var(--viz-ink-2)' }}>
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
          className="rounded-[3px] border px-3 py-2 text-[14px] focus:outline focus:outline-2 focus:outline-offset-1"
          style={{
            background: 'var(--viz-plane)',
            borderColor: 'var(--viz-rule)',
            color: 'var(--viz-ink)',
          }}
        />
      </label>

      {error && (
        <p
          role="alert"
          className="border-l-2 pl-3 text-[13px]"
          style={{ color: 'var(--viz-ink-2)', borderColor: 'var(--viz-flag)' }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-[3px] px-4 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        style={{ background: 'var(--viz-s1)' }}
      >
        {busy ? 'Loggar in…' : 'Logga in'}
      </button>
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
