'use client';

import { useEffect } from 'react';

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
