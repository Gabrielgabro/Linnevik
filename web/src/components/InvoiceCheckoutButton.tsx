'use client';

import { useState } from 'react';

type Props = {
  cartId?: string;
  discountCode?: string;
  label: string;
  description: string;
  openLabel: string;
  pendingLabel: string;
  errorLabel: string;
  emailLabel: string;
  organizationLabel: string;
  companyLabel: string;
  addressLabel: string;
  addressLine2Label: string;
  postalCodeLabel: string;
  cityLabel: string;
};

/**
 * The invoice choice deliberately collects the legal invoice recipient before
 * we create a Stripe receivable. Signed-in customers can leave email and org
 * number blank: the API reads the authenticated customer record instead.
 */
export default function InvoiceCheckoutButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    email: '', organizationNumber: '', companyName: '', line1: '', line2: '', city: '', postalCode: '',
  });

  function change(field: keyof typeof profile, value: string) {
    setProfile(current => ({ ...current, [field]: value }));
  }

  async function createInvoice() {
    if (!props.cartId || isPending) return;
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
            email: profile.email,
            organizationNumber: profile.organizationNumber,
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

  return (
    <section className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!props.cartId}
          className="block w-full rounded-full border border-accent px-6 py-3 text-center font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
        >
          {props.openLabel}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
          <p className="text-sm text-secondary">{props.description}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-secondary">
              {props.emailLabel}
              <input value={profile.email} onChange={event => change('email', event.target.value)} type="email" autoComplete="email" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
            </label>
            <label className="text-sm text-secondary">
              {props.organizationLabel}
              <input value={profile.organizationNumber} onChange={event => change('organizationNumber', event.target.value)} autoComplete="off" className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-600" />
            </label>
          </div>
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
          <button type="button" onClick={createInvoice} disabled={isPending || !props.cartId} className="block w-full rounded-full bg-accent px-6 py-3 text-center font-semibold text-color-accent-primary transition-colors hover:bg-accent/90 disabled:opacity-60">
            {isPending ? props.pendingLabel : props.label}
          </button>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </section>
  );
}
