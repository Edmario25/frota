import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId:   "br.com.apicegestao.totem",
  appName: "Ponto Totem",
  webDir:  "dist",
  android: {
    backgroundColor: "#030712",   // gray-950
  },
  server: {
    // Mantém sessão Supabase ao recarregar (não usar URL remota em produção)
    cleartext: false,
  },
}

export default config
