# Controle de Acesso — Especificação Técnica

> **Status:** Documentado — aguardando decisão de implementação  
> **Data:** 2026-08-11  
> **Abordagem:** Permission-based Access Control (PBAC) com escopo por obra

---

## Visão Geral

O sistema de controle de acesso é baseado em **Cargos com permissões configuráveis**.  
Cada cargo define quais módulos pode acessar. O funcionário herda as permissões do seu cargo automaticamente.  
Nenhuma alteração de código é necessária para criar novos cargos ou ajustar permissões.

---

## Arquitetura em 3 Camadas

| Camada | O que faz | Onde vive |
|--------|-----------|-----------|
| **1. Permissões do Cargo** | Define o que o cargo pode fazer (quais módulos) | Tabela `cargo_permissions` |
| **2. Escopo de Obras** | Define em quais obras o funcionário atua | Tabela `employee_obras` |
| **3. RLS (Row Level Security)** | Filtra os dados no banco automaticamente | Funções no Supabase |

### Fluxo de verificação

```
Usuário faz login
    → perfil → cargo_id
    → cargo_permissions (quais módulos pode ver)
    → employee_obras (quais obras pode acessar)
    → Sidebar filtra menus visíveis
    → RLS filtra dados no banco
```

---

## Banco de Dados — O que precisa ser criado/alterado

### 1. Tabela `cargo_permissions` (NOVA)

```sql
CREATE TABLE cargo_permissions (
  cargo_id   uuid REFERENCES cargos(id) ON DELETE CASCADE,
  module_key text NOT NULL,  -- chave do módulo (ver lista abaixo)
  can_read   boolean DEFAULT true,
  can_write  boolean DEFAULT true,
  PRIMARY KEY (cargo_id, module_key)
);
```

### 2. Tabela `employee_obras` (NOVA)

```sql
CREATE TABLE employee_obras (
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  obra_id     uuid REFERENCES obras(id)     ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (employee_id, obra_id)
);
```

### 3. Tabela `cargos` — colunas adicionais

```sql
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS acessa_todas_obras boolean DEFAULT false;
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS ativo             boolean DEFAULT true;
```
> `acessa_todas_obras = true` → ignora `employee_obras` (para Gestor de Contratos, Admin, etc.)

### 4. Funções RLS (NOVAS)

```sql
-- Verifica se o usuário tem permissão em um módulo
CREATE OR REPLACE FUNCTION user_has_permission(p_module text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN employees e ON e.id = p.employee_id
    JOIN cargo_permissions cp ON cp.cargo_id = e.cargo_id
    WHERE p.id = auth.uid()
      AND cp.module_key = p_module
  );
$$;

-- Verifica se o usuário pode acessar uma obra específica
CREATE OR REPLACE FUNCTION user_can_access_obra(p_obra_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN employees e ON e.id = p.employee_id
    JOIN cargos c ON c.id = e.cargo_id
    WHERE p.id = auth.uid()
      AND (
        c.acessa_todas_obras = true   -- cargo global (gestor de contrato, admin)
        OR EXISTS (
          SELECT 1 FROM employee_obras eo
          WHERE eo.employee_id = e.id AND eo.obra_id = p_obra_id
        )
      )
  );
$$;

-- Retorna array de obra_ids que o usuário pode acessar
CREATE OR REPLACE FUNCTION get_user_obras()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM profiles p
      JOIN employees e ON e.id = p.employee_id
      JOIN cargos c ON c.id = e.cargo_id
      WHERE p.id = auth.uid() AND c.acessa_todas_obras = true
    )
    THEN ARRAY(SELECT id FROM obras)
    ELSE ARRAY(
      SELECT eo.obra_id FROM profiles p
      JOIN employees e ON e.id = p.employee_id
      JOIN employee_obras eo ON eo.employee_id = e.id
      WHERE p.id = auth.uid()
    )
  END;
$$;
```

---

## Módulos do Sistema (chaves de permissão)

### Grupo: Operacional / Frota

| Chave (`module_key`) | Descrição |
|----------------------|-----------|
| `dashboard` | Dashboard principal — visão geral do sistema |
| `frota` | Veículos e frota — cadastro e controle |
| `checklist` | Checklist do motorista |
| `escalas` | Escala de viagens |
| `manutencao` | Manutenção de veículos |
| `colaboradores` | Gestão de colaboradores / RH |
| `fundo_fixo` | Fundo fixo / caixa da obra |
| `relatorios` | Relatórios gerenciais |

### Grupo: SMS / Segurança do Trabalho

| Chave (`module_key`) | Descrição |
|----------------------|-----------|
| `sms_dashboard` | Painel SMS — visão geral de segurança |
| `sms_desvios` | Desvios de segurança |
| `sms_inspecoes` | Inspeções de segurança |
| `sms_apr` | Análise Preliminar de Risco |
| `sms_dds` | Diálogo Diário de Segurança |
| `sms_epis` | Controle de EPIs |
| `sms_treinamentos` | Treinamentos de segurança |
| `sms_admissao` | Admissão digital |
| `sms_rdo` | Relatório Diário de Obra |

### Grupo: Administrativo (sem module_key — controlado pelo cargo)

| Chave (`module_key`) | Descrição |
|----------------------|-----------|
| `admin_usuarios` | Gestão de usuários e cargos |
| `admin_obras` | Cadastro e gestão de obras |

---

## Exemplos de Cargos e suas Permissões

### Gestor de Contratos
- `acessa_todas_obras = true`
- Todos os módulos ativos (`can_read = true`, `can_write = true`)

### Gestor de Obra
- `acessa_todas_obras = false` → vinculado às obras dele via `employee_obras`
- Todos os módulos ativos

### Setor Administrativo
- `acessa_todas_obras = false`
- Módulos: `dashboard`, `escalas`, `manutencao`, `colaboradores`, `fundo_fixo`, `relatorios`, `sms_admissao`

### Engenheiro de Segurança do Trabalho
- `acessa_todas_obras = false`
- Módulos: `colaboradores`, todos os `sms_*`

### Técnico de Segurança do Trabalho
- `acessa_todas_obras = false`
- Módulos: `colaboradores` (somente leitura), `sms_dashboard`, `sms_desvios`, `sms_inspecoes`, `sms_apr`, `sms_dds`, `sms_epis` (leitura), `sms_treinamentos` (leitura), `sms_rdo`

### Motorista
- `acessa_todas_obras = false`
- Módulos: `checklist`, `escalas` (somente leitura)

---

## Frontend — O que precisa ser desenvolvido

### 1. Hook `usePermissions()`
Carrega ao login as permissões do cargo do usuário e disponibiliza para o app:

```ts
// src/hooks/usePermissions.ts
const { can, obras } = usePermissions();

can('sms_desvios')          // boolean — pode ver o módulo?
can('sms_desvios', 'write') // boolean — pode editar?
obras                       // uuid[] — obras que pode acessar
```

### 2. Sidebar dinâmica
Substituir a lista hardcoded de `roles: []` por verificação via `can(module_key)`.  
O menu só aparece se o usuário tiver permissão no módulo.

### 3. Tela de Cargos — seção de permissões
Ao criar/editar um cargo, exibir grupos de módulos com toggles:

```
[ Operacional / Frota ]
  [x] Dashboard          [ toggle on/off ]
  [x] Veículos e Frota   [ toggle on/off ]
  ...

[ SMS / Segurança ]
  [ ] Painel SMS         [ toggle on/off ]
  [ ] Desvios            [ toggle on/off ]
  ...

[ Escopo ]
  [ ] Acessa todas as obras (quando ativo, ignora vínculo por obra)
```

### 4. Tela de Funcionário — obras vinculadas
Adicionar campo multi-select de obras ao perfil do funcionário.  
Só aparece quando o cargo do funcionário tem `acessa_todas_obras = false`.

---

## Regras de negócio importantes

1. **Admin do sistema** — único cargo que pode gerenciar outros cargos e permissões.
2. **`acessa_todas_obras = true`** — dispensa o vínculo por obra. Gestor de Contratos e Admin usam isso.
3. **Funcionário sem obras vinculadas** — não enxerga dados de nenhuma obra (segurança por padrão).
4. **Permissão `can_read` sem `can_write`** — usuário vê os dados mas não consegue criar/editar/excluir.
5. **RLS é a última linha de defesa** — mesmo que o frontend mostre algo indevido, o banco rejeita.

---

## Ordem de implementação sugerida

- [ ] **Passo 1** — Migration SQL (tabelas + funções RLS)
- [ ] **Passo 2** — Hook `usePermissions()` no frontend
- [ ] **Passo 3** — Tela de Cargos com toggles de permissão
- [ ] **Passo 4** — Sidebar dinâmica usando o hook
- [ ] **Passo 5** — Tela de Funcionário com obras vinculadas
- [ ] **Passo 6** — Ajuste das políticas RLS nas tabelas SMS e operacionais

---

*Documento gerado em 2026-08-11. Implementação pendente de aprovação.*
