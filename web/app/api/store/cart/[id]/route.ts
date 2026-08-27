import { NextRequest, NextResponse } from 'next/server';
import { getOwnedCart } from '@/lib/cartDb';
import { cartApiError, cartId, requireOwnedCommerce } from '@/lib/storeCartApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const id = cartId((await context.params).id);
    const cart = await getOwnedCart(id);
    if (!cart) return NextResponse.json({ error: 'Korgen finns inte.' }, { status: 404 });
    // En korg som gått vidare till kassan eller löpt ut kommer aldrig tillbaka:
    // den går inte längre att ändra, och klienten glömmer den bara på 404. Utan
    // det här svaret blev den kvar i gränssnittet efter ett köp — synlig, full
    // och låst — ända tills webbläsarens lagring rensades. En faktura gör
    // ordern betald först om 30 dagar, så väntan var som längst där.
    if (cart.status !== 'active') {
      return NextResponse.json({ error: 'Korgen finns inte.' }, { status: 404 });
    }
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}
