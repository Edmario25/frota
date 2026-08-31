# DDS operacional — publicação e validação

## Publicação coordenada

Aplicar `supabase/migrations/20260829000005_dds_operacional.sql` e publicar o gerencial e o App SMS juntos, em janela de manutenção. A migration revoga gravações diretas: versões antigas do app não poderão mais sincronizar DDS. Atualizar também o APK, caso utilize arquivos embarcados.

Não apagar dados locais nem reinstalar o app antes de resolver os registros pendentes de sincronização. O código novo mantém o UUID e guarda o DDS offline até a confirmação do servidor. Os registros legados com participantes em texto continuam como rascunho, sem inventar presenças. Sessões antigas também começam como rascunho e precisam ser conferidas antes de concluir.

## Critérios de aceite (executar em homologação)

1. Criar DDS com tema de catálogo e outro com tema livre. Informar obra, horário, duração, condutor e frente.
2. Abrir presenças como gestor: conferir que só a equipe da obra está disponível. Ler duas vezes o mesmo crachá: contar uma única presença.
3. Tentar registrar UUID de funcionário de outra obra diretamente pela RPC: deve recusar toda a operação.
4. Abrir a mesma sessão em duas abas; salvar em uma e tentar salvar na outra: a versão desatualizada deve ser recusada, sem apagar presenças.
5. Concluir sem participantes ou horário: deve recusar. Concluir sessão preenchida: deve bloquear edição de dados/presenças.
6. Reabrir/cancelar: exigir justificativa e permissão gerencial. Conferir histórico e identidade do responsável.
7. App: carregar equipe online, ficar offline e registrar participantes por busca/crachá. Reconectar; sessão e presenças devem ser gravadas juntas.
8. Reenviar o mesmo UUID e conteúdo: deve confirmar o registro existente sem duplicação. Mesmo UUID com conteúdo diferente: deve recusar.
9. Falhar upload de foto: o DDS deve permanecer pendente e conservar o arquivo local para nova tentativa.
10. Conferir indicadores, RH e novo snapshot do RDO: apenas DDS concluídos contam. Snapshots anteriores de RDO não são reescritos.
11. Conferir paginação (mais de 200 sessões), filtro de datas, exportação de presenças e impressão/Salvar PDF.
12. Validar isolamento: usuário sem permissão SMS/obra não acessa equipe, detalhes, alterações nem histórico.

## Limites desta entrega

A presença manual ou por QR é declaração do responsável, com identificação, origem e registro de horário no servidor. Não é assinatura eletrônica do participante. Assinatura individual e cadastro separado de visitantes/terceirizados sem cadastro de funcionário não foram implementados. O aplicativo precisa carregar a equipe da obra online pelo menos uma vez; a autenticação inicial continua seguindo o mecanismo existente do App SMS.

## Verificações locais

`node --experimental-strip-types --test src/lib/dds.test.mjs`

Os testes locais cobrem identificação de crachá, escopo da equipe no cliente, data local e preparação determinística do payload offline. Não substituem a execução dos cenários transacionais no PostgreSQL nem o teste da câmera em aparelho físico.
