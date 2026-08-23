# Auditoria de segurança

Atualizado em 22 de agosto de 2026.

## Resultado final validado

Auditoria consolidada executada no ambiente implantado em 23 de agosto de 2026, às 01:27 UTC:

- zero tabelas públicas sem RLS;
- zero tabelas com RLS sem política;
- zero políticas destinadas a `anon` ou `PUBLIC`;
- zero políticas irrestritas de escrita;
- zero funções `SECURITY DEFINER` sem `search_path` explícito;
- quatro leituras amplas, todas intencionais e documentadas: `fleet_config`, `system_settings`, `comunicados_cargos` e `comunicados_obras`.

Durante o trabalho, as políticas `ALL` abertas caíram de 27 para zero, as tabelas SMS bloqueadas por ausência de política caíram de oito para zero e as leituras amplas não classificadas foram reduzidas até restarem somente as quatro exceções funcionais acima.

Os testes funcionais posteriores ao endurecimento estão definidos em `docs/testes-por-perfil-e-obra.md` e devem ser executados com contas e dados sintéticos em duas obras isoladas.

## Escopo desta etapa

Foi feita uma análise estática das 137 migrations e das Edge Functions. Como o histórico pode criar e depois substituir políticas, a confirmação final precisa ser executada contra o banco implantado usando `supabase/security-audit.sql`.

## Achados

### Políticas amplas

O histórico contém diversas políticas `USING (true)` ou `WITH CHECK (true)` para o papel `authenticated`. Isso significa que qualquer conta válida pode alcançar os registros cobertos por aquela política, salvo quando outra camada impõe uma restrição.

Os grupos que merecem revisão prioritária são:

- dados de RH, documentos, férias e banco de horas;
- ponto e equipes de obra;
- estoque, requisições e ordens de compra;
- SMS, EPI, treinamentos, inspeções e APR;
- custos, orçamento e medições;
- visitantes e não conformidades.

Políticas abertas de leitura podem ser legítimas para catálogos compartilhados. Políticas abertas de escrita em dados pessoais, financeiros ou operacionais devem ser tratadas como alto risco até validação.

### Funções com privilégios elevados

O histórico possui funções `SECURITY DEFINER`. Cada uma deve fixar um `search_path` seguro, validar `auth.uid()` e conceder execução somente aos papéis necessários.

O resultado do ambiente confirmou que funções da aplicação herdavam `EXECUTE` para `PUBLIC`, tornando-as também executáveis por `anon`. A migration `20260822000001_revoke_anon_function_execute.sql` remove esse acesso das rotinas da aplicação e mantém explicitamente `authenticated`. Funções da extensão pgvector foram preservadas.

### Validação após a correção

A sexta consulta foi executada novamente após a aplicação da migration. Nenhuma função da aplicação permaneceu acessível por `anon` ou `PUBLIC`. O resultado residual contém somente funções fornecidas pela extensão pgvector (`vector`, `halfvec` e `sparsevec`), conforme esperado.

### Auditoria consolidada

O resultado consolidado confirmou:

- nenhuma tabela pública sem RLS;
- oito tabelas SMS com RLS e sem políticas, portanto bloqueadas pela API comum;
- 76 políticas amplas para `authenticated`, sendo 27 políticas `ALL`;
- quatro políticas anônimas intencionadas para o totem, mas excessivamente abrangentes;
- dez funções `SECURITY DEFINER` sem `search_path` fixado.

A migration `20260822000002_harden_definer_and_policy_roles.sql` fixa o `search_path` dessas funções e muda políticas condicionadas por usuário de `PUBLIC` para `authenticated`. Ela não modifica ainda as políticas do totem nem as 76 políticas amplas.

Após sua aplicação, as políticas `anon/public` caíram de 16 para quatro e todas as 36 funções `SECURITY DEFINER` passaram a ter configuração explícita.

### Proteção do totem

Foi identificado que o aplicativo Android aceitava uma variável `VITE_SERVICE_KEY`, o que poderia incorporar uma chave `service_role` ao APK. Esse caminho foi removido. A migration `20260822000003_secure_totem_rpc.sql` substitui as quatro políticas anônimas por uma RPC limitada, exige obra, valida o vínculo e bloqueia leituras repetidas em 30 segundos. O aplicativo agora usa somente a chave pública.

### Dados pessoais e ponto

A migration `20260822000004_restrict_employee_sensitive_data.sql` substitui políticas `ALL` abertas em dados de RH, documentos, férias, banco de horas e ponto. Funcionários podem consultar seus próprios dados; gestores autorizados mantêm administração, enquanto gestor de obra e técnico SMS ficam limitados aos vínculos de obra aplicáveis.

### Catálogos do SMS

A migration `20260822000005_restrict_sms_catalogs.sql` mantém a leitura dos sete catálogos compartilhados para usuários autenticados e limita inclusão, edição e exclusão a administradores, gestores e técnicos SMS. Contas operacionais deixam de poder alterar temas de DDS, riscos e tipos de APR, EPIs, modelos e itens de inspeção e treinamentos.

### Equipes de obra

A migration `20260822000006_restrict_obra_teams.sql` remove a edição global de equipes e membros. Gestores gerais continuam administrando todas as obras; gestores de obra consultam e alteram somente as obras às quais estão vinculados. Funcionários sem perfil de gestão não podem modificar equipes.

### DDS e APR

A migration `20260822000007_restrict_sms_dds_apr.sql` limita sessões e presenças de DDS, APRs, riscos e envolvidos ao escopo de obra. Administradores e gestores gerais mantêm visão global; gestores de obra e técnicos SMS acessam somente obras vinculadas ao próprio usuário.

### Operações restantes do SMS

A migration `20260822000008_restrict_remaining_sms_operations.sql` aplica o mesmo isolamento a admissões, entregas de EPI, treinamentos, desvios, estoque de EPI, inspeções, respostas e RDO. Quando o registro não possui obra, o vínculo seguro com o colaborador é usado como alternativa.

### Tabelas SMS bloqueadas

A migration `20260822000009_enable_blocked_sms_tables.sql` adiciona políticas às oito tabelas que tinham RLS sem nenhuma regra. Documentos seguem o acesso ao colaborador, frentes e matriz seguem a obra, detalhes de desvios seguem o registro principal, notificações respeitam o destinatário e o log de sincronização limita o usuário aos próprios eventos. Processos com `service_role` continuam operando fora das políticas RLS.

### Escritas permissivas residuais

A migration `20260822000010_restrict_permissive_writes.sql` fecha as seis regras residuais de escrita irrestrita. Notificações de escala exigem gestão sobre o colaborador, configuração de frota exige administrador ou gestor de contrato, requisições validam autoria e obra, itens validam a requisição pai e logs do sistema não aceitam `user_id` de terceiros.

### Funcionários, vínculos e ponto

A migration `20260822000011_scope_employee_and_time_reads.sql` remove políticas globais de leitura que coexistiam com regras restritas e, por serem permissivas, anulavam o isolamento. Funcionários, vínculos e apontamentos passam a respeitar usuário e obra. O apontador de campo só grava em obra atribuída, para colaborador vinculado e com autoria igual à sessão autenticada.

### Custos e medições

A migration `20260822000012_scope_financial_data.sql` restringe subcontratadas, medições, itens, orçamento e lançamentos à obra autorizada. Também converte as três views financeiras para `security_invoker`, impedindo que consultas pelas views contornem o RLS das tabelas de origem.

### Estoque e compras

A migration `20260822000013_scope_inventory_and_purchases.sql` restringe estoque, movimentações, inventários, ordens e requisições à obra autorizada. Relações filhas herdam o escopo do registro pai, transferências validam também a obra de destino e o solicitante continua podendo acompanhar a própria requisição.

### Qualidade, portal e visitantes

A migration `20260822000014_scope_quality_portal_visitors.sql` isola não conformidades, conteúdo do portal e visitas por obra. Visitantes ganham autoria para permitir o fluxo seguro de cadastro antes da primeira visita. Quatro views operacionais passam a usar `security_invoker` para respeitar o RLS das tabelas de origem.

### Leituras operacionais restantes

A migration `20260822000015_scope_remaining_obra_reads.sql` restringe obras, cronograma, ferramentas, empresas SMS vinculadas e ciclos de quilometragem. Motoristas mantêm acesso ao ciclo do próprio veículo e duas views operacionais passam a respeitar o RLS das tabelas de origem.

### Catálogos por perfil

A migration `20260822000016_restrict_catalog_readers.sql` limita catálogos operacionais a gestores e catálogos SMS aos perfis autorizados do módulo. Permanecem intencionalmente amplas apenas `fleet_config`, `system_settings`, `comunicados_cargos` e `comunicados_obras`, pois são configurações necessárias ao funcionamento das interfaces autenticadas.

### Criação de usuários

A interface atual usa a RPC `create_auth_user`, que verifica o cargo do solicitante e executa as gravações na mesma transação PostgreSQL. A Edge Function legada `create-user` também foi reforçada: agora reconhece `gestor_frota` e remove a conta recém-criada se a atribuição do perfil falhar.

## Como validar o ambiente implantado

1. Abra o SQL Editor do projeto Supabase correto.
2. Execute `supabase/security-audit-export.sql` para receber todas as verificações em uma única célula JSON. O arquivo `supabase/security-audit.sql` permanece disponível para análise em abas separadas.
3. Exporte o resultado consolidado.
4. Classifique cada política ampla como catálogo global, dado por obra, dado próprio ou administração.
5. Crie migrations aditivas para substituir apenas as políticas confirmadas como excessivas.
6. Teste com ao menos dois usuários em obras diferentes e um perfil sem privilégio administrativo.

## Regra de correção

Não edite migrations antigas nem remova políticas diretamente em produção. Para cada correção, crie uma migration que remova a política pelo nome e crie sua substituta, mantendo rollback e teste de negação documentados.
