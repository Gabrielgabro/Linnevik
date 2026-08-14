import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminRoute';
import { listRecentOrders } from '@/lib/ordersDb';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ orders: await listRecentOrders(200) });
}
