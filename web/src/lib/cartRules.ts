export type Orderability = {
  active: boolean;
  availableForSale: boolean;
  inventoryTracked: boolean;
  inventoryQuantity: number;
  minimumOrderQuantity: number;
  orderIncrement: number;
  sku: string;
};

export class CartRuleError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_QUANTITY'
      | 'NOT_FOR_SALE'
      | 'BELOW_MINIMUM'
      | 'INVALID_INCREMENT'
      | 'INSUFFICIENT_STOCK'
  ) {
    super(message);
    this.name = 'CartRuleError';
  }
}

/** MTO and sample-only products use the quote/sample channel, never the cart. */
export function assertCartProductChannel(tags: string[] | null, sku: string): void {
  if (tags?.includes('MTO') || tags?.includes('SAMPLE_ONLY')) {
    throw new CartRuleError(`${sku} går bara att beställa som prov eller offert.`, 'NOT_FOR_SALE');
  }
}

export function assertOrderable(variant: Orderability, quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
    throw new CartRuleError(`Ogiltigt antal för ${variant.sku}.`, 'INVALID_QUANTITY');
  }
  if (!variant.active || !variant.availableForSale) {
    throw new CartRuleError(`${variant.sku} går inte att beställa.`, 'NOT_FOR_SALE');
  }
  if (quantity < variant.minimumOrderQuantity) {
    throw new CartRuleError(
      `${variant.sku} har minsta beställningsantal ${variant.minimumOrderQuantity}.`,
      'BELOW_MINIMUM'
    );
  }
  if ((quantity - variant.minimumOrderQuantity) % variant.orderIncrement !== 0) {
    throw new CartRuleError(
      `${variant.sku} måste beställas i steg om ${variant.orderIncrement} från ${variant.minimumOrderQuantity}.`,
      'INVALID_INCREMENT'
    );
  }
  if (variant.inventoryTracked && quantity > variant.inventoryQuantity) {
    throw new CartRuleError(
      `Det finns bara ${variant.inventoryQuantity} av ${variant.sku} i lager.`,
      'INSUFFICIENT_STOCK'
    );
  }
}
