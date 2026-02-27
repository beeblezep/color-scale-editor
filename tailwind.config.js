import { primitiveColors } from './src/colorTokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /^bg-warm-gray-/,
    },
    {
      pattern: /^bg-gray-(950|1000|1100|1200|1300)$/,
    },
    {
      pattern: /^bg-neutral-(950|1000|1100|1200|1300)$/,
    },
    {
      pattern: /^text-gray-(950|1000|1100|1200|1300)$/,
    },
    {
      pattern: /^text-neutral-(950|1000|1100|1200|1300)$/,
    },
    {
      pattern: /^hover:bg-gray-(950|1000|1100|1200|1300)$/,
    },
    {
      pattern: /^hover:bg-neutral-(950|1000|1100|1200|1300)$/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        'fraunces': ['Fraunces', 'serif'],
        'space-grotesk': ['Space Grotesk', 'sans-serif'],
        'dm-mono': ['DM Mono', 'monospace'],
      },
      colors: {
        ...primitiveColors,
        // Legacy aliases
        neutral: primitiveColors.gray,
        zinc: primitiveColors.gray,
        'cool-gray': primitiveColors.slate,
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
