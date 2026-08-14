/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                base: 'var(--background)',
                // Adminvyn (.admin-viz). Alla värden går via tokens i globals.css
                // så att mörkt läge fungerar utan en enda dark:-klass.
                ink: {
                    DEFAULT: 'var(--viz-ink)',
                    2: 'var(--viz-ink-2)',
                    3: 'var(--viz-ink-3)',
                },
                surface: 'var(--viz-surface)',
                plane: 'var(--viz-plane)',
                rule: 'var(--viz-rule)',
                grid: 'var(--viz-grid)',
                brand: {
                    DEFAULT: 'var(--adm-brand)',
                    hover: 'var(--adm-brand-hover)',
                    soft: 'var(--adm-brand-soft)',
                    fg: 'var(--adm-on-brand)',
                    // Läsbar grön text/länkfärg i båda lägena.
                    text: 'var(--adm-brand-text)',
                },
                ok: 'var(--adm-ok)',
                warn: 'var(--adm-warn)',
                danger: 'var(--adm-danger)',
                info: 'var(--adm-info)',
            },
            borderRadius: {
                card: 'var(--adm-r)',
                ctl: 'var(--adm-r-sm)',
                lg2: 'var(--adm-r-lg)',
            },
            boxShadow: {
                card: 'var(--adm-shadow-1)',
                pop: 'var(--adm-shadow-2)',
            },
            fontFamily: {
                heading: 'var(--font-heading), Georgia, serif',
                body: 'var(--font-body), system-ui, sans-serif',
                sans: 'var(--font-body), system-ui, sans-serif',
                serif: 'var(--font-heading), Georgia, serif',
            },
        },
    },
    plugins: [],
};