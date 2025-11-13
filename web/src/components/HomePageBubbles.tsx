'use client';

import { usePathname } from 'next/navigation';

export default function HomePageBubbles() {
  const pathname = usePathname();

  // Only show bubbles on homepage
  if (pathname !== '/') return null;

  return (
    <>
      {/* Subtle top-right beige accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-0 top-0 -z-10 h-[50vh] w-[45vw] transform-gpu blur-[100px] opacity-40
                   bg-[radial-gradient(circle_at_80%_20%,var(--brand-beige-900),transparent_60%)]" />

      {/* Soft top-left blue glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-[10vh] -z-10 h-[40vh] w-[40vw] transform-gpu blur-[90px] opacity-25
                   bg-[radial-gradient(circle_at_20%_40%,var(--brand-misty-fjord-blue),transparent_65%)]" />

      {/* Mid-page beige accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[5vw] top-[45vh] -z-10 h-[35vw] w-[35vw] transform-gpu blur-[80px] opacity-35
                   bg-[radial-gradient(circle_at_center,var(--brand-beige-900),transparent_55%)]" />

      {/* Bottom-left subtle blue */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[10vw] bottom-[5vh] -z-10 h-[30vw] w-[30vw] transform-gpu blur-[80px] opacity-20
                   bg-[radial-gradient(circle_at_center,var(--brand-misty-fjord-blue),transparent_60%)]" />
    </>
  );
}
