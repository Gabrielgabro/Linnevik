import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SWEDEN = { isoCode: 'SE', name: 'Sweden', currency: 'SEK' };

export async function GET() {
  return NextResponse.json({ selectedCountry: 'SE', countries: [SWEDEN] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body?.country !== 'SE') {
    return NextResponse.json({ error: 'Only Sweden is supported.' }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set('SHOP_COUNTRY', 'SE', {
    path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
  });
  return NextResponse.json({ ok: true });
}
