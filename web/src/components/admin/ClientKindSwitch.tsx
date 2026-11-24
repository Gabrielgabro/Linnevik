'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRightLeft, UserCheck } from 'lucide-react';
import { Button } from '@/components/admin/Fields';
import { CLIENT_KIND_HREF } from '@/lib/clients';
import type { ClientKind } from '@/lib/db/schema';

/**
 * Flyttar företaget mellan ringlistan och kundregistret. "Gör till kund" är
 * det vanliga: ett samtal har blivit en affär, och företaget ska kunna
 * faktureras. Åt andra hållet bara för en kund utan webbkonton.
 */
export default function ClientKindSwitch({
  clientId,
  kind,
  hasAccounts,
}: {
  clientId: number;
  kind: ClientKind;
  hasAccounts: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const target: ClientKind = kind === 'lead' ? 'customer' : 'lead';
  if (target === 'lead' && hasAccounts) return null;

  async function move() {
    const question =
      target === 'customer'
        ? 'Gör företaget till kund? Det flyttar från Tvätterikunder till Kunder och kan sedan faktureras.'
        : 'Flytta tillbaka till Tvätterikunder? Företaget försvinner ur Kunder och kan inte faktureras.';
    if (!window.confirm(question)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/clients/${clientId}/kind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: target }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      window.alert(data.error ?? 'Kunde inte flytta företaget.');
      return;
    }
    router.push(`${CLIENT_KIND_HREF[target]}/${clientId}`);
    router.refresh();
  }

  return target === 'customer' ? (
    <Button type="button" onClick={move} disabled={busy}>
      <UserCheck size={15} strokeWidth={2} aria-hidden />
      Gör till kund
    </Button>
  ) : (
    <Button type="button" variant="secondary" onClick={move} disabled={busy}>
      <ArrowRightLeft size={15} strokeWidth={2} aria-hidden />
      Flytta till Tvätterikunder
    </Button>
  );
}
