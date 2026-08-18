import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "path"

// O alias @/ aponta para src/ do projeto principal (D:\frota\src)
// Assim todo o código do app do motorista é reutilizado sem duplicação
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: "dist",
    // Capacitor precisa de paths relativos no HTML gerado
    assetsDir: "assets",
  },
  // Permite importar de fora do root do projeto (../src)
  server: {
    fs: {
      allow: [".."],
    },
  },
})
