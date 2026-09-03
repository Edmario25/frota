# Como gerar o APK do SMS Campo

## Pré-requisitos (instalar uma vez)

1. **Java 17+** — baixe em https://adoptium.net/
2. **Android Studio** — baixe em https://developer.android.com/studio
   - Ao instalar, aceite instalar o Android SDK
   - SDK mínimo já configurado no projeto: API 22 (Android 5.1)

---

## Gerar o APK (debug — para testes e distribuição interna)

```bash
# 1. Sincronizar o projeto Android
npm run cap:sync

# 2. Reaplicar os arquivos de segurança versionados
copy sms-android-patches\AndroidManifest.xml android\app\src\main\AndroidManifest.xml
copy sms-android-patches\MainActivity.java android\app\src\main\java\shop\apicesystem\smscampo\MainActivity.java

# 3. Abrir o projeto Android no Android Studio
npm run cap:open
```

No Android Studio:
- Aguarde o Gradle sincronizar (barra de progresso no rodapé)
- Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- Clique em **locate** na notificação que aparece

O APK fica em:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Gerar APK assinado (para distribuição final)

No Android Studio:
- Menu **Build → Generate Signed Bundle / APK**
- Escolha **APK**
- **Create new keystore** (primeira vez) ou selecione o existente
- Preencha alias, senhas, nome da empresa
- Escolha **release** como build variant
- Clique **Finish**

O APK fica em:
```
android/app/build/outputs/apk/release/app-release.apk
```

> **Guarde o arquivo `.jks` (keystore) em lugar seguro** — você precisará dele para atualizações futuras.

---

## Instalar no celular do técnico

**Opção A — Cabo USB:**
```bash
# Com o celular conectado em modo Depuração USB:
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Opção B — WhatsApp/e-mail:**
- Envie o arquivo `.apk` pelo WhatsApp ou e-mail
- No celular: abra o arquivo recebido
- Nas configurações: permita "instalar de fontes desconhecidas"
- Toque em **Instalar**

**Opção C — Google Drive / link direto:**
- Faça upload do `.apk` no Drive
- Compartilhe o link com os técnicos

---

## Como funciona

- O APK abre `https://sistema.apicesystem.shop/app-sms` em um WebView nativo
- Na **primeira abertura** precisa de internet para carregar
- Após o primeiro acesso, o **service worker** guarda os arquivos em cache
- Os registros são salvos no **IndexedDB** do celular quando offline
- Os registros offline são isolados pela conta autenticada no aparelho
- Ao reconectar, sincroniza automaticamente com o servidor
- Capturas de tela e backup Android ficam bloqueados na versão 1.1

---

## Atualizar o APK

Como o app carrega da URL hospedada, **mudanças no web não exigem novo APK**.
Só gere um novo APK se mudar: appId, ícone, permissões Android ou versão do Capacitor.
