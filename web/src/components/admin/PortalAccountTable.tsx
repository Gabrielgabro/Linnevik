'use client';

/**
 * Listan över konton i inloggningsportalen. Filtreras i webbläsaren av samma
 * skäl som ClientTable gör det: registret är några hundra rader, och ett
 * serveranrop per tangenttryck skulle göra sökningen långsammare, inte snabbare.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Trash2, UserRound } from 'lucide-react';
import { ErrorNote } from '@/components/admin/Fields';
import {
  EmptyState,
  FilterPill,
  SearchInput,
  TableShell,
  Tag,
  Td,
  Th,
  Toolbar,
  Tr,
} from '@/components/admin/ui';
import { formatMinor } from '@/lib/money';
import {
  accountName,
  accountOrigin,
  ORIGIN_COLOR,
  ORIGIN_LABEL,
  shortDate,
  type AccountOrigin,
  type PortalAccount,
} from '@/lib/portalAccounts';

const ORIGINS: AccountOrigin[] = ['portal', 'checkout', 'import'];

export default function PortalAccountTable({ accounts }: { accounts: PortalAccount[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<AccountOrigin | null>(null);
  const [onlyNeverLoggedIn, setOnlyNeverLoggedIn] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Kontot raderas, företaget står kvar. Ordrarna följer inte med — de bär
   * köparens uppgifter från köptillfället och ska finnas kvar i bokföringen
   * även när inloggningen är borta.
   */
  const remove = async (account: PortalAccount) => {
    if (
      !confirm(
        `Ta bort webbkontot ${account.email}? Inloggningen upphör direkt. ` +
          `${account.clientName} står kvar bland tvätterikunderna, och ordrarna står kvar.`
      )
    ) {
      return;
    }
    setBusyId(account.id);
    setError(null);
    const response = await fetch(
      `/api/admin/clients/${account.clientId}/customers/${account.id}`,
      { method: 'DELETE' }
    );
    const data = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ta bort webbkontot.');
      return;
    }
    router.refresh();
  };

  const originCounts = useMemo(() => {
    const counts: Record<AccountOrigin, number> = { portal: 0, checkout: 0, import: 0 };
    accounts.forEach(account => {
      counts[accountOrigin(account)] += 1;
    });
    return counts;
  }, [accounts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter(account => {
      if (origin && accountOrigin(account) !== origin) return false;
      if (onlyNeverLoggedIn && account.lastLoginAt) return false;
      if (!needle) return true;
      return [
        account.email,
        accountName(account),
        account.clientName,
        account.company ?? '',
        account.customerNo ?? '',
        account.taxId ?? '',
      ].some(field => field.toLowerCase().includes(needle));
    });
  }, [accounts, query, origin, onlyNeverLoggedIn]);

  return (
    <>
      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="E-post, namn, företag eller org.nr"
        />
        {ORIGINS.map(option => (
          <FilterPill
            key={option}
            active={origin === option}
            count={originCounts[option]}
            onClick={() => setOrigin(origin === option ? null : option)}
          >
            {ORIGIN_LABEL[option]}
          </FilterPill>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={onlyNeverLoggedIn}
            onChange={event => setOnlyNeverLoggedIn(event.target.checked)}
            style={{ accentColor: 'var(--adm-brand)' }}
          />
          Har aldrig loggat in
        </label>
      </Toolbar>

      {visible.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Inget konto matchar filtret"
          description="Rensa sökningen eller välj ett annat ursprung."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Konto</Th>
              <Th>Tvätterikund</Th>
              <Th>Ursprung</Th>
              <Th>Registrerad</Th>
              <Th>Senaste inloggning</Th>
              <Th align="right">Ordrar</Th>
              <Th align="right">Köpt för</Th>
              <Th align="right">
                <span className="sr-only">Ta bort</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(account => {
              const source = accountOrigin(account);
              return (
                <Tr key={account.id}>
                  <Td>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-ink">
                        {accountName(account)}
                        {account.status !== 'active' && <Tag color="var(--adm-warn)">Spärrat</Tag>}
                      </span>
                      <a
                        href={`mailto:${account.email}`}
                        className="text-[12.5px] text-ink-3 hover:underline"
                      >
                        {account.email}
                      </a>
                    </span>
                  </Td>
                  <Td>
                    {/* Kontot redigeras på företagets sida — det är där webbkontona bor. */}
                    <Link
                      href={`/admin/clients/${account.clientId}`}
                      className="text-brand-text hover:underline"
                    >
                      {account.clientName}
                    </Link>
                    {account.customerNo && (
                      <span className="ml-2 font-mono text-[12px] tabular-nums text-ink-3">
                        {account.customerNo}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Tag color={ORIGIN_COLOR[source]}>{ORIGIN_LABEL[source]}</Tag>
                  </Td>
                  <Td numeric>{shortDate(account.createdAt)}</Td>
                  <Td numeric className={account.lastLoginAt ? undefined : 'text-ink-3'}>
                    {shortDate(account.lastLoginAt)}
                  </Td>
                  <Td numeric align="right">
                    {account.orderCount}
                  </Td>
                  <Td numeric align="right">
                    {account.spendMinor > 0 ? formatMinor(account.spendMinor) : '—'}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => remove(account)}
                      disabled={busyId === account.id}
                      aria-label={`Ta bort webbkontot ${account.email}`}
                      className="rounded-ctl p-1.5 text-ink-3 transition-colors hover:bg-plane hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <ErrorNote>{error}</ErrorNote>

      <p className="text-[12.5px] text-ink-3">
        Visar {visible.length} av {accounts.length} konton.
      </p>
    </>
  );
}
