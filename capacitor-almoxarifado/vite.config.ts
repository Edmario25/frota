import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: { "@": resolve(__dirname, "../src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: { outDir: "dist" },
});
