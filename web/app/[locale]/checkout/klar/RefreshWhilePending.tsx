'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const INTERVAL_MS = 3_000;
/** Två minuter. Därefter kommer beskedet per e-post. */
const MAX_TRIES = 40;

/**
 * Läser om sidan medan kortbetalningen väntar på Stripes besked (§6.4).
 * Servern avgör läget varje gång. När betalningen har kommit in renderas
 * sidan utan den här komponenten, och uppdateringen slutar.
 */
export default function RefreshWhilePending({ slowText }: { slowText: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= MAX_TRIES) return;
    const timer = setTimeout(() => {
      router.refresh();
      setTries(count => count + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [router, tries]);

  if (tries < MAX_TRIES) return null;
  return <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{slowText}</p>;
}
