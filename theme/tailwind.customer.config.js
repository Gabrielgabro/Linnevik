module.exports = {
    content: ['./templates/customers/**/*.liquid'],
    theme: {
        extend: {
            colors: {
                base: 'var(--color-base)',
                accent: 'var(--color-accent)',
                ink: 'var(--color-ink)',
            },
            fontFamily: {
                sans: 'var(--font-sans)',
                head: 'var(--font-head)',
            },
        },
    },
    corePlugins: { preflight: false },
};