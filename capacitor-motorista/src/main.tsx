// ─── App Motorista — entry point Capacitor ───────────────────────────────────
// Reutiliza as telas de D:\frota\src\pages\app\ via alias @/ → ../src
// Providers: QueryClient (com persistência offline) + AuthContext + MemoryRouter
//
// MemoryRouter: MobileApp usa useNavigate() para redirecionar unauthorized.
// Em vez de instalar o BrowserRouter completo, usamos MemoryRouter com uma
// rota padrão "/" — o navigate("/") no MobileApp simplesmente fica na raiz.

import { createRoot } from "react-dom/client"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/AuthContext"
import MobileApp from "@/pages/app/MobileApp"
import "@/index.css"

// ── QueryClient com cache offline (24h) ──────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,          // 5 min fresh
      gcTime:    1000 * 60 * 60 * 24,    // 24h no cache
      retry: 1,
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "motorista-query-cache",
  throttleTime: 3000,
})

// ── Render ────────────────────────────────────────────────────────────────────
createRoot(document.getElementById("root")!).render(
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24,
      buster: "v1",
    }}
  >
    <AuthProvider>
      <TooltipProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/*" element={<MobileApp />} />
          </Routes>
        </MemoryRouter>
        <Toaster />
        <Sonner />
      </TooltipProvider>
    </AuthProvider>
  </PersistQueryClientProvider>
)
