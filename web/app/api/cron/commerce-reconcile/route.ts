/**
 * Skyddsnätet under webhooken (source_of_truth §17.1, §17.2). Varje natt kl
 * 03:00 (vercel.json):
 *
 * - händelser från Stripe som fastnade halvvägs hanteras igen
 * - obetalda kortordrar stäms av mot sina Stripe-sessioner
 * - återbetalningar och tvister läses om från Stripe
 * - fakturor följs upp, och lågt lager larmar
 *
 * Webhooken är den vanliga vägen och landar på sekunder. Det här fångar det
 * den missade, inom ett dygn. Allt läses sida för sida, så antalet rader
 * begränsar inte vad som hinns med.
 *
 * Kan köras för hand om en betalning ser fast ut:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://linnevik.se/api/cron/commerce-reconcile
 */

import { NextRequest, NextResponse } from 'next/server';
import { lowStockThreshold } from '@/lib/commerceConfig';
import { lowStockVariants } from '@/lib/inventoryDb';
import { raiseAlert } from '@/lib/opsAlerts';
import { pruneAnalyticsEvents, RETENTION_DAYS } from '@/lib/analyticsDb';
import { pruneRateLimits } from '@/lib/rateLimit';
import { stripeConfigured } from '@/lib/stripe';
import { checkStripeKey } from '@/lib/stripeHealth';
import { reconcileRecentCheckoutSessions } from '@/lib/stripeCheckout';
import { reconcileOpenInvoices } from '@/lib/invoiceOrders';
import { reconcileRefundsAndDisputes, retryStuckStripeEvents } from '@/lib/stripeReconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Fakturorna är våra egna och följs upp utan Stripe (§9.7).
  const invoiceResult = await reconcileOpenInvoices();

  // Kortbetalningarna stäms av mot Stripe. Nyckeln först: en utgången nyckel
  // larmar här, en gång per natt, i stället för när en kund försöker betala.
  const stripeKey = stripeConfigured() ? await checkStripeKey({ fresh: true }) : null;
  if (!stripeKey || (!stripeKey.ok && stripeKey.reason !== 'unreachable')) {
    return NextResponse.json(
      { error: stripeKey?.ok === false ? stripeKey.message : 'Stripe is not configured.', invoices: invoiceResult },
      { status: 503 }
    );
  }
  // Fastnade händelser först: en av dem kan vara betalningen som annars
  // skulle stämmas av nedan.
  const stuckEvents = await retryStuckStripeEvents();
  const result = await reconcileRecentCheckoutSessions();
  const moneyBack = await reconcileRefundsAndDisputes();
  const stripeFailures = [...stuckEvents.failures, ...moneyBack.failures];
  if (stripeFailures.length) {
    await raiseAlert({
      kind: 'reconcile.failed',
      key: 'reconcile:events',
      subject: `Avstämningen av händelser, återbetalningar och tvister föll på ${stripeFailures.length} punkter`,
      detail: { fel: stripeFailures.slice(0, 10) },
    });
  }

  // Lagerkollen åker med samma körning. Den hör inte ihop med avstämningen,
  // men den vill ha exakt samma egenskap: en gång per dygn, utan att någon
  // behöver komma ihåg att titta. Larmet går bara ut när det finns något att
  // säga, och spärren i opsAlerts håller det till ett mejl per dygn.
  const threshold = lowStockThreshold();
  const lowStock = threshold > 0 ? await lowStockVariants(threshold) : [];
  if (lowStock.length) {
    await raiseAlert({
      kind: 'inventory.low_stock',
      key: 'inventory:low_stock',
      subject: `${lowStock.length} varianter har ${threshold} eller färre kvar`,
      detail: {
        varianter: lowStock
          .slice(0, 20)
          .map(row => `${row.sku} (${row.available} st, ${row.productTitle})`),
      },
      href: '/admin/products',
    });
  }

  // Utgångna ratbegränsningshinkar. Ingen skada om de ligger kvar, men
  // tabellen ska inte växa för evigt.
  const prunedBuckets = await pruneRateLimits();

  // Gallringen av besöksstatistiken åker med samma körning. Den låg först i
  // skrivvägen, men då bar butikens hetaste anrop en radering mot den största
  // tabellen — arbete som ändå görs en gång per dygn här.
  const prunedVisits = await pruneAnalyticsEvents();

  return NextResponse.json(
    {
      runAt: new Date().toISOString(),
      ...result,
      stuckEvents,
      refunds: moneyBack.refunds,
      disputes: moneyBack.disputes,
      invoices: invoiceResult,
      lowStock: lowStock.length,
      prunedBuckets,
      prunedVisits,
      visitRetentionDays: RETENTION_DAYS,
    },
    { status: result.failures.length || invoiceResult.failures.length || stripeFailures.length ? 207 : 200 }
  );
}
