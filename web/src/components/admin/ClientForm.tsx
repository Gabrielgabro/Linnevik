'use client';

/**
 * Formuläret för en kund — samma för att lägga till och för att ändra.
 * Skillnaden är bara vilken rutt det postar till och vart man skickas efter.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, formValues } from '@/components/admin/Fields';
import { CLIENT_STATUSES, isLaundryClient, LAUNDRY_TAG, PRIORITIES, SEGMENTS } from '@/lib/clients';
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

  // Kontaktpersonerna följer med kunden ut — det står i frågan, så att ingen
  // råkar radera ett halvår av bearbetning i förbifarten.
  const remove = async () => {
    if (!client) return;
    if (
      !confirm(
        `Ta bort ${client.name}? Kontaktpersonerna och webbkontona i ` +
          'inloggningsportalen tas bort samtidigt. Ordrarna står kvar.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/clients/${client.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Kunde inte ta bort kunden.');
      setBusy(false);
      return;
    }
    router.push('/admin/clients');
    router.refresh();
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
          label="Säljstatus"
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
        {/* Taggen styr ingenting. Den säger att företaget kommer ur tvätteriets
            kundlista (§11.4). Den dolda rutan skickar "0" när kryssrutan
            inte är ikryssad, så att taggen går att ta bort. */}
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
          <input type="hidden" name="laundry" value="0" />
          <input
            type="checkbox"
            name="laundry"
            value="1"
            defaultChecked={client ? isLaundryClient(client) : false}
            style={{ accentColor: 'var(--adm-brand)' }}
          />
          {LAUNDRY_TAG}
        </label>
      </div>

      {/* Fakturauppgifterna. Det är de här fälten fakturan ställs ut på, och
          de går före kundens egna på webbkontot — se companyProfile.ts. */}
      <fieldset className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <legend className="mb-1 text-[13px] font-medium" style={{ color: 'var(--viz-ink-3)' }}>
          Fakturauppgifter
        </legend>
        <Field
          label="Organisationsnummer"
          name="orgNumber"
          placeholder="556016-0680"
          defaultValue={client?.orgNumber ?? ''}
        />
        <Field
          label="Fakturamejl"
          name="invoiceEmail"
          type="email"
          placeholder="Samma som kontots om tomt"
          defaultValue={client?.invoiceEmail ?? ''}
        />
        <Field
          label="Adress"
          name="addressLine1"
          defaultValue={client?.addressLine1 ?? ''}
        />
        <Field
          label="Adressrad 2"
          name="addressLine2"
          defaultValue={client?.addressLine2 ?? ''}
        />
        <Field
          label="Postnummer"
          name="postalCode"
          placeholder="123 45"
          defaultValue={client?.postalCode ?? ''}
        />
        <Field label="Ort" name="city" defaultValue={client?.city ?? ''} />
        <Field
          label="Land (landskod)"
          name="country"
          defaultValue={client?.country ?? 'SE'}
          hint="SE för Sverige. Fakturor skickas bara till svenska adresser."
        />
      </fieldset>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={busy} style={{ background: 'var(--viz-s1)', color: '#fff' }}>
          {busy ? 'Sparar…' : client ? 'Spara ändringar' : 'Lägg till kund'}
        </Button>
        {saved && !busy && (
          <span className="text-[13px]" style={{ color: 'var(--viz-ink-3)' }}>
            Sparat.
          </span>
        )}
        {client && (
          <Button
            type="button"
            variant="quiet"
            onClick={remove}
            disabled={busy}
            className="ml-auto"
            style={{ color: 'var(--viz-flag)' }}
          >
            Ta bort kund
          </Button>
        )}
      </div>
    </form>
  );
}
