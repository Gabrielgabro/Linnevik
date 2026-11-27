/**
 * Ett kortförsök som fryser varukorgen, och vägen tillbaka från det.
 *
 * När kunden går till kassan fryses korgen (`checkout_started`) och en order
 * väntar på betalning. Avbryter kunden hos Stripe och kommer tillbaka ska
 * korgen finnas kvar med samma varor (source_of_truth §5.5, A4). Förr svarade
 * korgen 404 och webbläsaren glömde den.
 *
 * - Så länge betalsidan är öppen visas korgen som den är, och "Till kassan"
 *   ger samma betalsida (§6.3).
 * - Den första ändringen stänger betalsidan, släpper lagret och öppnar
 *   korgen igen. Annars kunde kunden betala för en version av korgen som
 *   inte längre finns.
 *
 * En korg vars order är en faktura eller redan betald är ett köp. Den öppnas
 * aldrig igen.
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { carts } from '@/lib/db/schema';
import { getStripe } from '@/lib/stripe';
import { abandonPendingOrder, getOrderByCartVersion, type OrderWithItems } from '@/lib/ordersDb';

function isOpenCardAttempt(order: OrderWithItems): boolean {
  return order.paymentMethod === 'checkout' && order.status === 'pending' && order.paymentStatus === 'pending';
}

/**
 * Lägg ner ett försök så att köparen kan börja om. En betalsida som fortfarande
 * är öppen stängs först: `abandonPendingOrder` släpper lagret försöket
 * reserverade, och en öppen betalsida utan reservation bakom sig är en
 * försäljning vi inte kan leverera.
 */
export async function retireAttempt(order: OrderWithItems, reason: string): Promise<void> {
  if (order.stripeSessionId.startsWith('cs_')) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
      if (session.status === 'open') await getStripe().checkout.sessions.expire(order.stripeSessionId);
    } catch (error) {
      console.error('[Checkout] Could not expire the superseded session:', error);
      throw error;
    }
  }
  await abandonPendingOrder(order.id, reason);
}

/**
 * Sant om en frusen korg ska visas för kunden: dess order är ett kortförsök
 * som inte är betalt, eller så finns ingen order alls.
 */
export async function frozenCartIsResumable(cartId: string, version: number): Promise<boolean> {
  const order = await getOrderByCartVersion(cartId, version);
  return !order || isOpenCardAttempt(order);
}

/**
 * Öppnar en frusen korg för ändringar. Svarar falskt när korgen hör till ett
 * köp som inte får ångras här.
 */
export async function reopenCartFromCheckout(cartId: string, version: number): Promise<boolean> {
  const order = await getOrderByCartVersion(cartId, version);
  if (order) {
    if (!isOpenCardAttempt(order)) return false;
    await retireAttempt(order, 'Cart reopened for editing');
    return true;
  }
  // Ingen order för versionen: kassan föll innan den hann skapas. Inget lager
  // är reserverat och ingen betalsida finns.
  await getDb()
    .update(carts)
    .set({ status: 'active', version: sql`${carts.version} + 1`, checkoutStartedAt: null, updatedAt: new Date() })
    .where(and(eq(carts.id, cartId), eq(carts.version, version), eq(carts.status, 'checkout_started')));
  return true;
}
