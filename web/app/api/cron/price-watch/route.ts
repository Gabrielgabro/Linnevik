/**
 * Prisbevakningen. Körs av Vercel Cron enligt schemat i vercel.json.
 *
 * Skyddad av CRON_SECRET. Vercel skickar den som `Authorization: Bearer …` på
 * schemalagda anrop; samma header fungerar för manuell körning med curl.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://linnevik.se/api/cron/price-watch
 *
 * Lägg till ?dry=1 för att hämta och jämföra utan att skriva historik eller
 * skicka mejl — svaret innehåller allt boten skulle ha rapporterat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { sendEmail } from '@/lib/mailer';
import { collect } from '@/lib/priceWatch/scrape';
import { compare, htmlFor, subjectFor, worthEmailing } from '@/lib/priceWatch/report';
import { readLatest, storeConfigured, writeSnapshot } from '@/lib/priceWatch/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const runAt = new Date().toISOString();

  const observations = await collect();
  const previous = await readLatest();
  const findings = compare(observations, previous);

  let emailed = false;
  if (!dry) {
    await writeSnapshot({ runAt, observations });

    const to = process.env.PRICE_WATCH_TO ?? process.env.CONTACT_EMAIL_TO;
    if (worthEmailing(findings) && to) {
      const result = await sendEmail({
        to,
        subject: subjectFor(findings),
        html: htmlFor(findings, runAt),
      });
      emailed = result.success;
    }

    // Torrkörningar loggas inte: de ändrar inget och är oftast manuella prov.
    await record('prisbot', 'pricewatch.run', null, {
      watched: observations.length,
      failed: findings.failed,
      drops: findings.drops.length,
      undercuts: findings.undercuts.length,
      emailed,
    });
  }

  return NextResponse.json({
    runAt,
    dry,
    comparedAgainst: previous ? `föregående körning ${previous.runAt}` : 'baslinjen i competitorPrices.ts',
    historyEnabled: storeConfigured(),
    emailed,
    summary: {
      watched: observations.length,
      read: findings.ok,
      failed: findings.failed,
      drops: findings.drops.length,
      undercuts: findings.undercuts.length,
      newFailures: findings.newFailures.length,
    },
    drops: findings.drops.map(d => ({
      vendor: d.obs.vendor,
      product: d.obs.product,
      size: d.obs.size,
      affects: d.obs.skuPrefix,
      from: d.previousSek,
      to: d.obs.priceSek,
      deltaPct: Number(d.deltaPct.toFixed(1)),
      undercutsUs: d.undercutsUs,
    })),
    failures: observations
      .filter(o => o.priceSek == null)
      .map(o => ({ vendor: o.vendor, product: o.product, error: o.error })),
    observations: dry ? observations : undefined,
  });
}
