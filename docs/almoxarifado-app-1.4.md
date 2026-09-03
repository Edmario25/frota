# App Almoxarifado 1.4

## Publicação

1. Executar `supabase/migrations/20260902000002_almox_app_profissional.sql` no banco já atualizado com as migrações anteriores do sistema. O arquivo não substitui as migrações anteriores.
2. Publicar o sistema e instalar o APK atualizado. Não instalar esta versão antes do SQL: ela utiliza funções v2.
3. Conferir em homologação: acesso do almoxarife, obra vinculada, saída assinada, devolução parcial, item avariado e histórico.

## Alterações

- Seleção limitada às obras vinculadas ao operador, com validação de vínculo e funcionário ativo no servidor.
- Frente ativa e atividade do cronograma; finalidade manual quando a obra não tem cronograma.
- Busca de funcionários por nome/cargo e identificação por crachá.
- Devolução inclui funcionários com pendências mesmo após inativação ou saída da obra.
- Quantidades da devolução começam zeradas; assinatura é invalidada quando os dados mudam.
- Retorno em bom estado aumenta o estoque; avaria, quarentena, manutenção, descarte e perda ficam registrados sem disponibilizar o item.
- Identificador de operação e conferência do conteúdo impedem duplicação em tentativas repetidas.
- Histórico das últimas 30 entregas/devoluções do operador na obra selecionada.
- Renovação da sessão não apaga o formulário.

## Limites importantes

O app continua online. A recuperação de uma confirmação sem resposta mantém o pedido original **somente enquanto a tela permanece aberta**. Antes de fechar o app ou sair, usar “Consultar / confirmar operação pendente”. Caso o processo seja encerrado, conferir o histórico no sistema antes de refazer a retirada. Não há fila offline de saídas nem reserva offline de estoque.

Centro de custo é informação vinculada à entrega; não cria automaticamente lançamento financeiro. Destinos de itens avariados são registros de destino, não ordens de manutenção nem um estoque separado de quarentena. Fotografias de avaria e aprovação de descarte/perda não foram implementadas nesta versão.

As funções antigas permanecem para compatibilidade; as garantias v2 se aplicam ao app atualizado. Planejar a desativação das versões antigas após a distribuição. Assinaturas continuam no modelo de armazenamento existente; não foram migradas para armazenamento privado de arquivos.

## Validação

Testes isolados em PostgreSQL/PGlite (`scripts/test-almox-app-sql.mjs`): reaplicação do SQL, acesso por obra, datas de vínculo, afastamento registrado no RH, quantidades, saldo insuficiente com rollback, repetição de entrega/devolução e destino de item avariado. O teste usa os gatilhos reais de estoque e classificação de retornáveis. Não substitui teste do APK com banco e permissões de produção.

Dependência isolada do teste: `npm install --prefix node_modules/.almox-sql-test @electric-sql/pglite@0.3.14 --no-save --package-lock=false`.

Build web: `npm run build` dentro de `capacitor-almoxarifado`. Em seguida `npm run cap:sync`. Build de teste: `gradlew.bat assembleDebug` dentro de `capacitor-almoxarifado/android`.

Validação local em 02/09/2026: TypeScript do app, build web, testes SQL, sincronização Android e APK debug concluídos. Foi necessário usar o Java do Android Studio: `gradlew.bat "-Dorg.gradle.java.home=C:/Program Files/Android/Android Studio/jbr" assembleDebug`. APK em `capacitor-almoxarifado/android/app/build/outputs/apk/debug/app-debug.apk`. Não houve execução do SQL em produção, publicação no GitHub ou teste em aparelho físico.

O projeto Android é ignorado no Git. Ao recriá-lo, reaplicar os arquivos de `capacitor-almoxarifado/android-patches` e configurar `versionCode 5` / `versionName "1.4"`. Os patches desabilitam backup e captura de tela. APK debug é para validação; distribuição definitiva requer assinatura de release.
