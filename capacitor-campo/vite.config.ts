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
    // Garante uma única instância de React no bundle.
    // Sem isso, o alias "@" faz AppCampo.tsx resolver react de ../node_modules
    // enquanto main.tsx resolve de ./node_modules — dois Reacts = useState null.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    outDir: "dist",
  },
})
