/**
 * Antalstrappan för en korgrad.
 *
 * Servern validerar varje ändring med `assertOrderable`: antalet måste ligga
 * på eller över minsta beställningsantal, träffa beställningssteget räknat
 * från det minsta, och rymmas i lagret. Korgens +/− måste därför stega efter
 * samma trappa — stegar de med 1 nekas varje klick på en vara som beställs i
 * annat än ettor, och kunden ser bara att knappen "inte funkar".
 */

export type QuantityRules = {
  quantity: number;
  minimumOrderQuantity: number;
  orderIncrement: number;
  /** `null` när lagret inte följs — då finns inget tak. */
  availableQuantity: number | null;
};

export type QuantityControls = {
  /** Antalet ett klick på − ska skicka. */
  next: { down: number; up: number };
  canDecrease: boolean;
  canIncrease: boolean;
  floor: number;
  step: number;
  ceiling: number | null;
};

export function quantityControls(line: QuantityRules): QuantityControls {
  // Kolumnerna är `> 0`-kontrollerade i databasen, men en rad kan ha lästs
  // innan en regel fanns — ett steg på 0 skulle låsa knapparna för alltid.
  const step = Math.max(1, Math.floor(line.orderIncrement) || 1);
  const floor = Math.max(1, Math.floor(line.minimumOrderQuantity) || 1);
  const ceiling = line.availableQuantity;

  // Ett antal som redan ligger snett mot trappan (t.ex. efter att en admin
  // ändrat regeln) måste stega ned till närmaste giltiga steg, inte bara
  // dra av ett steg — annars är även nästa antal ogiltigt.
  const stepsFromFloor = Math.ceil((line.quantity - floor) / step);
  const down = Math.max(floor, floor + (stepsFromFloor - 1) * step);
  const up = floor + Math.max(0, stepsFromFloor + 1) * step;

  return {
    next: { down, up },
    canDecrease: line.quantity > floor,
    canIncrease: ceiling === null || up <= ceiling,
    floor,
    step,
    ceiling,
  };
}

/**
 * Det minsta antal servern godtar som är minst `quantity` (§5.3, §5.4).
 * Stegen räknas från det minsta antalet, som i `assertOrderable`: med minst 10
 * och steg 4 är 10, 14 och 18 giltiga, inte 12. Produktsidan räknade förr
 * från noll och föreslog antal som servern sedan nekade (A22).
 */
export function snapQuantity(
  quantity: number,
  rules: { minimumOrderQuantity: number; orderIncrement: number }
): number {
  const step = Math.max(1, Math.floor(rules.orderIncrement) || 1);
  const floor = Math.max(1, Math.floor(rules.minimumOrderQuantity) || 1);
  const wanted = Number.isFinite(quantity) ? Math.max(floor, Math.ceil(quantity)) : floor;
  return floor + Math.ceil((wanted - floor) / step) * step;
}
