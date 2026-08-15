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
        // Code-splitting manual para reduzir pico de RAM no build.
        // IMPORTANTE: usa forma de FUNÇÃO (não objeto) para que o match seja
        // por caminho de arquivo — evita que React seja incluído em dois chunks
        // ao mesmo tempo (duplicação causava React error #310 "Invalid hook call").
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined

          // React e seus internos SEMPRE num chunk único.
          // Inclui scheduler (dependência interna do React DOM).
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) return "vendor-react"

          // Supabase (grande, sem dependência do React)
          if (id.includes("/@supabase/")) return "vendor-supabase"

          // Charts / D3 (sem React)
          if (id.includes("/recharts/") || id.includes("/d3-"))
            return "vendor-charts"

          // QR Code (sem React)
          if (id.includes("/qrcode/") || id.includes("/html5-qrcode/"))
            return "vendor-qr"

          // Demais node_modules: deixa o Rollup decidir o melhor lugar.
          // NÃO agrupar em "vendor-misc" — pacotes que usam React.createContext()
          // precisam que o Rollup resolva a ordem de inicialização corretamente.
          return undefined
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
