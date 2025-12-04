"use client";
import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

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
    const [animatingSlot, setAnimatingSlot] = useState<number | null>(null);
    const [animationState, setAnimationState] = useState<AnimationState>('stable');
    const [imagesPreloaded, setImagesPreloaded] = useState(false);

    // Refs to track current indices without triggering effect re-runs
    const visibleRef = useRef<number[]>([]);
    const hiddenRef = useRef<number[]>([]);

    // Preload all logos on mount to prevent initial animation sluggishness
    useEffect(() => {
        if (logos.length === 0) {
            setImagesPreloaded(true);
            return;
        }

        let cancelled = false;

        const preloadImages = async () => {
            const preloadPromises = logos.map((logo) => {
                return new Promise<void>((resolve) => {
                    const img = new window.Image();
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // Resolve anyway to not block
                    img.src = logo.src;
                });
            });

            await Promise.all(preloadPromises);

            if (!cancelled) {
                setImagesPreloaded(true);
            }
        };

        preloadImages();

        return () => {
            cancelled = true;
        };
    }, [logos]);

    // Reset indices when logos change (e.g., dark mode toggle)
    useEffect(() => {
        const initialVisible = Array.from({ length: visibleCount }, (_, i) => i);
        const initialHidden = Array.from({ length: totalLogos - visibleCount }, (_, i) => i + visibleCount);

        visibleRef.current = initialVisible;
        hiddenRef.current = initialHidden;

        setVisibleIndices(initialVisible);
        setAnimatingSlot(null);
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

        setAnimatingSlot(randomSlot);
        setAnimationState('fading-out');

        // 3. After fade out, swap and fade in
        setTimeout(() => {
            // Update refs
            const newVisible = [...currentVisible];
            newVisible[randomSlot] = logoToShow;
            visibleRef.current = newVisible;

            const newHidden = [...currentHidden];
            newHidden[randomHiddenIndex] = logoToReplace;
            hiddenRef.current = newHidden;

            // Update render state
            setVisibleIndices(newVisible);
            setAnimationState('fading-in');

            // 4. After fade in, reset and schedule next
            setTimeout(() => {
                setAnimationState('stable');
                setAnimatingSlot(null);

                // 5. Pause then rotate again
                setTimeout(() => {
                    performRotation();
                }, PAUSE_BETWEEN);

            }, FADE_IN_DURATION);

        }, FADE_OUT_DURATION);
    }, []);

    // Start rotation only after images are preloaded
    useEffect(() => {
        if (!imagesPreloaded || totalLogos <= visibleCount) {
            return;
        }

        const timeoutId = setTimeout(() => {
            performRotation();
        }, DISPLAY_DURATION);

        return () => {
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imagesPreloaded]);

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
