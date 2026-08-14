import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"

export default defineConfig({
  plugins: [react()],
  base: "./",   // Capacitor exige paths relativos
  build: {
    outDir: "dist",
  },
})
