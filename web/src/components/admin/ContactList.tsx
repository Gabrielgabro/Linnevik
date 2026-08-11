'use client';

/**
 * Kontaktpersonerna på en kund. Varje rad fälls ut till ett formulär i stället
 * för att ligga på en egen sida — man jobbar sig igenom flera personer på
 * samma företag i ett svep, och ska slippa fram och tillbaka.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import { CHANNELS, CONTACT_STATUSES, contactName, statusTone } from '@/lib/clients';
import type { ClientContactRow } from '@/lib/db/schema';

const TONE: Record<string, string> = {
  good: 'var(--viz-s3)',
  flag: 'var(--viz-flag)',
  muted: 'var(--viz-ink-3)',
  none: 'var(--viz-ink-2)',
};

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: TONE[statusTone(status)] }}
    />
  );
}

function ContactFields({ contact }: { contact?: ClientContactRow }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field label="Förnamn" name="firstName" required defaultValue={contact?.firstName} />
        <Field label="Efternamn" name="lastName" defaultValue={contact?.lastName} />
        <Field
          label="Roll/Titel"
          name="role"
          defaultValue={contact?.role}
          placeholder="Inköpschef"
        />
        <Select
          label="Status"
          name="status"
          options={CONTACT_STATUSES}
          defaultValue={contact?.status ?? 'Ej kontaktad'}
          required
        />
        <Field label="Mejl" name="email" type="email" defaultValue={contact?.email} />
        <Field label="Telefon" name="phone" type="tel" defaultValue={contact?.phone} />
        <Field
          label="LinkedIn"
          name="linkedin"
          defaultValue={contact?.linkedin}
          placeholder="linkedin.com/in/…"
          className="col-span-2 max-[560px]:col-span-1"
        />
        <Select label="Kanal" name="channel" options={CHANNELS} defaultValue={contact?.channel} />
        <Field
          label="Senast kontaktad"
          name="lastContactedAt"
          type="date"
          defaultValue={contact?.lastContactedAt}
        />
        <Field label="Nästa åtgärd" name="nextAction" defaultValue={contact?.nextAction} />
        <Field
          label="Åtgärd senast"
          name="nextActionDue"
          type="date"
          defaultValue={contact?.nextActionDue}
        />
      </div>
      <TextArea label="Anteckningar" name="notes" defaultValue={contact?.notes} rows={2} />
    </>
  );
}

function ContactRow({ contact }: { contact: ClientContactRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues(event.currentTarget)),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara.');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Ta bort ${contactName(contact)}?`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/contacts/${contact.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      setError('Kunde inte ta bort.');
      return;
    }
    router.refresh();
  };

  return (
    <li className="border-b" style={{ borderColor: 'var(--viz-grid)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-3 text-left"
      >
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[14px]" style={{ color: 'var(--viz-ink)' }}>
            {contactName(contact)}
          </span>
          {contact.role && (
            <span className="text-[13px]" style={{ color: 'var(--viz-ink-3)' }}>
              {contact.role}
            </span>
          )}
          {contact.email && (
            <span
              className="font-mono text-[11.5px]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span
              className="font-mono text-[11.5px] tabular-nums"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              {contact.phone}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <StatusDot status={contact.status} />
          <span className="text-[12.5px]" style={{ color: TONE[statusTone(contact.status)] }}>
            {contact.status}
          </span>
          {contact.lastContactedAt && (
            <span
              className="font-mono text-[11.5px] tabular-nums"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              {contact.lastContactedAt}
            </span>
          )}
        </span>
      </button>

      {open && (
        <form onSubmit={save} className="flex flex-col gap-5 pb-6 pt-1">
          <ContactFields contact={contact} />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sparar…' : 'Spara'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={busy}>
              Avbryt
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={remove}
              disabled={busy}
              style={{ color: 'var(--viz-flag)' }}
            >
              Ta bort
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function ContactList({
  clientId,
  contacts,
}: {
  clientId: number;
  contacts: ClientContactRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget;
    const response = await fetch(`/api/admin/clients/${clientId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues(form)),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara.');
      return;
    }
    form.reset();
    setAdding(false);
    router.refresh();
  };

  return (
    <section className="flex flex-col gap-0">
      <div
        className="flex items-baseline justify-between border-b pb-2"
        style={{ borderColor: 'var(--viz-rule)' }}
      >
        <h2
          className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Kontaktpersoner · {contacts.length}
        </h2>
        {!adding && (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            + Lägg till person
          </Button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="py-4 text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Ingen kontaktperson inlagd ännu.
        </p>
      )}

      <ul className="flex flex-col">
        {contacts.map(contact => (
          <ContactRow key={contact.id} contact={contact} />
        ))}
      </ul>

      {adding && (
        <form onSubmit={create} className="flex flex-col gap-5 border-b py-6" style={{ borderColor: 'var(--viz-grid)' }}>
          <ContactFields />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sparar…' : 'Lägg till'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setAdding(false)} disabled={busy}>
              Avbryt
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
