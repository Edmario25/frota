# Testes funcionais por perfil e obra

## Objetivo

Validar que as regras de interface e do banco permanecem alinhadas após o endurecimento do RLS. O teste deve usar duas obras distintas, sem colaboradores, veículos ou dados operacionais compartilhados entre elas.

## Massa mínima

- uma conta `admin`;
- uma conta `gestor_contrato`;
- um `gestor_obra` vinculado somente à Obra A;
- um `tecnico_sms` vinculado somente à Obra A;
- um `funcionario` vinculado somente à Obra A;
- um segundo funcionário vinculado somente à Obra B;
- um veículo, visitante, requisição e registro SMS em cada obra.

Use contas de teste, nunca usuários reais. Não reutilize CPF, documentos, telefone ou e-mail de produção.

## Matriz de acesso esperada

| Fluxo | Admin / contrato | Gestor da Obra A | Técnico SMS da Obra A | Funcionário da Obra A |
| --- | --- | --- | --- | --- |
| Consultar Obra A | permitido | permitido | permitido quando vinculado | permitido quando vinculado |
| Consultar Obra B | permitido | negado | negado | negado |
| Consultar funcionário da Obra A | permitido | permitido | permitido no SMS | somente o próprio cadastro |
| Consultar funcionário da Obra B | permitido | negado | negado | negado |
| Alterar equipes da Obra A | permitido | permitido | negado | negado |
| Alterar equipes da Obra B | permitido | negado | negado | negado |
| Operar DDS/APR da Obra A | permitido | permitido | permitido | negado |
| Operar DDS/APR da Obra B | permitido | negado | negado | negado |
| Consultar custos da Obra A | permitido | permitido | negado | negado |
| Consultar custos da Obra B | permitido | negado | negado | negado |
| Criar requisição na Obra A | permitido | permitido | negado | permitido somente se a interface conceder o fluxo |
| Criar requisição em nome de outro usuário | negado | negado | negado | negado |
| Consultar ponto da Obra A | permitido | permitido | negado | somente registros autorizados da obra/próprios |
| Consultar ponto da Obra B | permitido | negado | negado | negado |
| Consultar ciclo do próprio veículo | permitido | permitido quando na obra | conforme vínculo | permitido |
| Alterar configuração global de frota | permitido | negado | negado | negado |

## Roteiro de negação obrigatória

Para cada conta limitada à Obra A:

1. tente abrir diretamente uma URL gerencial não autorizada;
2. consulte pela API um UUID conhecido da Obra B;
3. tente inserir um registro usando `obra_id` da Obra B;
4. tente atualizar um registro existente da Obra B;
5. tente relacionar um funcionário da Obra B a um registro da Obra A;
6. confirme que a resposta não retorna dados e que nenhuma linha foi alterada.

Uma tela vazia não é prova suficiente. Confirme a negação também na resposta da API e depois consulte o registro com a conta administradora.

## Fluxos de regressão

- login, logout e recuperação de sessão;
- criação e remarcação de escala com notificação;
- apontamento de campo online e sincronização de fila offline;
- registro no totem por QR Code;
- requisição com múltiplos itens e aprovação;
- criação de DDS com presenças;
- criação de APR com riscos e envolvidos;
- lançamento de medição e custo;
- cadastro de visitante seguido de entrada e saída;
- leitura do ciclo de quilometragem pelo motorista.

## Critério de aceite

O ciclo é aprovado somente quando todos os acessos permitidos funcionarem e todas as tentativas entre obras forem negadas. Registre usuário, obra, horário, operação e resultado de cada falha para facilitar a reprodução.

## Automação disponível

A suíte `e2e/rls-isolation.spec.ts` cobre o primeiro perfil limitado, o `gestor_obra` da Obra A. Ela autentica diretamente com a chave pública e confirma que:

- a conta possui o perfil esperado;
- a conta está vinculada à Obra A e não à Obra B;
- uma consulta direta retorna a Obra A e oculta a Obra B;
- a função central de autorização nega explicitamente a Obra B.

Copie `.env.example` para `.env.local` e preencha apenas as variáveis `E2E_*` com dados sintéticos. O arquivo local é ignorado pelo Git. Execute `npm run test:security`. Sem essas variáveis, os cenários são marcados como ignorados, sem provocar uma falsa falha no restante da validação.

Para preparar a massa, use `supabase/security-test-discovery.sql`. A consulta é somente de leitura e retorna as obras candidatas, o perfil e os vínculos da conta. Troque apenas o e-mail indicado no início do arquivo; a senha nunca deve ser colocada no Editor SQL nem enviada no relatório.

## Resultado executado — gestor de obra

Em 22/08/2026, a suíte foi executada contra o ambiente Supabase com uma conta sintética `gestor_obra`, vinculada exclusivamente à obra `CAMPO LARGO3`.

| Verificação | Resultado |
| --- | --- |
| Autenticação da conta sintética | aprovado |
| Perfil retornado como `gestor_obra` | aprovado |
| Vínculo inclui `CAMPO LARGO3` | aprovado |
| Vínculo não inclui `JACOBINA01` | aprovado |
| Consulta direta oculta `JACOBINA01` | aprovado |
| Função de autorização nega `JACOBINA01` | aprovado |

Resultado da execução: **4 testes aprovados em 3,4 segundos**. Nenhuma operação de escrita foi realizada pela suíte.
