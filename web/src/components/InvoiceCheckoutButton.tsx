'use client';

import { useState } from 'react';
import { LocaleLink } from '@/components/LocaleLink';

type Props = {
  cartId?: string;
  discountCode?: string;
  /** Company name and address from the signed-in account, used to pre-fill the form. */
  initialProfile?: {
    companyName?: string;
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
  };
  /** True only for a signed-in company account. Guests pay by card. */
  eligible: boolean;
  /** Prevent checkout from snapshotting the cart while a mutation is in flight. */
  disabled?: boolean;
  label: string;
  description: string;
  openLabel: string;
  pendingLabel: string;
  errorLabel: string;
  signInLabel: string;
  companyLabel: string;
  addressLabel: string;
  addressLine2Label: string;
  postalCodeLabel: string;
  cityLabel: string;
};

/**
 * Paying by invoice is 30-day credit against reserved stock, so it is offered
 * only to signed-in company accounts. The e-mail and organisation number on the
 * invoice always come from that account; the buyer may adjust the company name
 * and the address for this order.
 */
export default function InvoiceCheckoutButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    companyName: props.initialProfile?.companyName ?? '',
    line1: props.initialProfile?.line1 ?? '',
    line2: props.initialProfile?.line2 ?? '',
    city: props.initialProfile?.city ?? '',
    postalCode: props.initialProfile?.postalCode ?? '',
  });

  function change(field: keyof typeof profile, value: string) {
    setProfile(current => ({ ...current, [field]: value }));
  }

  async function createInvoice() {
    if (!props.cartId || props.disabled || isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartId: props.cartId,
          discountCode: props.discountCode,
          profile: {
            companyName: profile.companyName,
            address: {
              line1: profile.line1, line2: profile.line2, city: profile.city, postalCode: profile.postalCode,
            },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl) throw new Error(data.error ?? props.errorLabel);
      window.location.href = data.redirectUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : props.errorLabel);
      setIsPending(false);
    }
  }

  if (!props.eligible) {
    return (
      <section className="mt-4 border-t border-gray-200 pt-4 text-sm text-secondary dark:border-gray-700">
        <LocaleLink href="/account" className="text-accent hover:underline">
          {props.signInLabel}
        </LocaleLink>
      </section>
    );
  }

  return (
    <section className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!props.cartId || props.disabled}
          className="block w-full rounded-full border border-accent px-6 py-3 text-center font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
        >
          {props.openLabel}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
          <p className="text-sm text-secondary">{props.description}</p>
          <label className="block text-sm text-secondary">
            {props.companyLabel}
            <input value={profile.companyName} onChange={event => change('companyName', event.target.value)} autoComplete="organization" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
          </label>
          <label className="block text-sm text-secondary">
            {props.addressLabel}
            <input value={profile.line1} onChange={event => change('line1', event.target.value)} autoComplete="street-address" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
          </label>
          <label className="block text-sm text-secondary">
            {props.addressLine2Label}
            <input value={profile.line2} onChange={event => change('line2', event.target.value)} autoComplete="address-line2" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-secondary">
              {props.postalCodeLabel}
              <input value={profile.postalCode} onChange={event => change('postalCode', event.target.value)} autoComplete="postal-code" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
            </label>
            <label className="text-sm text-secondary">
              {props.cityLabel}
              <input value={profile.city} onChange={event => change('city', event.target.value)} autoComplete="address-level2" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
            </label>
          </div>
          <button type="button" onClick={createInvoice} disabled={isPending || !props.cartId || props.disabled} className="block w-full rounded-full bg-accent px-6 py-3 text-center font-semibold text-color-accent-primary transition-colors hover:bg-accent/90 disabled:opacity-60">
            {isPending ? props.pendingLabel : props.label}
          </button>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </section>
  );
}
