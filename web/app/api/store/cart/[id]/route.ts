import { NextRequest, NextResponse } from 'next/server';
import { getOwnedCart } from '@/lib/cartDb';
import { frozenCartIsResumable } from '@/lib/checkoutAttempts';
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
    // En korg som blivit ett köp eller löpt ut kommer aldrig tillbaka, och
    // klienten glömmer den bara på 404. Utan det svaret blev den kvar i
    // gränssnittet efter ett köp, synlig, full och låst. En faktura gör ordern
    // betald först om 30 dagar, så en fakturakorg räknas som köpt direkt.
    //
    // En korg i kassan med ett obetalt kortförsök är däremot kvar: kunden kan
    // ha avbrutit hos Stripe och vill tillbaka till samma korg (§5.5). Den
    // första ändringen öppnar den igen (cartDb.ts, requireEditableCart).
    const resumable =
      cart.status === 'checkout_started' && (await frozenCartIsResumable(cart.id, cart.version));
    if (cart.status !== 'active' && !resumable) {
      return NextResponse.json({ error: 'Korgen finns inte.' }, { status: 404 });
    }
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}
