import { NextRequest, NextResponse } from 'next/server';
import { requestMagicLink } from '@/lib/magicLink';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';

export const runtime = 'nodejs';

function clientIp(request: NextRequest): string | null {
  // Vercel sätter x-forwarded-for; första adressen i listan är klienten.
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || null;
}

/**
 * Begär en inloggningslänk. Svarar alltid `{ ok: true }` — oavsett om
 * adressen finns som kund, är ratbegränsad, eller SMTP råkar vara nere — så
 * att svaret aldrig kan användas för att lista ut vilka e-postadresser som är
 * registrerade kunder. Se lib/magicLink.ts för den logiken.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const localeInput = typeof body?.locale === 'string' ? body.locale : '';
  const locale: Language = isSupportedLanguage(localeInput) ? localeInput : DEFAULT_LANGUAGE;

  if (!email) {
    return NextResponse.json({ error: 'E-postadress krävs.' }, { status: 400 });
  }

  await requestMagicLink({
    email,
    locale,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}
