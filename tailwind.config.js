/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Figtree', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        emerald: {
          50: '#EAF7F1', 100: '#E4F2ED', 200: '#B7D8CB', 300: '#8CBFAC',
          400: '#4AA586', 500: '#299672', 600: '#087F5B', 700: '#086447',
          800: '#05563E', 900: '#183B31', 950: '#0D2A22',
        },
        amber: {
          50: '#FBF3DF', 100: '#F6E8C6', 200: '#E8D19D', 300: '#D6B56D',
          400: '#C3953F', 500: '#B7791F', 600: '#996316', 700: '#805719',
          800: '#684818', 900: '#513915', 950: '#2F210C',
        },
        blue: {
          50: '#EAF2F8', 100: '#DAE8F2', 200: '#BDD4E5', 300: '#91B8D2',
          400: '#6498BD', 500: '#3976A8', 600: '#326993', 700: '#2D5E86',
          800: '#294E6D', 900: '#243F58', 950: '#152636',
        },
        rose: {
          50: '#FBEAEC', 100: '#F5D9DC', 200: '#E8BCC1', 300: '#D99199',
          400: '#CB6974', 500: '#C2414B', 600: '#AA3742', 700: '#92343D',
          800: '#772F36', 900: '#612A30', 950: '#37161A',
        },
        red: {
          50: '#FBEAEC', 100: '#F5D9DC', 200: '#E8BCC1', 300: '#D99199',
          400: '#CB6974', 500: '#C2414B', 600: '#AA3742', 700: '#92343D',
          800: '#772F36', 900: '#612A30', 950: '#37161A',
        },
        border: 'oklch(var(--border))',
        input: 'oklch(var(--input))',
        ring: 'oklch(var(--ring))',
        background: 'oklch(var(--background))',
        foreground: 'oklch(var(--foreground))',
        primary: {
          DEFAULT: 'oklch(var(--primary))',
          foreground: 'oklch(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary))',
          foreground: 'oklch(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive))',
          foreground: 'oklch(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted))',
          foreground: 'oklch(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent))',
          foreground: 'oklch(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover))',
          foreground: 'oklch(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'oklch(var(--card))',
          foreground: 'oklch(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar))',
          foreground: 'oklch(var(--sidebar-foreground))',
          primary: 'oklch(var(--sidebar-primary))',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground))',
          accent: 'oklch(var(--sidebar-accent))',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground))',
          border: 'oklch(var(--sidebar-border))',
          ring: 'oklch(var(--sidebar-ring))',
        },
        chart: {
          1: 'oklch(var(--chart-1))',
          2: 'oklch(var(--chart-2))',
          3: 'oklch(var(--chart-3))',
          4: 'oklch(var(--chart-4))',
          5: 'oklch(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
