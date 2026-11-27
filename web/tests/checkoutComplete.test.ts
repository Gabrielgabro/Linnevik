/**
 * §6.4: sidan efter betalningen visar betalningens riktiga läge (A23).
 * Förr visade den "betalningen behandlas" för betalda ordrar med
 * lagerundantag eller tvist.
 */

import { describe, expect, it } from 'vitest';
import { checkoutCompleteState } from '@/lib/checkoutComplete';

const card = (status: string, paymentStatus: string) => ({ status, paymentStatus, paymentMethod: 'checkout' });
const invoice = (status: string, paymentStatus: string) => ({ status, paymentStatus, paymentMethod: 'invoice' });

describe('sidan efter betalningen', () => {
  it('visar betald när pengarna har kommit in, vad ordern än har för internt läge', () => {
    for (const status of ['paid', 'stock_exception', 'disputed', 'on_hold', 'closed']) {
      expect(checkoutCompleteState(card(status, 'paid'))).toBe('paid');
    }
    expect(checkoutCompleteState(card('paid', 'partially_refunded'))).toBe('paid');
    expect(checkoutCompleteState(invoice('paid', 'paid'))).toBe('paid');
  });

  it('väntar bara medan kortbetalningen inte är bekräftad', () => {
    expect(checkoutCompleteState(card('pending', 'pending'))).toBe('pending');
  });

  it('säger att en kortbetalning inte gick igenom', () => {
    expect(checkoutCompleteState(card('expired', 'pending'))).toBe('failed');
    expect(checkoutCompleteState(card('failed', 'failed'))).toBe('failed');
  });

  it('visar fakturan för en obetald fakturaorder, och avbokad när den är avbokad', () => {
    expect(checkoutCompleteState(invoice('pending', 'pending'))).toBe('invoice');
    expect(checkoutCompleteState(invoice('cancelled', 'failed'))).toBe('cancelled');
    expect(checkoutCompleteState(card('cancelled', 'pending'))).toBe('cancelled');
  });
});
