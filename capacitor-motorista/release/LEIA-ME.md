# Chave de assinatura — App Motorista

Esta pasta guarda a identidade do aplicativo no Android. Leia antes de mexer.

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `apice-motorista.jks` | A chave de assinatura. RSA 4096, válida até 2056. |
| `keystore.properties` | A senha da chave, lida pelo Gradle no build de release. |

Os dois estão fora do git (`.gitignore` nesta pasta bloqueia tudo).

## Por que isso é insubstituível

O Android identifica um app pela assinatura, não pelo nome. Se esta chave se
perder, **nenhuma atualização futura instala por cima** do app que já está nos
celulares: o sistema recusa com "pacote conflitante". A saída seria publicar um
app novo, com outro `applicationId`, e pedir a cada motorista que desinstale o
antigo e instale o novo do zero.

Não existe recuperação. Nem a Google, nem a Ápice, nem ninguém consegue
regenerar uma chave perdida.

## O que fazer agora

1. Copie `apice-motorista.jks` e `keystore.properties` para **dois lugares fora
   deste computador** — por exemplo um cofre de senhas da empresa e um drive
   corporativo com acesso restrito.
2. Guarde a senha no gerenciador de senhas da empresa, não só neste arquivo.
3. Nunca mande estes arquivos por e-mail, WhatsApp ou chat.

Impressão digital desta chave (confere se o APK é mesmo nosso):

```
SHA-256  8B:04:A6:AD:BB:91:41:12:2D:DF:17:3F:57:E1:0D:DF:6F:C8:EE:62:6D:FC:B2:58:7D:17:6F:1A:43:57:FA:66
```

## Como gerar um APK assinado

```bash
cd capacitor-motorista && npm run build && npx cap sync android
cd android && ./gradlew assembleRelease
```

Sai em `android/app/build/outputs/apk/release/app-release.apk`.

Se `keystore.properties` não existir, o build **não quebra** — sai um APK sem
assinatura, que não instala. É proposital: quem clona o projeto sem a chave
ainda consegue compilar e testar em debug.

## Antes de cada versão nova

Suba `versionCode` e `versionName` em `android/app/build.gradle`. O Android
recusa instalar por cima um APK com `versionCode` igual ou menor.

## Ícone do app

A arte vem de `capacitor-motorista/assets/` e é aplicada com:

```bash
npx capacitor-assets generate --android
```

`icon-foreground.png` e `icon-background.png` alimentam o ícone adaptativo do
Android 8+, que recorta cerca de um terço das bordas — por isso o desenho vive
numa área central de 660px dentro de 1024px. `icon.png` é a versão achatada,
para Android 7 e anterior.
