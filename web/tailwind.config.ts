import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Wayfarer Brand Tokens (Style Guide)
        brand: {
          green: "#1B4332",
          hunter: "#081C15",
          sand: "#FAF8F5",
          linen: "#F3EFEA",
          terracotta: "#D97706",
          crimson: "#DC2626",
        },
      },
    },
  },
  plugins: [],
};
export default config;

