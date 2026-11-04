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
        brand: {
          green: "#245c46",
          ink: "#183d32",
          mint: "#eafef2",
          cream: "#f7f5ef",
          gold: "#b88628",
        },
      },
    },
  },
  plugins: [],
};
export default config;

