import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice, Panel, Tag } from '@/components/admin/ui';
import SampleRequestActions from '@/components/admin/SampleRequestActions';
import { getSampleRequestById } from '@/lib/sampleRequestsDb';
import { STATUS_LABEL } from '../page';

export const dynamic = 'force-dynamic';

export default async function SampleRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const request = Number.isInteger(id) ? await getSampleRequestById(id) : null;
  if (!request) notFound();

  return (
    <>
      <header className="border-t-2 pt-5" style={{ borderColor: 'var(--viz-ink)' }}>
        <p
          className="flex items-center gap-2 font-mono text-xs uppercase"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          <span>
            Provförfrågan #{request.id} · {STATUS_LABEL[request.status] ?? request.status}
          </span>
          {!request.emailed && <Tag color="var(--adm-danger)">ej aviserad</Tag>}
        </p>
        <h1 className="mt-2 font-heading text-4xl">{request.organizationName}</h1>
        <p className="mt-2 text-sm">
          {request.contactName} ·{' '}
          <a className="hover:underline" href={`mailto:${request.email}`}>
            {request.email}
          </a>{' '}
          ·{' '}
          <a className="hover:underline" href={`tel:${request.phone}`}>
            {request.phone}
          </a>
        </p>
      </header>

      {!request.emailed && (
        <Notice tone="warn" title="Ingen avisering skickades">
          Förfrågan är sparad, men mejlet till {`info@linnevik.se`} gick inte iväg. Kontrollera
          SMTP-inställningarna — kunden har inte fått något felmeddelande och väntar på svar.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        <Panel title="Organisation">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt style={{ color: 'var(--viz-ink-3)' }}>Företag</dt>
            <dd>{request.organizationName}</dd>
            <dt style={{ color: 'var(--viz-ink-3)' }}>Org.nr</dt>
            <dd>{request.organizationNumber}</dd>
            <dt style={{ color: 'var(--viz-ink-3)' }}>Konto</dt>
            <dd>
              {request.clientId ? (
                <Link
                  href={`/admin/clients/${request.clientId}`}
                  className="text-brand-text hover:underline"
                >
                  Öppna i Kunder
                </Link>
              ) : (
                'Ingen registrerad kund'
              )}
            </dd>
          </dl>
        </Panel>

        <Panel title="Leveransadress">
          <address className="not-italic text-sm leading-[1.7]">
            {request.address}
            <br />
            {request.postalCode} {request.city}
            <br />
            {request.country}
          </address>
        </Panel>
      </div>

      <Panel title="Begärda prover" meta={`${request.items.length} st`}>
        <ul className="divide-y" style={{ borderColor: 'var(--viz-rule)' }}>
          {request.items.map(item => (
            <li key={item.id} className="flex justify-between gap-4 py-2.5 text-sm">
              <span>
                {item.title}
                {item.variantLabel && (
                  <span style={{ color: 'var(--viz-ink-3)' }}> · {item.variantLabel}</span>
                )}
              </span>
              {item.productHandle ? (
                <Link
                  href={`/admin/products/${item.productHandle}`}
                  className="shrink-0 text-brand-text hover:underline"
                >
                  Öppna produkt
                </Link>
              ) : (
                <span className="shrink-0" style={{ color: 'var(--viz-ink-3)' }}>
                  Ej kopplad
                </span>
              )}
            </li>
          ))}
          {request.items.length === 0 && (
            <li className="py-2.5 text-sm" style={{ color: 'var(--viz-ink-3)' }}>
              Inga produkter angavs.
            </li>
          )}
        </ul>
      </Panel>

      {request.notes && (
        <Panel title="Kundens meddelande">
          <p className="whitespace-pre-wrap text-sm leading-[1.7]">{request.notes}</p>
        </Panel>
      )}

      <SampleRequestActions request={request} />

      <p className="text-xs" style={{ color: 'var(--viz-ink-3)' }}>
        Inkom {request.createdAt.toLocaleString('sv-SE')}
        {request.handledBy && request.handledAt
          ? ` · senast hanterad av ${request.handledBy} ${request.handledAt.toLocaleString('sv-SE')}`
          : ''}
      </p>
    </>
  );
}
