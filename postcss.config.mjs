// ABOUTME: PostCSS configuration for Tailwind CSS 4.2.
// ABOUTME: Uses @tailwindcss/postcss plugin instead of legacy tailwindcss plugin.

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
