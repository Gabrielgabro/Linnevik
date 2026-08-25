import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin, routeId } from '@/lib/adminRoute';
import { acknowledgeAlert } from '@/lib/opsAlerts';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Kvitterar ett larm. Kvitteringen gäller händelsen — alla rader med samma
 * nyckel — och inte den enskilda raden: en händelse som larmat tio gånger ska
 * inte behöva kvitteras tio gånger.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const changed = await acknowledgeAlert(id, auth.user);
  if (!changed) {
    return NextResponse.json(
      { error: 'Larmet finns inte, eller är redan kvitterat.' },
      { status: 404 }
    );
  }
  await record(auth.user, 'alert.acknowledged', String(id));
  return NextResponse.json({ ok: true });
}
