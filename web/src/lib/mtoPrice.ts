/**
 * MTO Price Estimator
 * Calculates the price per unit based on quantity for Made-To-Order products
 */

// Volume discount tiers
type PriceTier = {
    minQty: number;
    maxQty: number | null;
    discountPercent: number;
};

export const PRICE_TIERS: PriceTier[] = [
    { minQty: 50, maxQty: 199, discountPercent: 0 },
    { minQty: 200, maxQty: 399, discountPercent: 5 },
    { minQty: 400, maxQty: 599, discountPercent: 10 },
    { minQty: 600, maxQty: 999, discountPercent: 15 },
    { minQty: 1000, maxQty: null, discountPercent: 20 },
];

export const MIN_ORDER_QUANTITY = 50;

/**
 * Get the applicable price tier for a given quantity
 */
export function getTier(quantity: number): PriceTier {
    return PRICE_TIERS.find(tier =>
        quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)
    ) || PRICE_TIERS[0];
}

type MTOPriceResult = {
    quantity: number;
    basePrice: number;
    unitPrice: number;
    totalPrice: number;
    discountPercent: number;
    tier: PriceTier;
};

/**
 * Calculate MTO pricing based on quantity and base price
 * @param quantity - Number of units ordered
 * @param basePrice - Base price per unit from Shopify
 * @returns Price information including unit price, total, and discount
 */
export function calculateMTOPrice(quantity: number, basePrice: number): MTOPriceResult {
    const effectiveQty = Math.max(quantity, MIN_ORDER_QUANTITY);
    const tier = getTier(effectiveQty);
    const discountMultiplier = 1 - (tier.discountPercent / 100);
    const unitPrice = basePrice * discountMultiplier;
    const totalPrice = unitPrice * effectiveQty;

    return {
        quantity: effectiveQty,
        basePrice: basePrice,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        discountPercent: tier.discountPercent,
        tier: tier,
    };
}
