# Totem de ponto — implantação segura

## Mudanças

- Cada tablet possui identidade, segredo, obra, situação, versão e último acesso.
- A RPC anônima antiga `(employee_id, obra_id)` é removida.
- A obra vem da credencial do equipamento, não do aplicativo.
- O crachá usa token aleatório e revogável; UUID puro deixa de funcionar.
- A jornada exige evento explícito: início, intervalo, retorno ou encerramento.
- O banco revalida a sequência sob trava e grava o horário do servidor.
- Funcionário e vínculo com a obra precisam estar ativos.
- O painel cadastra/bloqueia totens e mostra último acesso e versão.
- Não existe gravação offline.

## Ordem de publicação

1. Fazer backup e homologar.
2. Interromper os APKs antigos.
3. Aplicar `20260831000001_totem_profissional.sql`.
4. Publicar o sistema gerencial com a nova geração de crachás.
5. Cadastrar um equipamento por tablet em Ponto QR.
6. Criar `.env` individual, compilar, executar `npx cap sync android` e gerar APK assinado.
7. Reimprimir todos os crachás utilizados no totem.
8. Testar as quatro transições e o bloqueio remoto.

Não publique apenas o APK: a versão nova depende do SQL. Não existe compatibilidade com o QR antigo. Não reutilize credenciais entre tablets e nunca envie `.env` ou `service_role` ao Git. Em caso de perda, bloqueie o equipamento. Uma chave no APK pode ser extraída por um invasor com acesso ao arquivo; a proteção principal é ser individual, vinculada à obra e revogável.

## Limites

Modo imersivo, tela ligada e botão Voltar bloqueado não equivalem a Lock Task/Device Owner. Uma política Android administrada/MDM não foi ativada automaticamente. Não há detecção de root, atestado de integridade, biometria, push ou atualização remota. Uma fotografia do QR continua utilizável enquanto o token estiver ativo; a fotografia exibida no sucesso permite conferência visual.

Os eventos preservam `tipo=entrada/saida` para relatórios existentes: retorno do intervalo conta como entrada e início do intervalo como saída. Homologue Espelho de Ponto, tolerâncias e banco de horas antes do uso operacional. Correções devem manter autor, motivo e histórico.

## Contingência

- Tablet perdido: bloquear no painel.
- Segredo exposto: bloquear e cadastrar outro equipamento.
- Crachá perdido: renovar o QR e reimprimir.
- Sem internet: nenhum ponto é salvo; usar o procedimento de contingência da organização e lançamento posterior justificado.
- Jornada incorreta: corrigir no sistema com trilha; não faça leituras extras para compensar.
