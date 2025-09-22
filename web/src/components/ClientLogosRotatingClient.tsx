"use client";

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

type Logo = { src: string; alt: string };

type Transition = {
  slot: number;
  from: number;
  to: number;
  key: number;
};

const MAX_SLOTS = 8;
const STEP_MS = 3800;
const FADE_MS = 700;

function randInt(max: number) {
  return Math.floor(Math.random() * max);
}

export default function ClientLogosRotatingClient({ logos }: { logos: Logo[] }) {
  const logoCount = logos.length;

  const slotsCount = useMemo(() => {
    if (logoCount <= 1) return logoCount;
    return Math.max(1, Math.min(MAX_SLOTS, logoCount - 1));
  }, [logoCount]);

  const initialSlots = useMemo(() => {
    const divisor = Math.max(logoCount, 1);
    return Array.from({ length: slotsCount }, (_, index) => index % divisor);
  }, [logoCount, slotsCount]);

  const [slots, setSlots] = useState<number[]>(initialSlots);
  const [transition, setTransition] = useState<Transition | null>(null);

  useEffect(() => {
    setSlots(initialSlots);
    setTransition(null);
  }, [initialSlots]);

  const slotsRef = useRef(slots);
  const transitionRef = useRef<Transition | null>(transition);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    transitionRef.current = transition;
  }, [transition]);

  useEffect(() => {
    if (logoCount <= slotsCount) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeTransition = transitionRef.current;
      if (activeTransition) {
        return;
      }

      const currentSlots = slotsRef.current;
      if (!currentSlots.length) {
        return;
      }

      const slotIndex = randInt(slotsCount);
      const used = new Set(currentSlots);
      const available: number[] = [];
      for (let i = 0; i < logoCount; i += 1) {
        if (!used.has(i)) {
          available.push(i);
        }
      }

      if (!available.length) {
        return;
      }

      const nextLogoIndex = available[randInt(available.length)];
      const fromIndex = currentSlots[slotIndex] ?? currentSlots[0] ?? 0;

      const nextTransition: Transition = {
        slot: slotIndex,
        from: fromIndex,
        to: nextLogoIndex,
        key: Math.random(),
      };

      transitionRef.current = nextTransition;
      setTransition(nextTransition);

      window.setTimeout(() => {
        setSlots((prev) => {
          if (transitionRef.current?.key !== nextTransition.key) {
            return prev;
          }

          const updated = [...prev];
          updated[nextTransition.slot] = nextTransition.to;
          return updated;
        });

        if (transitionRef.current?.key === nextTransition.key) {
          transitionRef.current = null;
          setTransition(null);
        }
      }, FADE_MS);
    }, STEP_MS);

    return () => {
      window.clearInterval(intervalId);
      transitionRef.current = null;
      setTransition(null);
    };
  }, [logoCount, slotsCount]);

  if (logoCount === 0 || slotsCount === 0) {
    return null;
  }

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: slotsCount }).map((_, slotIndex) => {
            const currentIndex = slots[slotIndex] ?? (slotIndex % logoCount);
            const isTransitioning = transition?.slot === slotIndex;
            const fromIndex = isTransitioning ? transition.from : currentIndex;
            const toIndex = isTransitioning ? transition.to : currentIndex;

            const fromLogo = logos[fromIndex];
            const toLogo = logos[toIndex];

            return (
              <div
                key={`client-logo-${slotIndex}`}
                className="relative aspect-square rounded-lg border border-black/10 bg-white"
              >
                {fromLogo && (
                  <div
                    className={`absolute inset-0 grid place-items-center transition-opacity ${
                      isTransitioning ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                  >
                    <div className="relative h-[72%] w-[72%]">
                      <Image
                        src={fromLogo.src}
                        alt={fromLogo.alt}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 22vw"
                      />
                    </div>
                  </div>
                )}

                {toLogo && (
                  <div
                    className={`absolute inset-0 grid place-items-center transition-opacity ${
                      isTransitioning ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                  >
                    <div className="relative h-[72%] w-[72%]">
                      <Image
                        src={toLogo.src}
                        alt={toLogo.alt}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 22vw"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
