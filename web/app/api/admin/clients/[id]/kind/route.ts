import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { record } from '@/lib/adminActivity';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { CLIENT_KIND_LABEL } from '@/lib/clients';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * Flyttar ett företag mellan ringlistan (Tvätterikunder) och kundregistret
 * (Kunder). "Gör till kund" när ett samtal blivit en affär.
 *
 * Ett företag med webbkonton går inte att flytta tillbaka till ringlistan:
 * kontona och deras ordrar hör hemma i kundregistret, och kassan skulle ändå
 * flytta det tillbaka vid nästa köp.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const kind = parsed.body.kind;
  if (kind !== 'lead' && kind !== 'customer') {
    return NextResponse.json({ error: 'Okänt register.' }, { status: 400 });
  }

  const db = getDb();
  const [before] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });
  if (before.kind === kind) return NextResponse.json({ client: before });
  if (kind === 'lead') {
    const [account] = await db.select({ id: customers.id }).from(customers).where(eq(customers.clientId, id)).limit(1);
    if (account) {
      return NextResponse.json(
        { error: 'Företaget har webbkonton och kan inte flyttas till ringlistan. Ta bort kontona först.' },
        { status: 409 }
      );
    }
  }

  const [row] = await db
    .update(clients)
    .set({
      kind,
      // Statusen följer med när den bara sa vilket register posten låg i.
      ...(kind === 'customer' && before.status === 'Tvätterikund' ? { status: 'Aktiv kund' } : {}),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();
  await record(auth.user, 'client.updated', String(id), {
    kund: before.name,
    flyttad: `${CLIENT_KIND_LABEL[before.kind]} → ${CLIENT_KIND_LABEL[kind]}`,
  });
  return NextResponse.json({ client: row });
}
