'use client';

/**
 * Formuläret för en kund — samma för att lägga till och för att ändra.
 * Skillnaden är bara vilken rutt det postar till och vart man skickas efter.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import { CLIENT_STATUSES, PRIORITIES, SEGMENTS } from '@/lib/clients';
import type { ClientRow } from '@/lib/db/schema';

type Props =
  | { mode: 'create'; suggestedCustomerNo: string }
  | { mode: 'edit'; client: ClientRow };

export default function ClientForm(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const client = props.mode === 'edit' ? props.client : null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const values = formValues(event.currentTarget);
    const response = await fetch(
      client ? `/api/admin/clients/${client.id}` : '/api/admin/clients',
      {
        method: client ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? 'Något gick fel. Försök igen.');
      setBusy(false);
      return;
    }

    if (client) {
      setSaved(true);
      setBusy(false);
      router.refresh();
    } else {
      router.push(`/admin/clients/${data.client.id}`);
      router.refresh();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field
          label="Kundnr."
          name="customerNo"
          required
          // Nya kunder får nästa lediga nummer föreslaget, men det går att
          // skriva över — arkivlistan har egna nummer som ska behållas.
          defaultValue={
            props.mode === 'edit' ? props.client.customerNo : props.suggestedCustomerNo
          }
        />
        <Field label="Kundnamn" name="name" required defaultValue={client?.name} />
        <Select label="Segment" name="segment" options={SEGMENTS} defaultValue={client?.segment} />
        <Select
          label="Kundstatus"
          name="status"
          options={CLIENT_STATUSES}
          defaultValue={client?.status ?? 'Prospekt'}
          required
        />
        <Select
          label="Prioritet"
          name="priority"
          options={PRIORITIES}
          defaultValue={client?.priority}
        />
        <Field
          label="Påminnelseavgift (SEK)"
          name="reminderFee"
          type="number"
          step="0.01"
          defaultValue={client?.reminderFee}
        />
      </div>

      <TextArea label="Anteckningar" name="notes" defaultValue={client?.notes} rows={3} />

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy ? 'Sparar…' : client ? 'Spara ändringar' : 'Lägg till kund'}
        </Button>
        {saved && !busy && (
          <span className="text-[13px]" style={{ color: 'var(--viz-ink-3)' }}>
            Sparat.
          </span>
        )}
      </div>
    </form>
  );
}
