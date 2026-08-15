'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Select, TextArea, formValues } from '@/components/admin/Fields';
import type { SampleRequestDetail } from '@/lib/sampleRequestsDb';

/** Samma ordning som statusarna faktiskt går igenom. */
const STATUS_OPTIONS = ['new', 'in_progress', 'sent', 'declined'];

export default function SampleRequestActions({ request }: { request: SampleRequestDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={async event => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        const values = formValues(event.currentTarget);
        const response = await fetch(`/api/admin/sample-requests/${request.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: values.status, internalNote: values.internalNote }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return setError(data.error ?? 'Kunde inte uppdatera förfrågan.');
        setSaved(true);
        router.refresh();
      }}
    >
      <h2 className="font-heading text-xl">Hantering</h2>
      <Select
        label="Status"
        name="status"
        required
        options={STATUS_OPTIONS}
        defaultValue={request.status}
      />
      <TextArea
        label="Intern anteckning"
        name="internalNote"
        defaultValue={request.internalNote ?? ''}
      />
      <div className="flex items-center gap-3">
        <Button type="submit">Spara</Button>
        {saved && (
          <span className="text-sm" style={{ color: 'var(--adm-ok)' }}>
            Sparat.
          </span>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}
