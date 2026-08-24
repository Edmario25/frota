import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.apicegestao.almoxarifado",
  appName: "Ápice Almoxarifado",
  webDir: "dist",
  android: { backgroundColor: "#0b1830" },
  server: { cleartext: false },
};

export default config;
