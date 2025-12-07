'use client';

import Link, { type LinkProps } from 'next/link';
import { useLocale } from '@/contexts/LocaleContext';
import type { ComponentProps } from 'react';

type LocaleLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

/**
 * A wrapper around Next.js Link that automatically prepends the current locale
 * Usage: <LocaleLink href="/about">About</LocaleLink>
 * Renders: <Link href="/sv/about"> or <Link href="/en/about">
 */
export function LocaleLink({ href, ...props }: LocaleLinkProps) {
  const { locale } = useLocale();

  // Don't prepend locale for external links or anchors
  const isExternal = href.startsWith('http') || href.startsWith('//');
  const isAnchor = href.startsWith('#');

  const localizedHref = isExternal || isAnchor ? href : `/${locale}${href}`;

  return <Link href={localizedHref} {...props} />;
}
