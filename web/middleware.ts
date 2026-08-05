import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './src/lib/languageConfig';
import { ADMIN_COOKIE, verifySessionValue } from './src/lib/adminAuth';

const locales = SUPPORTED_LANGUAGES.map(l => l.code);

// Paths that should not be processed by the middleware
const excludedPaths = [
  '/api',
  '/_next',
  '/favicon.ico',
  '/public',
  '/brand',
  '/client_logo',
  '/Supporting_visuals',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.nextUrl.hostname === 'linnevik.se') {
    const destination = new URL(request.url);
    destination.hostname = 'www.linnevik.se';
    return NextResponse.redirect(destination, 308);
  }

  // The admin area has no locale prefix. Bounce /sv/admin and /en/admin back to
  // /admin so a stale bookmark or an autocompleted URL doesn't dead-end in a 404.
  const localisedAdmin = locales
    .map(locale => `/${locale}/admin`)
    .find(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (localisedAdmin) {
    const target = new URL(pathname.slice(localisedAdmin.length - '/admin'.length), request.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }

  // The admin area is internal: no locale prefix, and gated on its own session.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }
    const session = request.cookies.get(ADMIN_COOKIE)?.value;
    if (await verifySessionValue(session)) {
      return NextResponse.next();
    }
    const login = new URL('/admin/login', request.url);
    if (pathname !== '/admin') {
      login.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(login);
  }

  // Skip middleware for excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check if pathname already has a locale
  const pathnameLocale = locales.find(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameLocale) {
    // Pass locale to the root layout so the server-rendered document can declare
    // the correct html lang value. Keep the cookie for URL-independent actions.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-linnevik-locale', pathnameLocale);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set('NEXT_LOCALE', pathnameLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
    return response;
  }

  // Redirect to default locale if no locale in URL
  const locale = DEFAULT_LANGUAGE;
  const response = NextResponse.redirect(
    new URL(`/${locale}${pathname}`, request.url)
  , 308);
  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
