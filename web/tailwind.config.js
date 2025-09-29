/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                base: 'var(--background)',
                ink: 'var(--foreground)',
                // accent: 'var(--color-accent)', // lägg till om du har en accent-variabel
            },
            fontFamily: {
                sans: 'var(--font-geist-sans), system-ui, sans-serif',
                mono: 'var(--font-geist-mono), ui-monospace, monospace',
            },
        },
    },
    plugins: [],
};