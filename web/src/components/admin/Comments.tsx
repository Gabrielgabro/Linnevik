'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, TextArea } from '@/components/admin/Fields';
import { Panel } from '@/components/admin/ui';
import type { AdminCommentRow } from '@/lib/db/schema';

const stamp = (date: Date | string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));

/**
 * Kommentarer på en order, ett företag eller en provbeställning (§15.6).
 * Varje kommentar står med vem och när. Det finns ingen knapp för att ändra
 * eller radera: det som har skrivits står kvar.
 */
export default function Comments({
  subject,
  subjectId,
  comments,
}: {
  subject: AdminCommentRow['subject'];
  subjectId: number;
  comments: AdminCommentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel title="Kommentarer" meta="Sparas med vem och när och kan inte ändras">
      {comments.length > 0 ? (
        <ol className="mb-5 grid gap-4">
          {comments.map(comment => (
            <li key={comment.id} className="border-l-2 pl-3" style={{ borderColor: 'var(--viz-rule)' }}>
              <p className="font-mono text-[11px] uppercase" style={{ color: 'var(--viz-ink-3)' }}>
                {comment.author} · {stamp(comment.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-[1.6]">{comment.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-5 text-sm" style={{ color: 'var(--viz-ink-3)' }}>
          Inga kommentarer ännu.
        </p>
      )}
      <form
        className="grid gap-3"
        onSubmit={async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = (form.elements.namedItem('body') as HTMLTextAreaElement).value;
          if (!body.trim()) return;
          setBusy(true);
          setError(null);
          const response = await fetch('/api/admin/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, subjectId, body }),
          });
          const data = await response.json().catch(() => ({}));
          setBusy(false);
          if (!response.ok) return setError(data.error ?? 'Kunde inte spara kommentaren.');
          form.reset();
          router.refresh();
        }}
      >
        <TextArea label="Ny kommentar" name="body" rows={3} />
        <ErrorNote>{error}</ErrorNote>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Sparar…' : 'Lägg till kommentar'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
