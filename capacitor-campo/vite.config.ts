import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import { resolve } from "path"

export default defineConfig({
  plugins: [react()],
  base: "./",   // Capacitor exige paths relativos
  resolve: {
    alias: {
      // Aponta "@" para o src do app principal (onde ficam supabase, hooks, etc.)
      "@": resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: "dist",
  },
})
