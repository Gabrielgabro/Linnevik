'use client';

import { usePathname } from 'next/navigation';

export default function HomePageBubbles() {
  const pathname = usePathname();

  // Only show bubbles on homepage
  if (pathname !== '/') return null;

  return (
    <>
      {/* Top canopy (covers header + hero) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] sm:h-[80vh] transform-gpu blur-3xl opacity-30
                   bg-[radial-gradient(120rem_60rem_at_50%_-10%,var(--brand-misty-fjord-blue),transparent_70%),radial-gradient(110rem_60rem_at_90%_5%,var(--brand-beige-900),transparent_65%)]" />

      {/* Mid-right accent - beige */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -right-[25vw] top-[38vh] -z-10 h-[55vw] w-[55vw] transform-gpu blur-3xl opacity-25
                   bg-[radial-gradient(60vw_40vw_at_100%_50%,var(--brand-beige-900),transparent_70%)]" />

      {/* Bottom-left glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-[20vw] bottom-[-10vh] -z-10 h-[45vw] w-[65vw] transform-gpu blur-3xl opacity-25
                   bg-[radial-gradient(70vw_40vw_at_0%_100%,var(--brand-misty-fjord-blue),transparent_70%)]" />
    </>
  );
}
