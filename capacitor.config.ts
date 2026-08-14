import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Configuração do Capacitor para o App SMS Campo.
 * Gera um APK Android que abre o app hospedado em server.url.
 * O service worker garante funcionamento offline após o primeiro acesso.
 *
 * Para gerar o APK:
 *   npm run build:sms-apk      → atualiza os arquivos e compila
 *   ou abra android/ no Android Studio → Build → Generate Signed Bundle/APK
 */
const config: CapacitorConfig = {
  appId:   'shop.apicesystem.smscampo',
  appName: 'SMS Campo',
  webDir:  'dist-sms-stub',
  server: {
    // Carrega o app hospedado — o service worker mantém o cache offline
    url:       'https://sistema.apicesystem.shop/app-sms',
    cleartext: false,
  },
  android: {
    backgroundColor:     '#15803d',
    allowMixedContent:   false,
    captureInput:        true,
    webContentsDebuggingEnabled: false,
  },
}

export default config
