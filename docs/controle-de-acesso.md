# Controle de Acesso

> **Status:** em produção (modelo novo). Papel antigo (`user_roles`) desativado em 11/09/2026.
> **Migrations:** `20260911000005` a `20260911000010`.
> **Teste:** `node scripts/test-acesso-sql.mjs`

## Ideia central

O acesso é decidido por **perfil + ação + escopo**, e nunca pelo cargo.

| Conceito | O que é | Onde vive |
|---|---|---|
| **Cargo** | Informação de RH. Não dá acesso. | `cargos` |
| **Perfil** | Pacote de permissões ("Gestor de Obra", "Almoxarife"...) | `access_profiles`, `access_profile_permissions` |
| **Ação** | `modulo.acao`, ex.: `fundo_fixo.aprovar`, `almoxarifado.editar` | `access_permissions` |
| **Escopo** | Onde a atribuição vale: `empresa`, `obra`, `departamento`, `setor`, `equipe`, `proprio` | `employee_access_profiles.scope_type/scope_id` |

Uma pessoa pode ter vários perfis, cada um com o seu escopo (ex.: gestor na Obra A, leitor na Obra B).

Além dos perfis atribuídos, contam:
- **Substituições** (`access_delegations`): o substituto recebe um perfil por um período.
- **Exceções individuais** (`access_overrides`): libera ou **bloqueia** uma ação específica. A exceção que bloqueia sempre vence.
- **Validade**: atribuições vencidas ou revogadas não valem. Revogar não apaga: grava `revogado_em`.
- **Desligamento**: mudar o funcionário para inativo/desligado revoga tudo na hora (gatilho em `employees`).

## A mesma regra em três lugares

1. **Banco** (autoridade final): políticas RLS chamam
   - `pode(chave, obra_id)`: registros de uma obra;
   - `pode_funcionario(chave, employee_id)`: registros de uma pessoa (resolve equipe, setor, departamento, obra, próprio);
   - `pode_geral(chave)`: cadastros gerais (só concessão da empresa vale);
   - `minhas_obras(chave)`: lista de obras para filtros.
2. **Rota**: `src/lib/accessMap.ts` diz a permissão de cada URL. Sem permissão, a tela `AcessoNegado` explica o que falta.
3. **Menu**: lê o mesmo mapa, então nunca mostra o que a URL não abre.

Nas telas, use `usePermissions().pode(chave, { obraId })` ou o componente `<Pode acao="..." obraId={...}>` para esconder botões. Esconder botão é conveniência: quem bloqueia é o banco.

## Transição (ponte)

Parte das políticas antigas ainda pergunta o papel: `get_user_role(...) IN ('admin','gestor_obra',...)`. Para desligar `user_roles` sem reescrever tudo de uma vez:

- `get_user_role` agora **deriva o papel do perfil** (`access_profiles.papel_equivalente`). Papel de empresa (admin, gestor de contrato) só vem de atribuição da empresa; o mesmo perfil atribuído a uma obra vale como gestor de obra.
- `get_user_obra_ids` vem dos perfis por obra e dos vínculos do próprio funcionário.
- As 8 regras auxiliares (`can_manage_obra_data`, `can_access_employee_record`...) usam o modelo novo (`access_config.modo = 'novo'`). A aba **Comparação** permite voltar uma regra, se necessário.

**Pendente:** reescrever as políticas que ainda usam `get_user_role`, módulo a módulo, com `pode(...)` e ações separadas (visualizar/criar/editar/excluir/aprovar), incluindo "quem cadastrou não aprova". Liste as restantes com:

```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public'
  AND (coalesce(qual,'')||coalesce(with_check,'')) ~* 'get_user_role|is_gestor_|is_tecnico_sms|is_sms_manager|is_operational_manager'
ORDER BY 1,2;
```

## Cadastros

- Todo usuário novo recebe o perfil **Funcionario** com escopo `proprio` (gatilho `handle_new_user`).
- Cargo com nível gestor de obra ganha **Gestor de Obra** nas obras vinculadas; gestor de contrato só quando quem cadastra administra acessos.
- Vincular/desvincular obra na tela de usuários concede/revoga o perfil de obra que a pessoa já tem naquela obra.

## Perfis de sistema

| Perfil | Papel equivalente | Observação |
|---|---|---|
| Administrador do Sistema | admin | Tudo, inclusive dado sensível. Uso restrito. |
| Administrador Tecnico | gestor_contrato | Configura sistema e acessos, **sem** dado sensível de RH |
| Gestor de Contrato | gestor_contrato | Visão das obras; sem controle de acesso, RH sensível, auditoria e chat |
| Gestor de Obra | gestor_obra | Operação completa da obra atribuída |
| Tecnico SMS / Gestor SMS | tecnico_sms | Operação / aprovação de SMS |
| Gestor de RH / RH Operacional | funcionario | Dado sensível só no Gestor de RH |
| Financeiro Operacional / Aprovador Financeiro | funcionario | Lançar/conferir vs aprovar (com limite em `access_approval_limits`) |
| Almoxarife, Apontador de Campo, Lider / Supervisor | funcionario | Operação no escopo atribuído |
| Funcionario | funcionario | Só os próprios registros |

## Como adicionar um módulo novo

1. Inserir as ações em `access_permissions` (`modulo.acao`).
2. Incluir nos perfis que devem ter (migration idempotente).
3. Mapear a rota em `src/lib/accessMap.ts`.
4. Escrever as políticas com `pode(...)` / `pode_funcionario(...)` / `pode_geral(...)`, **nunca** com `get_user_role`.
5. Cobrir no teste `scripts/test-acesso-sql.mjs`.
