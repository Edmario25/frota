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
        // Importa handler de push notifications
        importScripts: ["/sw-push.js"],
        // Faz precache de todos os assets do build
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Bundle principal ultrapassa 2 MiB — aumenta limite do precache
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        // O SW novo assume o controle imediatamente após instalar.
        // Evita que a versão antiga fique servindo cache stale após deploy,
        // o que causava tela branca até o usuário fazer hard-refresh.
        skipWaiting: true,
        clientsClaim: true,
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

  build: {
    // Aumenta limite de aviso (chunks grandes são esperados com shadcn)
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        // Code-splitting manual para reduzir pico de RAM no build
        manualChunks: {
          // UI / design-system
          "vendor-ui":    ["react", "react-dom", "react-router-dom"],
          "vendor-ui2":   [
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
            "@radix-ui/react-label",
            "@radix-ui/react-slider",
            "@radix-ui/react-accordion",
          ],
          // Supabase
          "vendor-supabase": ["@supabase/supabase-js"],
          // Datas
          "vendor-dates":    ["date-fns"],
          // Charts
          "vendor-charts":   ["recharts"],
          // QR Code (pesado)
          "vendor-qr":       ["qrcode"],
          // Ícones
          "vendor-icons":    ["lucide-react"],
        },
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
