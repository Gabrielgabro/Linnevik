"use client";
import Image from 'next/image';
import { useEffect, useState } from 'react';

type Logo = { src: string; alt: string };

// Timing constants
const DISPLAY_DURATION = 3000; // 3 seconds showing logo
const FADE_OUT_DURATION = 800; // Calm fade out
const FADE_IN_DURATION = 800; // Calm fade in
const PAUSE_BETWEEN = 1000; // 1 second pause after fade in complete

// Animation states
type AnimationState = 'stable' | 'fading-out' | 'fading-in';


export default function ClientLogosRotatingClient({
    lightLogos,
    darkLogos
}: {
    lightLogos: Logo[];
    darkLogos: Logo[];
}) {
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

    // Initialize: first m logos visible, last 2 hidden
    const [visibleIndices, setVisibleIndices] = useState<number[]>([]);
    const [hiddenIndices, setHiddenIndices] = useState<number[]>([]);

    const [animatingSlot, setAnimatingSlot] = useState<number | null>(null);
    const [animationState, setAnimationState] = useState<AnimationState>('stable');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [nextLogoIndex, setNextLogoIndex] = useState<number | null>(null);

    // Reset indices when logos change (e.g., dark mode toggle)
    useEffect(() => {
        setVisibleIndices(Array.from({ length: visibleCount }, (_, i) => i));
        setHiddenIndices(Array.from({ length: totalLogos - visibleCount }, (_, i) => i + visibleCount));
        setAnimatingSlot(null);
        setAnimationState('stable');
        setNextLogoIndex(null);
    }, [logos, totalLogos, visibleCount]);

    useEffect(() => {
        // Don't animate if we don't have enough logos to rotate
        if (totalLogos <= visibleCount) {
            return;
        }

        let timeoutId: NodeJS.Timeout;

        const startRotationCycle = () => {
            // 1. Pick a random visible slot to replace
            const randomSlot = Math.floor(Math.random() * visibleCount);
            const logoToReplace = visibleIndices[randomSlot];

            // 2. Pick a random hidden logo to show
            const randomHiddenIndex = Math.floor(Math.random() * hiddenIndices.length);
            const logoToShow = hiddenIndices[randomHiddenIndex];

            setAnimatingSlot(randomSlot);
            setNextLogoIndex(logoToShow);

            // 3. Start fade out
            setAnimationState('fading-out');

            // 4. After fade out completes, swap logos and start fade in
            timeoutId = setTimeout(() => {
                // Swap the logos in state
                setVisibleIndices(prev => {
                    const newVisible = [...prev];
                    newVisible[randomSlot] = logoToShow;
                    return newVisible;
                });

                setHiddenIndices(prev => {
                    const newHidden = [...prev];
                    newHidden[randomHiddenIndex] = logoToReplace;
                    return newHidden;
                });

                // Start fade in
                setAnimationState('fading-in');

                // 5. After fade in completes, pause, then schedule next cycle
                timeoutId = setTimeout(() => {
                    setAnimationState('stable');
                    setAnimatingSlot(null);
                    setNextLogoIndex(null);

                    // 6. Pause before next rotation
                    timeoutId = setTimeout(() => {
                        startRotationCycle();
                    }, PAUSE_BETWEEN);

                }, FADE_IN_DURATION);

            }, FADE_OUT_DURATION);
        };

        // Start first cycle after initial display duration
        timeoutId = setTimeout(() => {
            startRotationCycle();
        }, DISPLAY_DURATION);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [totalLogos, visibleCount, visibleIndices, hiddenIndices]);

    if (totalLogos === 0) {
        return null;
    }

    return (
        <section className="py-16">
            <div className="mx-auto max-w-6xl px-6">
                <h2 className="text-center text-sm font-semibold text-secondary uppercase tracking-wider mb-12">
                    Referenser
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                    {visibleIndices.map((logoIndex, slotIndex) => {
                        const logo = logos[logoIndex];

                        // Safety check: skip if logo doesn't exist
                        if (!logo) return null;

                        const isAnimating = animatingSlot === slotIndex;

                        // Calculate opacity based on animation state
                        let opacity = 1;
                        if (isAnimating) {
                            if (animationState === 'fading-out') {
                                opacity = 0;
                            } else if (animationState === 'fading-in') {
                                opacity = 1;
                            }
                        }

                        return (
                            <div
                                key={`slot-${slotIndex}`}
                                className="relative aspect-square flex items-center justify-center"
                            >
                                <div
                                    className="relative w-full h-full transition-opacity ease-in-out"
                                    style={{
                                        opacity,
                                        transitionDuration: animationState === 'fading-out'
                                            ? `${FADE_OUT_DURATION}ms`
                                            : animationState === 'fading-in'
                                            ? `${FADE_IN_DURATION}ms`
                                            : '0ms'
                                    }}
                                >
                                    <Image
                                        src={logo.src}
                                        alt={logo.alt}
                                        fill
                                        className="object-contain"
                                        sizes="(max-width: 640px) 50vw, 25vw"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}