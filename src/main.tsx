import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import App from "./App.tsx";
import "./index.css";

// QueryClient com staleTime generoso para dados offline ficarem úteis
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados considerados frescos por 5 min; revalidados em background depois disso
      staleTime: 1000 * 60 * 5,
      // Mantém no cache por 24h mesmo sem observadores (persiste para offline)
      gcTime: 1000 * 60 * 60 * 24,
      // Tenta 1 vez antes de falhar (evita loop em offline)
      retry: 1,
    },
  },
});

// Persiste o cache inteiro no localStorage para sobreviver a recargas
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "frota-query-cache",
  // Descarta entradas com mais de 24h
  throttleTime: 3000,
});

createRoot(document.getElementById("root")!).render(
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24, // 24h
      buster: "v1", // mude para invalidar o cache persisto
    }}
  >
    <App />
  </PersistQueryClientProvider>
);
