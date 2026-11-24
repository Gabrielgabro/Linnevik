import Link from 'next/link';
import { FilePlus2, Plus, Users } from 'lucide-react';
import PortalAccountTable from '@/components/admin/PortalAccountTable';
import ClickableTableRow from '@/components/admin/ui/ClickableTableRow';
import {
  buttonClass,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  StatRow,
  StatTile,
  Tag,
  TableShell,
  Td,
  Th,
} from '@/components/admin/ui';
import { accentFor } from '../nav';
import { clientsConfigured, listClients, listPortalAccounts } from '@/lib/clientsDb';
import { clientInvoiceGap } from '@/lib/clients';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';

const GAP_LABEL = {
  orgNumber: 'Org.nr saknas',
  address: 'Adress saknas',
  country: 'Utlandsadress',
} as const;

/**
 * Kundregistret: företagen som köper av oss. Fakturorna ställs ut ur det här
 * registret, och webbkontona i inloggningsportalen hänger på företagen här.
 *
 * Tvätteriets kunder — ringlistan — ligger för sig under Tvätterikunder. Ett
 * företag flyttar hit när det registrerar sig, handlar eller görs till kund.
 */
export default async function AdminCustomersPage() {
  const [companies, accounts] = await Promise.all([listClients('customer'), listPortalAccounts()]);

  const unpaidCount = companies.reduce((sum, company) => sum + company.unpaidInvoiceCount, 0);
  const unpaidMinor = companies.reduce((sum, company) => sum + company.unpaidInvoiceMinor, 0);

  return (
    <>
      <PageHeader
        kicker={`${companies.length} kunder · ${accounts.length} webbkonton`}
        title="Kunder"
        accent={accentFor('/admin/customers')}
        description="Företagen som köper av oss. Härifrån ställs fakturor ut, och här hänger webbkontona i inloggningsportalen. Tvätteriets kunder att ringa ligger under Tvätterikunder."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/orders/ny-faktura" className={buttonClass('secondary')}>
              <FilePlus2 size={15} strokeWidth={2} aria-hidden />
              Ny faktura
            </Link>
            <Link href="/admin/customers/new" className={buttonClass('primary')}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Lägg till kund
            </Link>
          </div>
        }
      />

      <StatRow>
        <StatTile label="Kunder" value={companies.length} accent="var(--adm-ok)" />
        <StatTile label="Webbkonton" value={accounts.length} accent="var(--viz-s1)" />
        <StatTile
          label="Obetalda fakturor"
          value={unpaidCount > 0 ? `${unpaidCount} · ${formatMinor(unpaidMinor)}` : 0}
          accent="var(--adm-warn)"
        />
      </StatRow>

      {!clientsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Registret är tomt i den här miljön.
        </Notice>
      )}

      {companies.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Inga kunder ännu"
          description="Lägg till ett företag som köper av er, eller gör om en tvätterikund till kund från dess kundkort."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Kund</Th>
              <Th>Org.nr</Th>
              <Th>Fakturamejl</Th>
              <Th align="right">Webbkonton</Th>
              <Th align="right">Ordrar</Th>
              <Th align="right">Obetalt</Th>
            </tr>
          </thead>
          <tbody>
            {companies.map(company => {
              const gap = clientInvoiceGap(company);
              return (
                <ClickableTableRow
                  key={company.id}
                  href={`/admin/customers/${company.id}`}
                  label={`Öppna ${company.name}`}
                >
                  <Td>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="text-ink">{company.name}</span>
                      <span className="font-mono text-[11px] text-ink-3">{company.customerNo}</span>
                      {gap && <Tag color="var(--adm-warn)">{GAP_LABEL[gap]}</Tag>}
                    </span>
                  </Td>
                  <Td numeric className="text-ink-2">{company.orgNumber ?? '—'}</Td>
                  <Td className="text-ink-2">{company.invoiceEmail ?? '—'}</Td>
                  <Td numeric align="right">{company.commerceCustomerCount}</Td>
                  <Td numeric align="right">{company.orderCount}</Td>
                  <Td numeric align="right">
                    {company.unpaidInvoiceCount > 0 ? (
                      <span className="text-ink">
                        {formatMinor(company.unpaidInvoiceMinor)}{' '}
                        <span className="text-ink-3">({company.unpaidInvoiceCount})</span>
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                </ClickableTableRow>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <Panel
        title="Webbkonton"
        meta="Personer som loggar in i portalen, kopplade till ett företag ovan"
        padded={false}
      >
        <PortalAccountTable accounts={accounts} />
      </Panel>
    </>
  );
}
