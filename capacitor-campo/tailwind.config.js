/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Componente principal do app de campo
    "../src/pages/app/campo/**/*.{ts,tsx}",
    // index.html do capacitor-campo
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
