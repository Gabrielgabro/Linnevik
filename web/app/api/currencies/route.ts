import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toShopifyLanguage, DEFAULT_LANGUAGE } from '@/lib/languageConfig';
import { storefrontFetch } from '@/lib/shopify';

type ShopifyCountry = {
  isoCode: string;
  name: string;
  currency: { isoCode: string } | null;
};

type LocalizationResponse = {
  localization: {
    country: { isoCode: string; currency: { isoCode: string } | null } | null;
    availableCountries: ShopifyCountry[] | null;
  } | null;
};

export async function GET() {
  try {
    const data = await storefrontFetch<LocalizationResponse>({
      query: `
        query Local($language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
          localization {
            country { isoCode currency { isoCode } }
            availableCountries { isoCode name currency { isoCode } }
          }
        }
      `,
      variables: {},
      language: toShopifyLanguage(DEFAULT_LANGUAGE),
    });

    const localization = data.localization;
    const cookieStore = await cookies();
    const cookieCountry = cookieStore.get('SHOP_COUNTRY')?.value || null;
    const selectedCountry = cookieCountry || localization?.country?.isoCode || null;
    const countries =
      localization?.availableCountries?.map((c) => ({
        isoCode: c.isoCode,
        name: c.name,
        currency: c.currency?.isoCode || 'N/A',
      })) || [];

    return NextResponse.json({
      selectedCountry,
      countries,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load currencies' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const country: string | undefined = body?.country;
    if (!country || typeof country !== 'string' || country.length !== 2) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }
    const cookieStore = await cookies();
    cookieStore.set('SHOP_COUNTRY', country.toUpperCase(), {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to set currency' }, { status: 500 });
  }
}
