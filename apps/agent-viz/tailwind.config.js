/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#1a1a2e",
          light: "#232340",
          lighter: "#2d2d50",
        },
        accent: {
          gold: "#d4a853",
          blue: "#5b8def",
          green: "#4caf7d",
          red: "#e05555",
          purple: "#9b72cf",
        },
      },
    },
  },
  plugins: [],
};
