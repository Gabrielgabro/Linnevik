/**
 * De rena reglerna kring en betald order.
 *
 * Ligger för sig och inte i ordersDb.ts av ett skäl: allt i den filen drar in
 * databasdrivrutinen, och de här besluten — är beloppet fel, vad betyder den
 * här tviststatusen — går att pröva utan vare sig databas eller Stripe. Det
 * som går att testa billigt ska vara testat, och just de här reglerna avgör
 * om riktiga pengar hamnar rätt.
 */

/**
 * Hur stort glapp mellan vårt framräknade belopp och Stripes debitering som
 * får passera utan att någon behöver titta. En krona räcker för avrundning
 * mellan vår momsberäkning och Stripes; större skillnader betyder att något
 * ändrats medan kassan stod öppen — ett pris, en rabatt, en fraktregel.
 */
export const AMOUNT_DRIFT_TOLERANCE_MINOR = 100;

export function amountDrifted(expectedMinor: number, chargedMinor: number): boolean {
  return Math.abs(chargedMinor - expectedMinor) > AMOUNT_DRIFT_TOLERANCE_MINOR;
}

export type DisputeOutcome = {
  /** Sant när tvisten är avgjord och inget svar längre kan lämnas. */
  closed: boolean;
  /** Sant när beloppet gick förlorat. */
  lost: boolean;
  /** Vad orderns status ska vara efteråt. */
  orderStatus: 'disputed' | 'paid' | 'refunded';
};

/**
 * Stripes tviststatusar, översatta till vad ordern ska stå på.
 *
 * De fyra öppna lägena — inklusive de två `warning_*`, som är en tidig
 * varning från kortnätverket innan tvisten formellt öppnats — betyder att
 * någon fortfarande kan lämna underlag. Allt annat är avgjort: `lost` och
 * `charge_refunded` innebär att pengarna är borta, `won` och
 * `warning_closed` att de är kvar.
 *
 * Okända statusar behandlas som avgjorda men inte förlorade: en framtida
 * status ska hellre lämna ordern som betald än tyst påstå att vi förlorat
 * pengar vi fortfarande har.
 */
export function disputeOutcome(status: string): DisputeOutcome {
  const open =
    status === 'needs_response' ||
    status === 'under_review' ||
    status === 'warning_needs_response' ||
    status === 'warning_under_review';
  if (open) return { closed: false, lost: false, orderStatus: 'disputed' };

  const lost = status === 'lost' || status === 'charge_refunded';
  return { closed: true, lost, orderStatus: lost ? 'refunded' : 'paid' };
}
