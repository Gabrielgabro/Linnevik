/**
 * Prislogiken. Ren, isomorf och utan databas.
 *
 * Det här är den enda platsen som avgör vad en enhet kostar. Modulen har
 * medvetet inga server-beroenden: produktsidan räknar om priset i webbläsaren
 * när kunden ändrar antal, och kassan räknar samma sak på servern. Så länge
 * båda kallar samma funktion med samma konfiguration kan de inte säga emot
 * varandra.
 *
 * Det kunde de förut. `mtoPrice.ts` gav produktsidan trapporna 50/200/400/600/
 * 1000 → 0/5/10/15/20 %, medan `pricing.ts` gav korgen och Stripe 20/50/100 →
 * 5/10/15 %. Varje antal från 20 och uppåt visade alltså ett annat pris än det
 * kunden debiterades — vid 1000 enheter utlovade sidan 20 % rabatt och kassan
 * drog 15 %.
 *
 * Alla belopp är i minorenheter (öre) och **exklusive moms**. Momsen läggs på
 * i kassan, se lib/vat.ts.
 */

/**
 * Strategierna admin ska kunna välja mellan på prislogiksidan.
 *
 * - `progressive` — trappor: rabatten hoppar upp vid bestämda antal.
 * - `linear`      — rabatten växer jämnt med antalet, upp till ett tak.
 * - `margin`      — priset sätts från landad kostnad mot ett marginalmål i
 *                   stället för från listpriset.
 */
export type PricingStrategy = 'progressive' | 'linear' | 'margin';

export type PricingTier = {
  /** Trappan gäller från och med det här antalet. */
  minQuantity: number;
  discountPercent: number;
};

export type PricingConfig = {
  strategy: PricingStrategy;
  /** Trappor för `progressive`. Sorteras vid användning — ordningen i listan spelar ingen roll. */
  tiers: PricingTier[];
  /** `linear`: rabatten stiger `percentPerStep` för varje `quantityStep` över `startQuantity`, till taket. */
  linear: {
    startQuantity: number;
    quantityStep: number;
    percentPerStep: number;
    maxPercent: number;
  };
  /** `margin`: bruttomarginalen priset siktar på över landad kostnad. */
  marginTargetPercent: number;
  /**
   * Golv för bruttomarginalen. Ingen strategi får pressa priset under
   * `landadKostnad / (1 - golvet)`. `null` stänger av spärren — det är
   * utgångsläget, eftersom landad kostnad bara är känd för sex produkter och
   * en spärr som slår till på halva sortimentet vore värre än ingen alls.
   */
  marginFloorPercent: number | null;
  /** Minsta antal för MTO-produkter. Sätter också startvärdet i antalsrutan. */
  minimumOrderQuantity: number;
  /**
   * Vilka produkter mängdrabatten gäller. `mto` är det sajten skyltar med —
   * volympriset presenteras bara på MTO-produkter. `all` ger samma trappa åt
   * lagerförda varor också.
   */
  appliesTo: 'mto' | 'all';
};

/**
 * Utgångsläget är det sajten redan lovar kunden: trapporna som stod i
 * `mtoPrice.ts` och som produktsidan visat hela tiden, och bara för
 * MTO-produkter, som är de enda som skyltat med volympris.
 *
 * Marginalspärren är avstängd, så inget pris ändras av att den finns.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  strategy: 'progressive',
  tiers: [
    { minQuantity: 50, discountPercent: 0 },
    { minQuantity: 200, discountPercent: 5 },
    { minQuantity: 400, discountPercent: 10 },
    { minQuantity: 600, discountPercent: 15 },
    { minQuantity: 1000, discountPercent: 20 },
  ],
  linear: { startQuantity: 50, quantityStep: 100, percentPerStep: 2, maxPercent: 20 },
  marginTargetPercent: 55,
  marginFloorPercent: null,
  minimumOrderQuantity: 50,
  appliesTo: 'mto',
};

/** Trappan som gäller vid ett visst antal, eller `null` under första trappan. */
export function tierFor(config: PricingConfig, quantity: number): PricingTier | null {
  const sorted = [...config.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  let match: PricingTier | null = null;
  for (const tier of sorted) {
    if (quantity >= tier.minQuantity) match = tier;
  }
  return match;
}

function linearDiscountPercent(config: PricingConfig, quantity: number): number {
  const { startQuantity, quantityStep, percentPerStep, maxPercent } = config.linear;
  if (quantity < startQuantity || quantityStep <= 0) return 0;
  const steps = Math.floor((quantity - startQuantity) / quantityStep);
  return Math.min(maxPercent, Math.max(0, steps * percentPerStep));
}

/**
 * Rabatten i procent innan marginalspärren. `margin`-strategin har ingen
 * procentsats — den räknar priset från kostnaden i stället — och svarar 0 här.
 */
export function discountPercentFor(config: PricingConfig, quantity: number): number {
  if (quantity < 1) return 0;
  switch (config.strategy) {
    case 'progressive':
      return tierFor(config, quantity)?.discountPercent ?? 0;
    case 'linear':
      return linearDiscountPercent(config, quantity);
    case 'margin':
      return 0;
  }
}

/** Lägsta tillåtna pris för en given marginal över landad kostnad. */
export function priceForMargin(landedCostMinor: number, marginPercent: number): number {
  const share = 1 - marginPercent / 100;
  // En marginal på 100 % eller mer går inte att räkna fram ett pris ur.
  if (share <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(landedCostMinor / share);
}

export type PriceInput = {
  listPriceMinor: number;
  quantity: number;
  /** Landad kostnad per styck i öre. `null` när den inte är utredd. */
  landedCostMinor?: number | null;
  /** Sant för produkter taggade MTO. Styr om mängdrabatten gäller alls. */
  isMto?: boolean;
};

export type PriceResult = {
  /** Antalet som priset räknats på — MTO lyfts till minsta orderantal. */
  quantity: number;
  listUnitAmountMinor: number;
  unitAmountMinor: number;
  discountPercent: number;
  /** Sant när marginalspärren höjde priset över vad strategin gav. */
  marginFloorApplied: boolean;
  totalAmountMinor: number;
};

/**
 * Priset för en rad.
 *
 * Ordningen är: strategin sätter ett pris, marginalspärren höjer det vid behov,
 * och först därefter avrundas till hela ören. Totalen räknas som antal gånger
 * det avrundade styckpriset, aldrig tvärtom — annars stämmer inte raden med
 * det kunden ser.
 */
export function priceLine(config: PricingConfig, input: PriceInput): PriceResult {
  const isMto = input.isMto ?? false;
  const quantity = isMto
    ? Math.max(input.quantity, config.minimumOrderQuantity)
    : Math.max(input.quantity, 1);

  const eligible = config.appliesTo === 'all' || isMto;
  const discountPercent = eligible ? discountPercentFor(config, quantity) : 0;

  let unit: number;
  if (config.strategy === 'margin' && eligible && input.landedCostMinor != null) {
    unit = priceForMargin(input.landedCostMinor, config.marginTargetPercent);
  } else {
    unit = input.listPriceMinor * (1 - discountPercent / 100);
  }

  let marginFloorApplied = false;
  if (config.marginFloorPercent != null && input.landedCostMinor != null) {
    const floor = priceForMargin(input.landedCostMinor, config.marginFloorPercent);
    if (floor > unit) {
      unit = floor;
      marginFloorApplied = true;
    }
  }

  const unitAmountMinor = Math.max(0, Math.round(unit));
  return {
    quantity,
    listUnitAmountMinor: input.listPriceMinor,
    unitAmountMinor,
    discountPercent,
    marginFloorApplied,
    totalAmountMinor: unitAmountMinor * quantity,
  };
}

/**
 * Går konfigurationen att räkna på i webbläsaren?
 *
 * Marginallogiken behöver landad kostnad, och den får aldrig skickas ut till
 * klienten — inköpspriset är inte något en besökare ska kunna läsa ur sidans
 * HTML. Produktsidan skickar därför bara med konfigurationen när den är fri
 * från kostnadsberoenden, och visar annars listpriset utan volymförhandsvisning.
 *
 * Poängen är att en framtida inställning i /admin inte tyst ska kunna
 * återskapa just det fel den här modulen finns för att stänga: ett pris på
 * produktsidan som inte är det kassan tar.
 */
export function isClientComputable(config: PricingConfig): boolean {
  return config.strategy !== 'margin' && config.marginFloorPercent === null;
}
