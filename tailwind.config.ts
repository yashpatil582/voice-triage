import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        accent: "#10b981",
        danger: "#ef4444",
        warn: "#f59e0b",
      },
    },
  },
  plugins: [],
};

export default config;
