import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),

    VitePWA({
      registerType: "autoUpdate",
      // Usa o manifest.json já existente em /public
      manifest: false,
      // SW só ativo em produção (evita conflito com Vite HMR em dev)
      devOptions: {
        enabled: false,
      },
      workbox: {
        // Faz precache de todos os assets do build
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Estratégia para navegação: sempre tenta a rede, cai no cache
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // Caching de APIs do Supabase: stale-while-revalidate
        runtimeCaching: [
          {
            // Supabase REST API — cache com revalidação
            urlPattern: /https:\/\/dadosfrota\.apicesystem\.shop\/rest\/v1\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Supabase Storage (fotos, logos) — cache por 7 dias
            urlPattern: /https:\/\/dadosfrota\.apicesystem\.shop\/storage\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts (se usadas)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
