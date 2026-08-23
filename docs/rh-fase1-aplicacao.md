# RH profissional — Fase 1

## Implementado

- dossiê pessoal, contratual, salarial e bancário restrito a `admin`, `gestor_contrato` e `gestor_frota`;
- funcionário mantém acesso ao próprio registro quando o fluxo correspondente for disponibilizado;
- gestor de obra não vê mais o Perfil RH sensível nem o relatório de custos;
- CPF mascarado para perfis sem acesso central de RH;
- relatório renomeado para **Estimativa de Custo de Pessoal** e identificado como visão gerencial;
- exclusão de funcionário substituída por desligamento com data e motivo;
- desligamento preserva o histórico, encerra vínculos ativos e bloqueia a conta de acesso;
- vínculos removidos no desligamento são copiados para histórico auditável;
- cada usuário passa a possuir exatamente um perfil de acesso;
- mudança de cargo sincroniza o perfil por função protegida no servidor;
- admissão cria conta, funcionário, perfil e vínculo com obra em uma única transação.

## Aplicação no Supabase

Execute no SQL Editor:

`supabase/migrations/20260822000017_professionalize_hr_core.sql`

A migração é necessária antes de publicar a nova interface. Sem ela, os novos comandos de admissão, sincronização e desligamento ainda não existirão no banco.

## Verificação depois da aplicação

1. executar `supabase/security-audit-export.sql`;
2. criar um funcionário sintético com conta e obra;
3. alterar seu cargo e confirmar que existe apenas um perfil em `user_roles`;
4. desligar o funcionário e confirmar status inativo, vínculo encerrado e login bloqueado;
5. autenticar como gestor de obra e confirmar que Perfil RH e Custo de Pessoal não aparecem;
6. autenticar como gestor central e confirmar que os dois recursos continuam disponíveis.

Não utilize funcionário real na primeira validação do desligamento.
