import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type Language,
} from './languageConfig';

/** Rubriken proxyn sätter när adressen redan bär ett språk. */
export const LOCALE_HEADER = 'x-linnevik-locale';

/**
 * Språket för det här anropet, sett från servern.
 *
 * Adressen går före kakan. En besökare som kommer rakt in på `/en/...` — från
 * en länk, en sökträff, ett mejl — har ingen `NEXT_LOCALE` att läsa, eftersom
 * proxyn bara sätter kakan när den själv omdirigerar till standardspråket. Då
 * fick hen ett engelskt gränssnitt men svenska serverfel, svenska magiska
 * länkar och en svensk Stripe-kassa. Proxyn skickar med språket från adressen
 * i en rubrik; kakan finns kvar för de anrop som ligger utanför proxyn (allt
 * under `/api`), och där får klienten skicka samma rubrik själv.
 */
export async function getServerLanguage(): Promise<Language> {
  const fromPath = (await headers()).get(LOCALE_HEADER);
  if (isSupportedLanguage(fromPath)) return fromPath;

  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value;

  if (isSupportedLanguage(locale)) {
    return locale;
  }

  return DEFAULT_LANGUAGE;
}

export type { Language };
