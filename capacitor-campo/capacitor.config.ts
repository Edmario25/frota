import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId:   "br.com.apicegestao.campo",
  appName: "Apontador de Campo",
  webDir:  "dist",
  android: {
    backgroundColor: "#0f172a",   // slate-900
  },
  server: {
    cleartext: false,
  },
}

export default config
