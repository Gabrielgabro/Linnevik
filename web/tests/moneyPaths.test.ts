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
      expect(disputeOutcome(status)).toEqual({ closed: false, lost: false });
    }
  });

  it('skiljer en vunnen tvist från en förlorad, utan att bestämma orderns status', () => {
    expect(disputeOutcome('won')).toEqual({ closed: true, lost: false });
    expect(disputeOutcome('warning_closed')).toEqual({ closed: true, lost: false });
    expect(disputeOutcome('lost')).toEqual({ closed: true, lost: true });
    expect(disputeOutcome('charge_refunded')).toEqual({ closed: true, lost: true });
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

// Webhooken och avstämningen körs på riktigt i tests/db/stripeEvents.test.ts (§17.2).

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
