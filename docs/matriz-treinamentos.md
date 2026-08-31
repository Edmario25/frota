# Matriz de Treinamentos

## Publicação

Aplicar `20260830000003_matriz_treinamentos.sql` após `20260830000002_admissao_operacional.sql`, em homologação primeiro, e publicar o frontend. Nenhum SQL foi executado em produção nesta entrega. Faça backup. A migração preserva os treinamentos existentes; cria regras por obra/cargo e histórico de alterações. Ela verifica a compatibilidade da função de integração e, quando instalada, da APR; divergências abortam a transação. Não remova essa verificação para forçar a execução.

## Cálculo

- Base: todos os vínculos ativos de funcionários ativos nas obras autorizadas, mesmo sem treinamentos. Uma pessoa em duas obras tem dois vínculos e uma pessoa única nos indicadores.
- Exigências: catálogo ativo marcado obrigatório + regras ativas da obra/cargo + exigências do processo de integração não cancelado. Requisitos específicos de atividades continuam na APR e são somados às exigências comuns no momento da avaliação daquela atividade.
- A tela não inclui funcionários inativos ou sem obra. Não é um inventário de todos os certificados, que permanece em Treinamentos.
- Sem requisitos definidos: não avaliado, excluído do denominador. Percentual = requisitos atendidos / requisitos exigidos; não é a média simples dos percentuais individuais.
- Validade calculada pela data atual de Brasília, não pelo rótulo salvo. “A vencer” continua válido, com alerta em até 30 dias. Filtros adicionais permitem 60/90 dias.
- Registro pendente não atende automaticamente. Data futura, data de realização ausente ou vencimento ausente quando o catálogo exige validade demandam conferência. Sem vencimento só atende se o catálogo não definir prazo.
- Qualquer registro válido pode atender ao requisito. Registros anteriores permanecem no histórico sem duplicar o denominador. Um certificado restrito a outra obra não atende; registro sem obra é tratado como geral.
- Esta entrega não valida conteúdo/autenticidade do certificado nem concede autorização de trabalho. Pendência de conferência se baseia nos registros existentes; não há novo fluxo de assinatura de certificados.

## Operação

Selecione uma obra e abra Configurar requisitos. Gestores autorizados podem exigir treinamento para toda a obra ou determinado cargo, com justificativa. Técnico SMS consulta, mas não muda a exigência. Desativação é auditada e não remove a obrigatoriedade que também exista no catálogo ou na integração. Regras ligadas a treinamento desativado devem ser revisadas pelo administrador (reative o item no catálogo para editar sua regra).

Busca, filtros, indicadores e CSV usam o mesmo conjunto de vínculos. Os filtros selecionam funcionários/vínculos; todos os seus requisitos são mostrados e exportados. Lista paginada na tela, CSV de todas as linhas filtradas. A consulta agrega no banco, sem truncamento pela quantidade padrão de linhas da API. Em volumes muito altos, avaliar paginação e exportação no servidor; a resposta inclui históricos e pode crescer.

Integração e APR passam a usar o mesmo verificador de validade e as exigências da matriz; APR ainda exige cobertura até o fim da atividade. Os demais indicadores legados do painel SMS não foram substituídos nesta entrega. Não há envio automático de push/e-mail ou agendamento de turmas.

## Testes

Testes locais cobrem ausência de treinamento, renovação, status desatualizado, exigência por cargo, integração, escopo de obra, cálculo ponderado, exportação e interface. Homologar também no banco real e conferir catálogo obrigatório antes da publicação: requisito geral indevido causa pendências para toda a equipe.
