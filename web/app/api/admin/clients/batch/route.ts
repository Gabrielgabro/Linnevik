/**
 * Massåtgärder på kunder. Registret kommer ur en arkivlista, så mycket av
 * arbetet är att rätta många rader på en gång — sätta status på ett helt
 * segment, eller rensa bort rader som aldrig skulle ha följt med.
 */

import { inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import { CLIENT_STATUSES, PRIORITIES, SEGMENTS } from '@/lib/clients';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** Så många rader som mest per anrop — en förlöpt slinga ska inte kunna svepa registret. */
const MAX_IDS = 500;

function parseIds(body: Record<string, unknown>): number[] {
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const ids = raw
    .map(value => Number(value))
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, MAX_IDS);
  return Array.from(new Set(ids));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  const ids = parseIds(body);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Ingen kund vald.' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const value = typeof body.value === 'string' ? body.value : '';
  const db = getDb();

  // Namnen hämtas före ändringen — efter en borttagning finns de inte kvar
  // att logga, och loggraden ska säga vilka kunder det gällde.
  const affected = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(inArray(clients.id, ids));
  if (affected.length === 0) {
    return NextResponse.json({ error: 'Ingen av kunderna finns kvar.' }, { status: 404 });
  }
  const names = affected.map(c => c.name);
  const targets = affected.map(c => c.id);
  // Loggraden ska gå att läsa; vid många kunder räcker antalet och några namn.
  const summary = names.length > 5 ? `${names.slice(0, 5).join(', ')} m.fl.` : names.join(', ');

  if (action === 'delete') {
    const linked = await db
      .select({ clientId: customers.clientId })
      .from(customers)
      .where(inArray(customers.clientId, targets));
    if (linked.length > 0) {
      return NextResponse.json(
        { error: 'Kunder med webbkonto eller orderhistorik kan inte tas bort.' },
        { status: 409 }
      );
    }
    await db.delete(clients).where(inArray(clients.id, targets));
    await record(auth.user, 'clients.batch', null, {
      åtgärd: 'tog bort',
      antal: String(targets.length),
      kunder: summary,
    });
    return NextResponse.json({ ok: true, count: targets.length });
  }

  const FIELDS = {
    status: { column: 'status', allowed: CLIENT_STATUSES as readonly string[] },
    priority: { column: 'priority', allowed: PRIORITIES as readonly string[] },
    segment: { column: 'segment', allowed: SEGMENTS as readonly string[] },
  } as const;

  const field = FIELDS[action as keyof typeof FIELDS];
  if (!field) return NextResponse.json({ error: 'Okänd åtgärd.' }, { status: 400 });
  if (!field.allowed.includes(value)) {
    return NextResponse.json({ error: 'Ogiltigt värde.' }, { status: 400 });
  }

  await db
    .update(clients)
    .set({ [field.column]: value, updatedAt: new Date() })
    .where(inArray(clients.id, targets));

  await record(auth.user, 'clients.batch', null, {
    åtgärd: `satte ${action} till ${value}`,
    antal: String(targets.length),
    kunder: summary,
  });

  return NextResponse.json({ ok: true, count: targets.length });
}
