import { Config } from 'tailwindcss'
const config: Config = {
    content: [
        './src/**/*.{js,ts,jsx,tsx}',
        './src/app/**/*.{js,ts,jsx,tsx}',
        './src/pages/**/*.{js,ts,jsx,tsx}',
        './index.html',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "oklch(var(--primary))",
                    foreground: "oklch(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "oklch(var(--secondary))",
                    foreground: "oklch(var(--secondary-foreground))",
                },
            },
        },
    },
    plugins: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("tailwindcss-animate")
    ],
};

export default config
