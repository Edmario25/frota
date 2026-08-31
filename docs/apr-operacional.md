# APR operacional — implantação e validação

## Entrega

Gerencial e App SMS compartilham o mesmo editor. O salvamento é transacional (APR, riscos e participantes) e gera rascunho. O reenvio do mesmo UUID e conteúdo não altera uma revisão já analisada. Conteúdo diferente no mesmo UUID é recusado.

Fluxo: **rascunho → em análise → liberada → em execução → encerrada**. Suspensão exige revisão antes de nova liberação. Cancelamentos, devoluções e liberações têm justificativa e autor. A aprovação é restrita a admin, gestor de contrato, gestor de obra e técnico SMS, respeitando o acesso à obra. O responsável de campo pode preparar e coletar ciência, mas não ganha aprovação por ter acesso ao app.

Inclui equipe vinculada à obra, busca e QR de crachá, ciência com assinatura desenhada, histórico, paginação, pendências, impressão/PDF, validade com horário, riscos por etapa, controles, responsáveis, evidência textual, emergência, treinamentos adicionais por atividade e seleção de PT da obra. O catálogo de riscos é geral, selecionado pelo elaborador; não existe filtragem automática por tipo de atividade nem se presume que todos os riscos do catálogo se aplicam.

## Regras que precisam ser conhecidas pela operação

- Ciência é coletada online no detalhe após salvar. O funcionário deve assinar pessoalmente após ler a revisão. O sistema identifica o coletor conectado; QR não é assinatura. A imagem não é assinatura digital certificada nem autenticação biométrica.
- Editar ou devolver para revisão invalida as ciências; imagens anteriores ficam no histórico. Não basta editar uma APR liberada: suspenda e solicite revisão.
- Liberação e início revalidam vínculo ativo, indisponibilidades no período, ASO e treinamentos. Ausência de ASO, validade ausente, exame demissional, inaptidão ou restrição bloqueiam, com mensagem genérica de pendência no RH. Não são exibidos diagnósticos ao campo. Restrições precisam de avaliação do RH/SMS; este fluxo não permite sobreposição manual.
- Treinamentos obrigatórios gerais e adicionais selecionados na APR devem existir e estar em dia no período. Certificados sem vencimento só passam quando o catálogo não define validade em meses.
- Matriz operacional 5×5: residual ≥15 bloqueia liberação. É um critério conservador de software que deve ser aprovado pelo responsável SMS da empresa; não é uma certificação normativa. Medidas e avaliações são preenchidas por pessoa competente, não calculadas automaticamente a partir da categoria.
- PT marcada como necessária precisa estar aberta, aprovada, na mesma obra e cobrir a validade inteira. Determinar quando a PT é exigida continua sendo responsabilidade do elaborador e aprovador. Não há dedução automática por NR ou categoria.
- O app pode guardar rascunhos offline após carregar a equipe/catálogos online. Offline não libera atividade, não coleta assinatura e não confirma aptidão. Sincronização antiga incompleta vira rascunho, sem fabricar ciência.
- Não há tarefa agendada para mudar status ou enviar push por vencimento. A tela sinaliza validade vencida, e os comandos de liberação/início bloqueiam. Mudanças de condição durante a execução precisam ser comunicadas e provocar suspensão.

## Ordem de atualização

1. Fazer backup e testar em homologação. Aplicar antes as migrações SMS/RH de 26/08 e **20260829000005_dds_operacional.sql**: APR reutiliza o controle de acesso e a consulta de equipe do DDS.
2. Em uma janela coordenada, executar integralmente **supabase/migrations/20260830000001_apr_operacional.sql**. O script usa transação; erro deve provocar rollback, não execução avulsa dos trechos restantes. A migração não foi aplicada à produção por esta tarefa.
3. Publicar web e atualizar App SMS juntos. As escritas diretas foram revogadas para impedir bypass: versões antigas deixarão de gravar APR até serem atualizadas. Não limpar armazenamento/dados do app com lançamentos pendentes.
4. Sincronizar os rascunhos, revisar registros antigos e coletar ciência. Um UUID legado já existente com conteúdo divergente permanece com erro para revisão humana; não há sobrescrita silenciosa.

**Atenção aos legados:** abertas aparecem como “Legada — revisar”. Execuções antigas sem comprovação de liberação no novo fluxo são suspensas com snapshot no histórico. Encerradas e canceladas permanecem preservadas. APR sem obra só pode ser recuperada por quem já tinha acesso administrativo e deve receber obra e equipe válidas. RDOs salvos não são reescritos; novos snapshots consideram APRs liberadas/executadas, com período válido. O resumo de RH conta participações com ciência em APR liberada/executada.

## Testes

- `node --experimental-strip-types --test src/lib/apr.test.mjs`: datas locais, matriz, duplicidades, adaptação legada e transições.
- `node scripts/test-apr-sql.mjs`, com `APR_PGLITE_PATH` apontando para o módulo temporário PGlite: migração e operações em PostgreSQL isolado com dados e identidade simulados. Testa atomicidade, permissões, conflitos, ciência, ASO, treinamentos, férias, PT, risco residual, revisão e idempotência. Não substitui validar o esquema e as políticas reais em homologação.
- `npx playwright test e2e/apr-operacional.spec.ts`: telas desktop/mobile e erro de liberação com respostas simuladas. Câmera física, identidade de assinante e instalação Android devem ser validadas em aparelho real.

Homologar com duas obras, um apontador sem aprovação, técnico SMS, gestor e funcionário afastado; testar também sessão expirada, envio sem rede e duas telas editando simultaneamente. A liberação não substitui a avaliação técnica do profissional de SMS.
