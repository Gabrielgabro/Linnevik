import { PackageOpen } from 'lucide-react';
import ClickableTableRow from '@/components/admin/ui/ClickableTableRow';
import {
  EmptyState,
  PageHeader,
  StatRow,
  StatTile,
  Tag,
  TableShell,
  Td,
  Th,
} from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listSampleRequests } from '@/lib/sampleRequestsDb';

export const dynamic = 'force-dynamic';

/** Obehandlat ska sticka ut; avklarat ska tona ner. */
const STATUS_TONE: Record<string, string> = {
  new: 'var(--adm-warn)',
  in_progress: 'var(--adm-info)',
  sent: 'var(--adm-ok)',
  declined: 'var(--viz-ink-3)',
};

export const STATUS_LABEL: Record<string, string> = {
  new: 'Ny',
  in_progress: 'Påbörjad',
  sent: 'Skickad',
  declined: 'Avböjd',
};

export default async function SampleRequestsPage() {
  const requests = await listSampleRequests(200);
  const open = requests.filter(request => request.status === 'new').length;
  const inProgress = requests.filter(request => request.status === 'in_progress').length;
  const sent = requests.filter(request => request.status === 'sent').length;

  return (
    <>
      <PageHeader
        kicker={`${requests.length} provförfrågningar`}
        title="Provbeställningar"
        accent={accentFor('/admin/prover')}
        description="Förfrågningar från formuläret på sajten. Posten sparas i databasen — mejlet är bara en avisering."
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Inga provförfrågningar ännu"
          description="Så fort någon skickar formuläret på /samples hamnar förfrågan här."
        />
      ) : (
        <>
          <StatRow>
            <StatTile label="Obehandlade" value={String(open)} />
            <StatTile label="Påbörjade" value={String(inProgress)} />
            <StatTile label="Skickade" value={String(sent)} />
          </StatRow>

          <TableShell>
            <thead>
              <tr>
                <Th>Förfrågan</Th>
                <Th>Företag</Th>
                <Th>Kontakt</Th>
                <Th>Status</Th>
                <Th align="right">Prover</Th>
                <Th align="right">Datum</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map(request => (
                <ClickableTableRow
                  key={request.id}
                  href={`/admin/prover/${request.id}`}
                  label={`Öppna provbeställning ${request.id} från ${request.organizationName}`}
                >
                  <Td numeric>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-brand-text">#{request.id}</span>
                      {/* Aviseringen kan ha fallerat utan att förfrågan gjort det. */}
                      {!request.emailed && <Tag color="var(--adm-danger)">ej aviserad</Tag>}
                    </span>
                  </Td>
                  <Td className="text-ink">{request.organizationName}</Td>
                  <Td className="text-ink-3">
                    {request.contactName} · {request.email}
                  </Td>
                  <Td>
                    <Tag color={STATUS_TONE[request.status] ?? 'var(--viz-ink-3)'}>
                      {STATUS_LABEL[request.status] ?? request.status}
                    </Tag>
                  </Td>
                  <Td numeric align="right">
                    {request.items.length}
                  </Td>
                  <Td numeric align="right" className="text-ink-3">
                    {request.createdAt.toLocaleDateString('sv-SE')}
                  </Td>
                </ClickableTableRow>
              ))}
            </tbody>
          </TableShell>
        </>
      )}
    </>
  );
}
