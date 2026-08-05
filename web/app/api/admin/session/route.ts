import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  adminAuthConfigured,
  createSessionValue,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/adminAuth';

export const runtime = 'nodejs';

/** Logga in: växlar lösenordet mot en signerad sessionskaka. */
export async function POST(request: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
      { error: 'Adminspärren är inte konfigurerad. ADMIN_PASSWORD och ADMIN_SESSION_SECRET saknas.' },
      { status: 503 }
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Fyll i lösenordet.' }, { status: 400 });
  }

  if (!(await verifyPassword(password))) {
    // Bromsa gissningar en aning utan att låsa ute någon.
    await new Promise(resolve => setTimeout(resolve, 600));
    return NextResponse.json({ error: 'Fel lösenord.' }, { status: 401 });
  }

  const { value, maxAge } = await createSessionValue();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, value, { ...sessionCookieOptions, maxAge });
  return response;
}

/** Logga ut. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
