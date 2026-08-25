import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AMOUNT_DRIFT_TOLERANCE_MINOR,
  amountDrifted,
  disputeOutcome,
} from '@/lib/orderChecks';

/**
 * De vägar där riktiga pengar kan hamna fel.
 *
 * Två sorters prov här, och skillnaden är avsiktlig. De rena reglerna körs på
 * riktigt. Resten är kontraktsprov mot källan — samma teknik som
 * ownedCartContracts.test.ts — därför att de invarianterna bor i SQL som bara
 * en riktig databas kan köra. Ett kontraktsprov bevisar inte att satsen
 * fungerar; det gör att den inte går att ta bort av misstag, vilket är precis
 * det som hände de här hålen från början.
 */

const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const webhook = readFileSync(resolve('app/api/stripe/webhook/route.ts'), 'utf8');
const stripeRefunds = readFileSync(resolve('src/lib/stripeRefunds.ts'), 'utf8');
const checkout = readFileSync(resolve('app/api/checkout/route.ts'), 'utf8');
const variantRoute = readFileSync(resolve('app/api/admin/variants/[id]/route.ts'), 'utf8');

describe('beloppsavvikelse mellan vår uträkning och Stripe', () => {
  it('släpper igenom avrundning', () => {
    expect(amountDrifted(125_00, 125_00)).toBe(false);
    expect(amountDrifted(125_00, 125_00 + AMOUNT_DRIFT_TOLERANCE_MINOR)).toBe(false);
  });

  it('flaggar en skillnad större än toleransen, åt båda hållen', () => {
    expect(amountDrifted(125_00, 130_00)).toBe(true);
    expect(amountDrifted(125_00, 120_00)).toBe(true);
  });
});

describe('tviststatus från Stripe', () => {
  it('håller ordern öppen så länge underlag kan lämnas', () => {
    for (const status of [
      'needs_response',
      'under_review',
      'warning_needs_response',
      'warning_under_review',
    ]) {
      expect(disputeOutcome(status)).toEqual({
        closed: false,
        lost: false,
        orderStatus: 'disputed',
      });
    }
  });

  it('lämnar tillbaka ordern som betald när tvisten vunnits', () => {
    expect(disputeOutcome('won').orderStatus).toBe('paid');
    expect(disputeOutcome('warning_closed').orderStatus).toBe('paid');
  });

  it('skriver ordern som återbetald när beloppet gick förlorat', () => {
    expect(disputeOutcome('lost')).toEqual({ closed: true, lost: true, orderStatus: 'refunded' });
    expect(disputeOutcome('charge_refunded').orderStatus).toBe('refunded');
  });

  it('antar hellre att pengarna finns kvar vid en okänd status', () => {
    expect(disputeOutcome('något_stripe_hittar_på_sen').lost).toBe(false);
  });
});

describe('återbetalningar räknas likadant överallt', () => {
  // Räknades bara 'succeeded' skulle en återbetalning som ligger kvar i
  // 'pending' nolla refunded_minor, och adminvyn — som räknar återstående som
  // total_minor - refunded_minor — skulle erbjuda samma pengar en gång till.
  it('summerar pending och succeeded i updateRefundStatus', () => {
    expect(ordersDb).toContain("and status in ('pending', 'succeeded')");
  });

  it('summerar pending och succeeded i recordRefund', () => {
    expect(ordersDb).toContain("in ('pending', 'succeeded')");
  });
});

describe('webhooken täcker de vägar där pengar lämnar oss', () => {
  it('speglar återbetalningar oavsett var de startade', () => {
    expect(webhook).toContain("case 'refund.created'");
    expect(webhook).toContain("case 'refund.updated'");
    expect(webhook).toContain("case 'charge.refunded'");
    expect(webhook).toContain('syncStripeRefund');
  });

  it('hanterar tvister', () => {
    expect(webhook).toContain("case 'charge.dispute.created'");
    expect(webhook).toContain("case 'charge.dispute.closed'");
    expect(webhook).toContain('syncStripeDispute');
  });

  it('larmar när en händelse faller i stället för att bara logga', () => {
    expect(webhook).toContain('raiseAlert');
    expect(webhook).toContain('releaseStripeEvent');
  });

  it('skapar en lokal rad för en återbetalning gjord i Stripes kontrollpanel', () => {
    expect(stripeRefunds).toContain('recordRefund');
    expect(stripeRefunds).toContain('refundVatMinor');
    expect(stripeRefunds).toContain("actor: 'stripe'");
  });
});

describe('lagret hålls sant', () => {
  it('släpper utgångna reservationer när någon står i kassan', () => {
    expect(checkout).toContain('releaseExpiredReservations');
  });

  it('reserverar allt eller inget innan Stripe får ta betalt', () => {
    expect(checkout).toContain('reserveOrderStockStrict');
  });

  it('vägrar sätta lagret under det som är reserverat', () => {
    expect(variantRoute).toContain('before.inventoryReserved');
    expect(variantRoute).toContain('setVariantStock');
  });

  it('skriver varje manuell lagerändring till historiken', () => {
    const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
    expect(inventory).toContain("'adjust'");
    expect(inventory).toContain('insert into inventory_movements');
  });
});
