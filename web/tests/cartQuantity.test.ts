import { describe, expect, it } from 'vitest';
import { quantityControls, type QuantityRules } from '@/lib/cartQuantity';
import { assertOrderable } from '@/lib/cartRules';

function orderable(rules: QuantityRules, quantity: number) {
  assertOrderable(
    {
      active: true,
      availableForSale: true,
      inventoryTracked: rules.availableQuantity !== null,
      inventoryQuantity: rules.availableQuantity ?? 0,
      minimumOrderQuantity: rules.minimumOrderQuantity,
      orderIncrement: rules.orderIncrement,
      sku: 'TEST',
    },
    quantity
  );
}

describe('cart quantity stepping', () => {
  it('steps by the order increment, not by one', () => {
    const controls = quantityControls({
      quantity: 50,
      minimumOrderQuantity: 50,
      orderIncrement: 10,
      availableQuantity: null,
    });
    expect(controls.next.up).toBe(60);
    // Redan på golvet: − är avstängd och får inte gå under det.
    expect(controls.canDecrease).toBe(false);
    expect(controls.next.down).toBe(50);
  });

  it('never steps below the minimum order quantity', () => {
    const controls = quantityControls({
      quantity: 60,
      minimumOrderQuantity: 50,
      orderIncrement: 10,
      availableQuantity: null,
    });
    expect(controls.next.down).toBe(50);
    expect(controls.canDecrease).toBe(true);
  });

  it('stops increasing at the stock the server would accept', () => {
    const controls = quantityControls({
      quantity: 90,
      minimumOrderQuantity: 10,
      orderIncrement: 10,
      availableQuantity: 95,
    });
    // Nästa steg vore 100, mer än de 95 som finns kvar.
    expect(controls.canIncrease).toBe(false);
  });

  it('has no ceiling when inventory is not tracked', () => {
    const controls = quantityControls({
      quantity: 1000,
      minimumOrderQuantity: 1,
      orderIncrement: 1,
      availableQuantity: null,
    });
    expect(controls.canIncrease).toBe(true);
  });

  it('pulls a quantity that is off the ladder back onto it', () => {
    // Kan uppstå om beställningssteget ändrats efter att raden lades i korgen.
    const controls = quantityControls({
      quantity: 55,
      minimumOrderQuantity: 10,
      orderIncrement: 10,
      availableQuantity: null,
    });
    expect(controls.next.down).toBe(50);
    expect(controls.next.up).toBe(70);
  });

  it('survives a zeroed increment instead of freezing the buttons', () => {
    const controls = quantityControls({
      quantity: 5,
      minimumOrderQuantity: 0,
      orderIncrement: 0,
      availableQuantity: null,
    });
    expect(controls.step).toBe(1);
    expect(controls.floor).toBe(1);
    expect(controls.next.up).toBe(6);
    expect(controls.next.down).toBe(4);
  });

  it('only ever proposes quantities the server accepts', () => {
    const cases: QuantityRules[] = [];
    for (const minimumOrderQuantity of [1, 5, 50]) {
      for (const orderIncrement of [1, 10, 25]) {
        for (const offset of [0, 1, 2, 7]) {
          cases.push({
            quantity: minimumOrderQuantity + orderIncrement * offset,
            minimumOrderQuantity,
            orderIncrement,
            availableQuantity: 10_000,
          });
        }
      }
    }

    for (const line of cases) {
      const controls = quantityControls(line);
      if (controls.canDecrease) {
        expect(() => orderable(line, controls.next.down)).not.toThrow();
      }
      if (controls.canIncrease) {
        expect(() => orderable(line, controls.next.up)).not.toThrow();
      }
    }
  });
});
