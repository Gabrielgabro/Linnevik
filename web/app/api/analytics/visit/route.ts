/**
 * Tar emot ett besök från butiken.
 *
 * Anropas bara av `VisitLogger` och bara när besökaren tackat ja till
 * analyskakor. Svarar alltid 204 utan kropp — klienten har ingenting att göra
 * med svaret, och ett tomt svar går inte att använda för att läsa av vad som
 * sparades.
 *
 * Rutten ligger under /api och är därmed utanför proxyns matcher, så den har
 * ingen språkprefix och ingen omdirigering att ta hänsyn till.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsConfigured, recordVisit } from '@/lib/analyticsDb';
import { parseVisit, VisitInputError } from '@/lib/analyticsEvent';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tomt svar, aldrig cachat. Samma svar oavsett vad som hände inuti. */
const ACCEPTED = () =>
  new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export async function POST(request: NextRequest) {
  if (!analyticsConfigured()) return ACCEPTED();

  // Skyddar mot ett skript som skickar in påhittade besök. Nyckeln är
  // avsändarens IP och inte `visitorId`: det senare väljer klienten själv och
  // ett skript byter det per anrop, vilket nollställer räknaren varje gång.
  const limit = await checkRateLimit({
    scope: 'analytics_visit',
    identity: clientIp(request.headers),
    limit: 600,
    windowSeconds: 3600,
  });
  if (!limit.allowed) return ACCEPTED();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ACCEPTED();
  }

  try {
    const visit = parseVisit(body);
    await recordVisit(visit, request.headers, new URL(SITE_URL).hostname);
  } catch (error) {
    // En trasig kropp är avsändarens fel och inte värd ett larm; ett
    // databasfel loggas men får aldrig synas för besökaren.
    if (!(error instanceof VisitInputError)) {
      console.error('[analytics] Kunde inte spara besöket:', error);
    }
  }

  return ACCEPTED();
}
