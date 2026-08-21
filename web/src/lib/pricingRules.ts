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
 * Strategierna admin ska kunna välja mellan på mängdrabattsidan.
 *
 * - `progressive` — trappor: rabatten hoppar upp vid bestämda antal.
 * - `linear`      — rabatten växer jämnt med antalet, upp till ett tak.
 * - `orderValue`  — trappan mäts på hela orderns värde i stället för på antalet
 *                   i en enskild rad, och varje produkt har ett eget tak.
 * - `margin`      — priset sätts från landad kostnad mot ett marginalmål i
 *                   stället för från listpriset.
 */
export type PricingStrategy = 'progressive' | 'linear' | 'orderValue' | 'margin';

export type PricingTier = {
  /** Trappan gäller från och med det här antalet. */
  minQuantity: number;
  discountPercent: number;
};

export type OrderValueTier = {
  /** Trappan gäller från och med det här ordervärdet, i öre exkl. moms. */
  minOrderValueMinor: number;
  discountPercent: number;
};

/**
 * Tak per produkt. `skuPrefix` matchas med `startsWith` mot radens SKU, samma
 * konvention som landedCostLookup.ts — kostnaden och taket är båda satta per
 * produkt, inte per storlek.
 */
export type ProductDiscountCap = {
  skuPrefix: string;
  maxPercent: number;
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
  /**
   * `orderValue`: trappan mäts på summan av de rabattberättigade raderna till
   * listpris, och sänks per rad av produktens tak.
   */
  orderValue: {
    ladder: OrderValueTier[];
    caps: ProductDiscountCap[];
    /** Taket för rader utan egen post i `caps`. */
    defaultMaxPercent: number;
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
  /**
   * Utgångsläget för `orderValue` är trappan och taken ur prisanalysen
   * 2026-08: frakten i sändning HTL26-01 låg på 2 294 SEK/CBM, och det är den
   * kostnaden som faktiskt faller när en order blir stor nog att konsolideras.
   * Taken är därför satta efter hur skrymmande produkten är — Kudde Eric tappar
   * 41 % av sin landade kostnad vid full container, Kuddskydd bara 5 % — och
   * efter hur långt över konkurrentgolvet listpriset ligger.
   */
  orderValue: {
    ladder: [
      { minOrderValueMinor: 0, discountPercent: 0 },
      { minOrderValueMinor: 2_500_000, discountPercent: 3 },
      { minOrderValueMinor: 5_000_000, discountPercent: 6 },
      { minOrderValueMinor: 10_000_000, discountPercent: 9 },
      { minOrderValueMinor: 20_000_000, discountPercent: 12 },
    ],
    caps: [
      { skuPrefix: 'KUD-ERI', maxPercent: 28 },
      { skuPrefix: 'TAC-DAN', maxPercent: 25 },
      { skuPrefix: 'MAD', maxPercent: 18 },
      { skuPrefix: 'KSK', maxPercent: 10 },
      { skuPrefix: 'TAC-SEB', maxPercent: 8 },
      { skuPrefix: 'KUD-SIG', maxPercent: 8 },
    ],
    defaultMaxPercent: 12,
  },
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

/** Trappsteget som gäller vid ett visst ordervärde (öre, exkl. moms). */
export function orderValueTierFor(config: PricingConfig, subtotalMinor: number): OrderValueTier | null {
  const sorted = [...config.orderValue.ladder].sort((a, b) => a.minOrderValueMinor - b.minOrderValueMinor);
  let match: OrderValueTier | null = null;
  for (const tier of sorted) {
    if (subtotalMinor >= tier.minOrderValueMinor) match = tier;
  }
  return match;
}

/**
 * Taket för en rad. Längsta prefixet vinner, så `KUD-SIG` inte kan tas för
 * `KUD-ERI` — samma regel som landedCostLookup.ts.
 */
export function capPercentForSku(config: PricingConfig, sku: string | null | undefined): number {
  if (!sku) return config.orderValue.defaultMaxPercent;
  const match = [...config.orderValue.caps]
    .sort((a, b) => b.skuPrefix.length - a.skuPrefix.length)
    .find(cap => sku.startsWith(cap.skuPrefix));
  return match ? match.maxPercent : config.orderValue.defaultMaxPercent;
}

/**
 * Rabatten i procent innan marginalspärren. `margin`-strategin har ingen
 * procentsats — den räknar priset från kostnaden i stället — och svarar 0 här.
 *
 * `orderValue` svarar också 0: rabatten går inte att avgöra från en ensam rad,
 * eftersom trappan mäts på hela orderns värde. Den strategin prissätts med
 * `priceOrder`, och att svara 0 här betyder att en anropsväg som glömt byta
 * tar fullt listpris i stället för att gissa fram en rabatt — fel åt det håll
 * som inte kostar oss pengar.
 */
export function discountPercentFor(config: PricingConfig, quantity: number): number {
  if (quantity < 1) return 0;
  switch (config.strategy) {
    case 'progressive':
      return tierFor(config, quantity)?.discountPercent ?? 0;
    case 'linear':
      return linearDiscountPercent(config, quantity);
    case 'orderValue':
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

/** Antalet raden prissätts på. MTO lyfts alltid till minsta orderantal. */
function effectiveQuantity(config: PricingConfig, input: PriceInput): number {
  return input.isMto ?? false
    ? Math.max(input.quantity, config.minimumOrderQuantity)
    : Math.max(input.quantity, 1);
}

/**
 * Priset för en rad.
 *
 * Ordningen är: strategin sätter ett pris, marginalspärren höjer det vid behov,
 * och först därefter avrundas till hela ören. Totalen räknas som antal gånger
 * det avrundade styckpriset, aldrig tvärtom — annars stämmer inte raden med
 * det kunden ser.
 *
 * För `orderValue` ger den här funktionen fullt listpris, eftersom en ensam rad
 * inte vet vad hela ordern är värd. Använd `priceOrder` för den strategin.
 */
export function priceLine(config: PricingConfig, input: PriceInput): PriceResult {
  const isMto = input.isMto ?? false;
  const quantity = effectiveQuantity(config, input);

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

export type OrderLineInput = PriceInput & {
  /** SKU:n, för att hitta produktens tak. `null` ger `defaultMaxPercent`. */
  sku?: string | null;
};

export type OrderLineResult = PriceResult & {
  sku: string | null;
  /** Taket som gällde för raden. */
  capPercent: number;
  /** Sant när taket höll tillbaka trappstegets rabatt. */
  capApplied: boolean;
};

export type OrderResult = {
  lines: OrderLineResult[];
  /** Summan av de rabattberättigade raderna till listpris — det trappan mäts mot. */
  eligibleListSubtotalMinor: number;
  /** Hela orderns värde till listpris, rabattberättigat eller ej. */
  listSubtotalMinor: number;
  /** Det ordern faktiskt kostar efter rabatt. */
  subtotalMinor: number;
  /** Trappsteget som ordervärdet landade på, innan produkttaken. */
  ladderPercent: number;
  /** Rabatten på hela ordern efter att taken hållit tillbaka enskilda rader. */
  effectiveDiscountPercent: number;
};

/**
 * Priset för en hel order.
 *
 * Det här är den enda vägen som räknar `orderValue` rätt. Ordningen är:
 *
 *   1. Summera de rabattberättigade radernas listpris. Bara MTO räknas in
 *      (om inte `appliesTo` är 'all'), av samma skäl som rabatten bara gäller
 *      dem — en lagerförd vara ska varken få rabatt eller hjälpa till att
 *      låsa upp den.
 *   2. Slå upp trappsteget för den summan.
 *   3. Sänk per rad till produktens tak. Taket kan bara sänka, aldrig höja.
 *
 * Övriga strategier faller tillbaka på `priceLine` per rad, så en anropsväg
 * kan använda `priceOrder` överallt utan att bry sig om vilken strategi som
 * är vald — vilket är precis vad korgen och kassan gör.
 */
export function priceOrder(config: PricingConfig, inputs: OrderLineInput[]): OrderResult {
  const eligibleFor = (input: OrderLineInput) => config.appliesTo === 'all' || (input.isMto ?? false);

  const listSubtotalMinor = inputs.reduce(
    (sum, input) => sum + input.listPriceMinor * effectiveQuantity(config, input),
    0
  );
  const eligibleListSubtotalMinor = inputs.reduce(
    (sum, input) =>
      eligibleFor(input) ? sum + input.listPriceMinor * effectiveQuantity(config, input) : sum,
    0
  );

  if (config.strategy !== 'orderValue') {
    const lines = inputs.map(input => ({
      ...priceLine(config, input),
      sku: input.sku ?? null,
      capPercent: 100,
      capApplied: false,
    }));
    const subtotalMinor = lines.reduce((sum, line) => sum + line.totalAmountMinor, 0);
    return {
      lines,
      eligibleListSubtotalMinor,
      listSubtotalMinor,
      subtotalMinor,
      ladderPercent: 0,
      effectiveDiscountPercent: percentOff(listSubtotalMinor, subtotalMinor),
    };
  }

  const ladderPercent = orderValueTierFor(config, eligibleListSubtotalMinor)?.discountPercent ?? 0;

  const lines = inputs.map((input): OrderLineResult => {
    const quantity = effectiveQuantity(config, input);
    const capPercent = capPercentForSku(config, input.sku);
    const discountPercent = eligibleFor(input) ? Math.min(ladderPercent, capPercent) : 0;

    let unit = input.listPriceMinor * (1 - discountPercent / 100);
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
      sku: input.sku ?? null,
      capPercent,
      capApplied: eligibleFor(input) && capPercent < ladderPercent,
    };
  });

  const subtotalMinor = lines.reduce((sum, line) => sum + line.totalAmountMinor, 0);
  return {
    lines,
    eligibleListSubtotalMinor,
    listSubtotalMinor,
    subtotalMinor,
    ladderPercent,
    effectiveDiscountPercent: percentOff(listSubtotalMinor, subtotalMinor),
  };
}

function percentOff(listMinor: number, netMinor: number): number {
  if (listMinor <= 0) return 0;
  return ((listMinor - netMinor) / listMinor) * 100;
}

/**
 * Går konfigurationen att räkna på i webbläsaren?
 *
 * Marginallogiken behöver landad kostnad, och den får aldrig skickas ut till
 * klienten — inköpspriset är inte något en besökare ska kunna läsa ur sidans
 * HTML. Produktsidan skickar därför bara med konfigurationen när den är fri
 * från kostnadsberoenden, och visar annars listpriset utan volymförhandsvisning.
 *
 * `orderValue` stoppas av ett annat skäl: rabatten beror på hela orderns värde,
 * och produktsidan känner bara till en produkt. En trappa räknad på en enda rad
 * skulle visa en rabatt kassan inte tänker ge. Hellre bara listpris.
 *
 * Poängen är att en framtida inställning i /admin inte tyst ska kunna
 * återskapa just det fel den här modulen finns för att stänga: ett pris på
 * produktsidan som inte är det kassan tar.
 */
export function isClientComputable(config: PricingConfig): boolean {
  return (
    config.strategy !== 'margin' &&
    config.strategy !== 'orderValue' &&
    config.marginFloorPercent === null
  );
}
