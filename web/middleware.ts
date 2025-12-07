import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './src/lib/languageConfig';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check if pathname already has a locale
  const pathnameHasLocale = locales.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // Redirect to default locale if no locale in URL
  const locale = DEFAULT_LANGUAGE;
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
