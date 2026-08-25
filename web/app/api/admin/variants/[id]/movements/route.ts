import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, routeId } from '@/lib/adminRoute';
import { listVariantMovements } from '@/lib/inventoryDb';

export const runtime = 'nodejs';

/** Lagerhistoriken för en variant. Hämtas först när raden öppnas i /admin. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  return NextResponse.json({ movements: await listVariantMovements(id) });
}
