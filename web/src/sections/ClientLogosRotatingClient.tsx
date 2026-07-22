"use client";
import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from '@/contexts/LocaleContext';

type Logo = { src: string; alt: string };

// Timing constants
const DISPLAY_DURATION = 3000; // 3 seconds showing logo
const FADE_OUT_DURATION = 800; // Calm fade out
const FADE_IN_DURATION = 800; // Calm fade in
const PAUSE_BETWEEN = 1000; // 1 second pause after fade in complete
const INCOMING_LOAD_TIMEOUT = 5000; // Failsafe so a hung image request can't stall the rotation

// Animation states
type AnimationState = 'stable' | 'fading-out' | 'fading-in';
type Swap = { slot: number; incomingIndex: number };


export default function ClientLogosRotatingClient({
    lightLogos,
    darkLogos
}: {
    lightLogos: Logo[];
    darkLogos: Logo[];
}) {
    const { t } = useTranslation();
    // Detect dark mode using prefers-color-scheme media query
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        // Check if prefers-color-scheme is supported
        if (typeof window === 'undefined' || !window.matchMedia) {
            return;
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Set initial state
        setIsDarkMode(mediaQuery.matches);

        // Listen for changes
        const handleChange = (e: MediaQueryListEvent) => {
            setIsDarkMode(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);

        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);

    // Use dark logos if available and in dark mode, otherwise use light logos
    const logos = (isDarkMode && darkLogos.length > 0) ? darkLogos : lightLogos;
    const totalLogos = logos.length;

    // Always show 4 logos horizontally
    const visibleCount = Math.min(4, totalLogos);

    // State for rendering
    const [visibleIndices, setVisibleIndices] = useState<number[]>([]);
    const [swap, setSwap] = useState<Swap | null>(null);
    const [animationState, setAnimationState] = useState<AnimationState>('stable');

    // Refs to track current indices without triggering effect re-runs
    const visibleRef = useRef<number[]>([]);
    const hiddenRef = useRef<number[]>([]);
    // Called by the incoming image's onLoad/onError; rebound on every rotation
    const incomingReadyRef = useRef<(() => void) | null>(null);

    // Reset indices when logos change (e.g., dark mode toggle)
    useEffect(() => {
        const initialVisible = Array.from({ length: visibleCount }, (_, i) => i);
        const initialHidden = Array.from({ length: totalLogos - visibleCount }, (_, i) => i + visibleCount);

        visibleRef.current = initialVisible;
        hiddenRef.current = initialHidden;

        setVisibleIndices(initialVisible);
        setSwap(null);
        setAnimationState('stable');
    }, [logos, totalLogos, visibleCount]);

    // Stable rotation function using refs
    const performRotation = useCallback(() => {
        const currentVisible = visibleRef.current;
        const currentHidden = hiddenRef.current;

        if (currentHidden.length === 0) return;

        // 1. Pick a random visible slot to replace
        const randomSlot = Math.floor(Math.random() * currentVisible.length);
        const logoToReplace = currentVisible[randomSlot];

        // 2. Pick a random hidden logo to show
        const randomHiddenIndex = Math.floor(Math.random() * currentHidden.length);
        const logoToShow = currentHidden[randomHiddenIndex];

        // 3. Mount the incoming logo invisibly so it loads during the fade out,
        //    and start fading the old logo out
        setSwap({ slot: randomSlot, incomingIndex: logoToShow });
        setAnimationState('fading-out');

        // 4. Fade in only once the fade out is done AND the incoming image has
        //    loaded — starting earlier paints the old bitmap and hard-swaps it mid-fade
        let fadeOutDone = false;
        let incomingReady = false;
        let fadeInStarted = false;

        const tryStartFadeIn = () => {
            if (fadeInStarted || !fadeOutDone || !incomingReady) return;
            fadeInStarted = true;

            setAnimationState('fading-in');

            // 5. After fade in, commit the swap and schedule the next rotation
            setTimeout(() => {
                const newVisible = [...currentVisible];
                newVisible[randomSlot] = logoToShow;
                visibleRef.current = newVisible;

                const newHidden = [...currentHidden];
                newHidden[randomHiddenIndex] = logoToReplace;
                hiddenRef.current = newHidden;

                setVisibleIndices(newVisible);
                setSwap(null);
                setAnimationState('stable');

                setTimeout(() => {
                    performRotation();
                }, PAUSE_BETWEEN);
            }, FADE_IN_DURATION);
        };

        const markIncomingReady = () => {
            incomingReady = true;
            tryStartFadeIn();
        };

        incomingReadyRef.current = markIncomingReady;

        setTimeout(() => {
            fadeOutDone = true;
            tryStartFadeIn();
        }, FADE_OUT_DURATION);

        setTimeout(markIncomingReady, INCOMING_LOAD_TIMEOUT);
    }, []);

    // Start rotation after the initial display period
    useEffect(() => {
        if (totalLogos <= visibleCount) {
            return;
        }

        const timeoutId = setTimeout(() => {
            performRotation();
        }, DISPLAY_DURATION);

        return () => {
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (totalLogos === 0) {
        return null;
    }


    return (
        <section className="py-16">
            <div className="mx-auto max-w-6xl px-6">
                <h2 className="text-center text-sm font-semibold text-secondary uppercase tracking-wider mb-12">
                    {t.ClientLogosRotatingClient.References}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                    {visibleIndices.map((logoIndex, slotIndex) => {
                        const isSwappingSlot = swap !== null && swap.slot === slotIndex;

                        // Current logo, plus the incoming one stacked on top during a swap.
                        // Entries are keyed by logo index so the incoming element is kept
                        // across the commit instead of changing src on a visible img.
                        const stack = [{ logoIndex, incoming: false }];
                        if (isSwappingSlot) {
                            stack.push({ logoIndex: swap.incomingIndex, incoming: true });
                        }

                        return (
                            <div
                                key={`slot-${slotIndex}`}
                                className="relative aspect-square flex items-center justify-center"
                            >
                                {stack.map(({ logoIndex: stackLogoIndex, incoming }) => {
                                    const logo = logos[stackLogoIndex];

                                    // Safety check: skip if logo doesn't exist
                                    if (!logo) return null;

                                    let opacity = 1;
                                    let duration = 0;
                                    if (incoming) {
                                        opacity = animationState === 'fading-in' ? 1 : 0;
                                        duration = animationState === 'fading-in' ? FADE_IN_DURATION : 0;
                                    } else if (isSwappingSlot) {
                                        opacity = 0;
                                        duration = animationState === 'fading-out' ? FADE_OUT_DURATION : 0;
                                    }

                                    return (
                                        <div
                                            key={`logo-${stackLogoIndex}`}
                                            className="absolute inset-0 transition-opacity ease-in-out"
                                            style={{
                                                opacity,
                                                transitionDuration: `${duration}ms`
                                            }}
                                        >
                                            <Image
                                                src={logo.src}
                                                alt={logo.alt}
                                                fill
                                                loading={incoming ? 'eager' : undefined}
                                                onLoad={incoming ? () => incomingReadyRef.current?.() : undefined}
                                                onError={incoming ? () => incomingReadyRef.current?.() : undefined}
                                                className="object-contain"
                                                sizes="(max-width: 640px) 50vw, 25vw"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
