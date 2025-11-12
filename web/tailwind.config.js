/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                base: 'var(--background)',
                ink: 'var(--foreground)',
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