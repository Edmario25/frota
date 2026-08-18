import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId:   "br.com.apicesystem.motorista",
  appName: "App Motorista",
  webDir:  "dist",
  android: {
    backgroundColor: "#0f172a",   // slate-900 — cor do fundo do app
  },
  server: {
    cleartext: false,
    androidScheme: "https",
  },
}

export default config
