import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/rateLimit';
import {
  ADMIN_COOKIE,
  readSessionValue,
  adminAuthConfigured,
  createSessionValue,
  isAdminUser,
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
  let user: unknown;
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
    user = body?.user;
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Välj vem du är.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Fyll i lösenordet.' }, { status: 400 });
  }

  // Lösenordet är delat och /admin kan återbetala pengar. Fördröjningen nedan
  // bromsar en gissning i taget; den här stoppar den som gissar i tusental.
  // Räknas per IP och inte per namn: namnet väljer den som loggar in själv.
  //
  // Hinken *läses* här och räknas upp först när lösenordet visade sig vara
  // fel. Räknades varje försök tärde de som kan lösenordet på samma budget
  // som den som gissar, och ett kontor där alla loggar in på morgonen kunde
  // låsa ut sig självt i en kvart.
  const identity = clientIp(request.headers);
  const bucket = { scope: 'admin_login', identity, limit: 10, windowSeconds: 15 * 60 };
  const limit = await peekRateLimit(bucket);
  if (!limit.allowed) {
    await record(user, 'admin.login_blocked');
    return NextResponse.json(
      {
        error: `För många försök. Försök igen om ${Math.ceil(limit.retryAfterSeconds / 60)} minuter.`,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!(await verifyPassword(password))) {
    await checkRateLimit(bucket);
    // Bromsa gissningar en aning utan att låsa ute någon.
    await new Promise(resolve => setTimeout(resolve, 600));
    await record(user, 'admin.login_failed');
    return NextResponse.json({ error: 'Fel lösenord.' }, { status: 401 });
  }

  const { value, maxAge } = await createSessionValue(user);
  await record(user, 'admin.login');
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, value, { ...sessionCookieOptions, maxAge });
  return response;
}

/** Logga ut. */
export async function DELETE(request: NextRequest) {
  const user = await readSessionValue(request.cookies.get(ADMIN_COOKIE)?.value);
  if (user) await record(user, 'admin.logout');

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
