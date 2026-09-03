# 📲 Ponto Totem — Guia de Build do APK

APK dedicado para tablet fixo na obra. Scanner de QR Code do crachá → registra entrada/saída.

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|------------|---------------|
| Node.js    | 18+           |
| Java JDK   | 17+           |
| Android Studio | Ladybug (2024.2+) |
| Android SDK | API 24+ (Android 7) |

---

## 1. Preparar o banco

1. Aplique as migrations até `20260831000001_totem_profissional.sql`.
2. Confirme que o funcionário está vinculado à obra em `employee_obra_assignments` ou `obra_funcionarios`.
3. Em **Ponto QR → Equipamentos de ponto**, selecione a obra e cadastre o tablet.
4. Copie o ID e o segredo exibidos uma única vez.

O aplicativo usa somente a chave pública do Supabase. Nunca coloque uma chave `service_role` no `.env`, no APK ou em outro aplicativo cliente.

---

## 2. Configurar variáveis de ambiente

```bash
# Na pasta capacitor-totem/
cp .env.example .env
```

Edite `.env`:

```env
VITE_SUPABASE_URL=https://dadosfrota.apicesystem.shop
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica-anon
VITE_TOTEM_DEVICE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_TOTEM_DEVICE_SECRET=segredo-exibido-no-cadastro
VITE_APP_VERSION=1.1.0
```

---

## 3. Instalar dependências e compilar o React

```bash
cd capacitor-totem
npm install
npm run build
```

✅ Isso gera a pasta `dist/` com o bundle da aplicação.

---

## 4. Adicionar a plataforma Android

```bash
npx cap add android
```

> Execute **apenas uma vez**. Se a pasta `android/` já existe, pule este passo.

---

## 5. Aplicar patches no Android

### 5a. Substituir MainActivity

Copie o arquivo de patch sobre o gerado pelo Capacitor:

```bash
# Windows (PowerShell)
Copy-Item android-patches\MainActivity.java `
  android\app\src\main\java\br\com\apicegestao\totem\MainActivity.java -Force

# Linux/Mac
cp android-patches/MainActivity.java \
   android/app/src/main/java/br/com/apicegestao/totem/MainActivity.java
```

### 5b. Editar AndroidManifest.xml

Abra `android/app/src/main/AndroidManifest.xml` e aplique as mudanças descritas em `android-patches/AndroidManifest.patch.xml`:

- Adicionar `android:screenOrientation="landscape"`
- Adicionar `android:keepScreenOn="true"`
- Adicionar `android:launchMode="singleTask"`

Consulte o arquivo de patch para ver o bloco `<activity>` completo.

---

## 6. Sincronizar e abrir no Android Studio

```bash
npx cap sync android
npx cap open android
```

---

## 7. Gerar o APK no Android Studio

1. **Build → Generate Signed Bundle / APK**
2. Escolha **APK**
3. Crie ou use um keystore existente
4. Selecione **release**
5. O APK será gerado em:
   `android/app/build/outputs/apk/release/app-release.apk`

> Para debug rápido (sem assinar): **Build → Build Bundle(s)/APK(s) → Build APK(s)**

---

## 8. Instalar no tablet

```bash
# Via ADB (USB debug ativo)
adb install android/app/build/outputs/apk/release/app-release.apk

# Ou transfira o .apk para o tablet e instale manualmente
# (Configurações → Segurança → Fontes desconhecidas)
```

---

## 9. Configuração do tablet (recomendações)

| Configuração | Valor |
|-------------|-------|
| Orientação | Paisagem (landscape) — fixada no app |
| Brilho | 70–80% (fixo, desabilite ajuste automático) |
| Sono da tela | Desabilitar — o app mantém tela acesa via `FLAG_KEEP_SCREEN_ON` |
| Wi-Fi | Rede da obra (sem VPN) |
| Conta Google | Use uma conta genérica da empresa, não pessoal |
| Atualização automática | Desabilitar (evita reinicializações inesperadas) |

---

## 10. Kiosk Mode (opcional — avançado)

Para que o tablet só abra este app e o trabalhador não possa fechar:

```bash
# 1. Instale via ADB em modo debug
adb install app-debug.apk

# 2. Para quiosque corporativo completo, use um MDM compatível com Android Enterprise.
# A Activity do app não é um DeviceAdminReceiver e não deve ser usada com `dpm set-device-owner`.

# 3. No MainActivity.java, descomente a linha:
#    startLockTask();
```

> O app já mantém a tela ativa e usa modo imersivo. Bloqueio total do aparelho exige provisionamento por MDM e deve ser homologado antes da implantação.
> Faça isso apenas quando tiver certeza que o APK está correto.

---

## Estrutura do projeto

```
capacitor-totem/
├── src/
│   ├── main.tsx            ← entry point React
│   ├── index.css           ← estilos (sem Tailwind, CSS puro)
│   ├── supabaseClient.ts   ← cliente Supabase com chave pública
│   ├── TotemApp.tsx        ← valida configuração → TotemScreen
│   └── TotemScreen.tsx     ← scanner QR + confirmação
├── android-patches/
│   ├── MainActivity.java   ← KEEP_SCREEN_ON + modo imersivo
│   └── AndroidManifest.patch.xml
├── supabase/
│   └── create_totem_user.sql
├── .env.example
├── capacitor.config.ts     ← appId: br.com.apicegestao.totem
├── vite.config.ts
└── SETUP.md                ← este arquivo
```

---

## Solução de problemas

| Problema | Solução |
|---------|---------|
| Câmera não abre | Verifique permissão CAMERA no manifest e no Android |
| "Crachá inválido" | QR antigo, revogado ou funcionário sem vínculo ativo; gere novo crachá |
| Tela apaga | `FLAG_KEEP_SCREEN_ON` só funciona com o app em foreground |
| App fecha ao pressionar voltar | `onBackPressed()` desabilitado — force stop via Settings se necessário |
| Registro recusado | Confirme a migration, se o dispositivo está ativo e se o funcionário está vinculado à obra do totem |
