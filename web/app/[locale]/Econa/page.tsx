'use client';

import { useEffect, useState } from 'react';

const MIN_WIDTH = 600; // px — devices below this (phones) are blocked

// noindex meta tag added directly in the head to prevent search engine indexing
function useNoIndex() {
    useEffect(() => {
        const meta = document.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex, nofollow';
        document.head.appendChild(meta);
        return () => {
            document.head.removeChild(meta);
        };
    }, []);
}

export default function EconaPage() {
    useNoIndex();

    const [isAllowedDevice, setIsAllowedDevice] = useState<boolean | null>(null);
    
    useEffect(() => {
        const check = () => setIsAllowedDevice(window.innerWidth >= MIN_WIDTH);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Hide header, footer, and other site chrome on this page
    useEffect(() => {
        const selectors = ['header', 'footer', '[data-cookie-banner]', '[data-region-modal]'];
        const hidden: HTMLElement[] = [];

        selectors.forEach((sel) => {
            document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
                el.style.display = 'none';
                hidden.push(el);
            });
        });

        return () => {
            hidden.forEach((el) => {
                el.style.display = '';
            });
        };
    }, []);
    useEffect(() => {
        // Disable right-click on the entire page
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        // Disable common keyboard shortcuts for saving/printing
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                (e.ctrlKey || e.metaKey) &&
                (e.key === 's' || e.key === 'p' || e.key === 'S' || e.key === 'P')
            ) {
                e.preventDefault();
                return false;
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Still measuring — render nothing to avoid a flash
    if (isAllowedDevice === null) return null;

    // Phone — show a friendly block screen
    if (!isAllowedDevice) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    padding: '2rem',
                    textAlign: 'center',
                    background: '#f9f9f9',
                    color: '#333',
                    fontFamily: 'sans-serif',
                }}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#888"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginBottom: '1.5rem' }}
                >
                    {/* Monitor icon */}
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                    {/* Tablet icon - slightly overlapping/offset */}
                    <rect x="14" y="10" width="8" height="12" rx="1" fill="#f9f9f9" />
                    <circle cx="18" cy="20" r="0.5" fill="#888" />
                </svg>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    Larger screen required
                </h1>
                <p style={{ fontSize: '1rem', lineHeight: 1.6, maxWidth: '320px', color: '#555' }}>
                    This page is optimized for larger screens. Please open it on a tablet, laptop,
                    or desktop computer.
                </p>
            </div>
        );
    }

    return (

        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100vh',
                overflow: 'hidden',
                userSelect: 'none',
                WebkitUserSelect: 'none',
            }}
        >
            {/* PDF iframe — toolbar hidden via URL fragment */}
            <iframe
                src="/api/pdf/econa#toolbar=0&navpanes=0&scrollbar=1&view=FitH"
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                }}
                title="Econa PDF"
            />

            {/* Transparent overlay to block right-click / interaction with PDF toolbar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '60px', // covers top toolbar area
                    zIndex: 10,
                    cursor: 'default',
                }}
            />

            {/* Bottom overlay to block bottom toolbar */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '50px',
                    zIndex: 10,
                    cursor: 'default',
                }}
            />
        </div>
    );
}
