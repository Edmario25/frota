# Roadmap Completo do Sistema — Gestão de Obras

> **Início:** 2026-08-11  
> **Metodologia:** Implementação por fases, priorizadas por valor de negócio  
> **Stack:** React 18 + TypeScript + Vite + TailwindCSS + Supabase (self-hosted)

---

## O que já existe ✅

| Módulo | Status |
|--------|--------|
| Frota (Veículos Leves e Pesados) | ✅ Completo |
| Escalas de Viagem | ✅ Completo |
| Manutenção de Veículos | ✅ Completo |
| Checklist do Motorista (App) | ✅ Completo |
| Funcionários / RH | ✅ Completo |
| Cargos com Permissões | ✅ Completo |
| Fundo Fixo | ✅ Completo |
| Relatórios de Escalas | ✅ Completo |
| Chat Interno (por obra) | ✅ Completo |
| SMS / SSMA completo (9 módulos) | ✅ Completo |
| Dashboard principal | ✅ Completo |

---

## Fase 1 — Controle de Acesso por Cargo (PBAC) 🔐

**Status:** 🟡 Em implementação  
**Objetivo:** Permissões finas por cargo, sem hardcoded no código-fonte

### O que faz
- Cada cargo define quais módulos pode acessar (toggles na tela de Cargos)
- Funcionário herda permissões do cargo automaticamente
- Sidebar filtra menus dinamicamente via hook `usePermissions()`
- Escopo de obras: funcionário vê só dados das obras vinculadas
- Cargos com `acessa_todas_obras = true` ignoram o filtro de obra

### Arquivos criados/modificados
- `supabase/migrations/20260811_cargo_permissions.sql` — schema
- `src/hooks/usePermissions.ts` — hook central de permissões
- `src/components/cargos/CargoFormModal.tsx` — toggles por módulo
- `src/components/layout/Sidebar.tsx` — menus dinâmicos

### Permissões disponíveis (chaves)

| Chave | Módulo |
|-------|--------|
| `acesso_dashboard` | Dashboard principal |
| `acesso_frota` | Veículos e Frota |
| `acesso_escalas` | Escalas de Viagem |
| `acesso_manutencao` | Manutenção |
| `acesso_colaboradores` | Funcionários / RH |
| `acesso_fundo_fixo` | Fundo Fixo (já existia) |
| `acesso_relatorios` | Relatórios |
| `acesso_sms_dashboard` | Painel SMS |
| `acesso_sms_desvios` | Desvios |
| `acesso_sms_inspecoes` | Inspeções |
| `acesso_sms_apr` | APR |
| `acesso_sms_dds` | DDS |
| `acesso_sms_epis` | EPIs |
| `acesso_sms_treinamentos` | Treinamentos |
| `acesso_sms_admissao` | Admissão Digital |
| `acesso_sms_rdo` | RDO |
| `acessa_todas_obras` | Bypass filtro de obra |

---

## Fase 2 — Efetivo e Ponto ⏱️

**Status:** 🔲 Pendente  
**Prioridade:** 🔴 Alta — conecta RH + SMS + custo de mão de obra

### O que faz
- Apontamento diário de presença em campo (quem veio, quantas horas, em qual frente)
- HHT (Horas Homem Trabalhadas) por empresa, subcontratada e função
- Integração com RDO: preenche automaticamente o efetivo do dia
- App mobile-friendly para apontamento em campo
- Painel gerencial: faltas, horas extras, produtividade por frente

### Tabelas a criar
```sql
-- Registro de ponto diário
CREATE TABLE efetivo_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  employee_id uuid REFERENCES employees(id),
  data date NOT NULL,
  frente text,                -- "Fundação", "Estrutura", etc.
  empresa text,               -- empresa do trabalhador (subcontratada)
  hora_entrada time,
  hora_saida time,
  horas_trabalhadas numeric(4,2),
  horas_extras numeric(4,2) DEFAULT 0,
  ausencia boolean DEFAULT false,
  motivo_ausencia text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Chave de permissão
- `acesso_efetivo` — já criada no banco na Fase 1

---

## Fase 3 — Almoxarifado e Controle de Materiais 📦

**Status:** 🔲 Pendente  
**Prioridade:** 🔴 Alta — fecha o custo de material

### O que faz
- Catálogo de materiais com unidade de medida e categoria
- Estoque por obra com quantidade mínima e alertas
- Movimentações: entrada (compra/transferência) e saída (requisição de frente)
- Requisições de compra com aprovação
- Integração com EPIs (mesmo padrão de estoque)

### Tabelas a criar
```sql
CREATE TABLE materiais_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  unidade text,              -- "kg", "m³", "un", "cx"
  categoria text,
  codigo_interno text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE almoxarifado_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  material_id uuid REFERENCES materiais_catalogo(id),
  quantidade numeric(12,3) DEFAULT 0,
  quantidade_minima numeric(12,3) DEFAULT 0,
  localizacao text,          -- "Galpão A", "Contêiner 1"
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE almoxarifado_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  material_id uuid REFERENCES materiais_catalogo(id),
  tipo text CHECK (tipo IN ('entrada','saida','transferencia','ajuste')),
  quantidade numeric(12,3) NOT NULL,
  frente text,               -- frente que recebeu (saída)
  fornecedor text,           -- fornecedor (entrada)
  nota_fiscal text,
  observacoes text,
  registrado_por uuid REFERENCES auth.users(id),
  data_movimento date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE requisicoes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  material_id uuid REFERENCES materiais_catalogo(id),
  quantidade numeric(12,3) NOT NULL,
  urgencia text CHECK (urgencia IN ('normal','urgente','critico')),
  justificativa text,
  status text DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','entregue')),
  solicitado_por uuid REFERENCES auth.users(id),
  aprovado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Chave de permissão
- `acesso_almoxarifado` — já criada no banco na Fase 1

---

## Fase 4 — Ferramentas e Equipamentos 🔧

**Status:** 🔲 Pendente  
**Prioridade:** 🔴 Alta (crítico em obras com içamento — NR-11, NR-18)

### O que faz
- Catálogo de ferramentas e equipamentos (diferente da frota)
- Controle de localização por frente de serviço
- Responsável por ferramenta
- Certificações de segurança: lacre, certificado de carga, próxima inspeção
- Alertas de vencimento de certificação (crítico para içamento)
- Histórico de manutenção preventiva

### Tabelas a criar
```sql
CREATE TABLE ferramentas_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  categoria text,            -- "Içamento", "Corte", "Medição", "Elétrico"
  numero_serie text,
  fabricante text,
  modelo text,
  exige_certificacao boolean DEFAULT false,
  ativo boolean DEFAULT true
);

CREATE TABLE ferramentas_alocacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id uuid REFERENCES ferramentas_catalogo(id),
  obra_id uuid REFERENCES obras(id),
  frente text,
  responsavel_id uuid REFERENCES employees(id),
  data_alocacao date DEFAULT current_date,
  data_devolucao date,
  condicao text CHECK (condicao IN ('otimo','bom','regular','danificado')),
  observacoes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE ferramentas_certificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id uuid REFERENCES ferramentas_catalogo(id),
  tipo_certificacao text,    -- "Lacre", "Cert. de Carga", "Inspeção NR-11"
  numero_certificado text,
  empresa_certificadora text,
  data_emissao date,
  data_vencimento date NOT NULL,
  arquivo_url text,          -- PDF do certificado
  created_at timestamptz DEFAULT now()
);
```

### Chave de permissão
- `acesso_ferramentas` — já criada no banco na Fase 1

---

## Fase 5 — Cronograma Físico e Avanço de Obra 📊

**Status:** 🔲 Pendente  
**Prioridade:** 🟡 Média — dado mais pedido pelo cliente

### O que faz
- WBS (estrutura de atividades) da obra com percentual planejado por período
- Apontamento de avanço em campo (mobile-friendly) pelo encarregado
- Gráfico Planejado vs. Realizado (curva S)
- Painel de desvio de prazo por atividade
- Integração com RDO: atividades executadas viram progresso no cronograma

### Tabelas a criar
```sql
CREATE TABLE cronograma_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  pai_id uuid REFERENCES cronograma_itens(id),  -- hierarquia WBS
  codigo text,               -- "1.1.2"
  descricao text NOT NULL,
  unidade text,
  quantidade_total numeric,
  data_inicio_plan date,
  data_fim_plan date,
  peso_percentual numeric(5,2),  -- peso no total da obra
  ordem integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cronograma_avancos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES cronograma_itens(id),
  data_referencia date NOT NULL,
  percentual_realizado numeric(5,2),
  quantidade_realizada numeric,
  observacoes text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Chave de permissão
- `acesso_cronograma` — já criada no banco na Fase 1

---

## Fase 6 — Subcontratadas e Medição Física 🏢

**Status:** 🔲 Pendente  
**Prioridade:** 🟡 Média — fecha o ciclo financeiro externo

### O que faz
- Cadastro de subcontratadas com escopo e valor contratual
- Medições mensais: o que cada subcontratada executou no período
- Aprovação de medição vinculada ao avanço físico
- Boletim de Medição (BM) gerado automaticamente para faturamento
- Histórico de aditivos e alterações contratuais

### Tabelas a criar
```sql
CREATE TABLE subcontratadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  razao_social text NOT NULL,
  cnpj text,
  escopo text,
  valor_contrato numeric(14,2),
  data_inicio date,
  data_fim_prevista date,
  status text DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa','encerrada')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE medicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontratada_id uuid REFERENCES subcontratadas(id),
  obra_id uuid REFERENCES obras(id),
  periodo_referencia text,   -- "2026-07"
  data_medicao date,
  valor_medido numeric(14,2),
  percentual_avanco numeric(5,2),
  status text DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviada','aprovada','rejeitada')),
  aprovado_por uuid REFERENCES auth.users(id),
  observacoes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE medicoes_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid REFERENCES medicoes(id) ON DELETE CASCADE,
  cronograma_item_id uuid REFERENCES cronograma_itens(id),
  descricao text NOT NULL,
  unidade text,
  quantidade_contrato numeric,
  quantidade_medida numeric,
  valor_unitario numeric(12,4),
  valor_total numeric(14,2)
);
```

### Chave de permissão
- `acesso_subcontratadas` — já criada no banco na Fase 1

---

## Fase 7 — Orçado x Realizado 💰

**Status:** 🔲 Pendente  
**Prioridade:** 🟡 Média — síntese financeira; depende das Fases 2, 3 e 6

### O que faz
- Importação ou cadastro do orçamento original da obra
- Consolidação automática de: mão de obra (ponto) + materiais (almoxarifado) + subcontratadas
- Dashboard financeiro: custo previsto vs. custo realizado por categoria
- Indicadores: CPI (Cost Performance Index), desvio de custo, tendência de encerramento
- Alertas de extrapolação de orçamento por item

### Tabelas a criar
```sql
CREATE TABLE orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid REFERENCES obras(id),
  versao text DEFAULT 'v1',
  data_referencia date,
  valor_total numeric(16,2),
  status text DEFAULT 'aprovado' CHECK (status IN ('rascunho','aprovado','revisado')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE orcamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE CASCADE,
  categoria text CHECK (categoria IN ('mao_de_obra','material','equipamento','subcontratado','outros')),
  descricao text NOT NULL,
  unidade text,
  quantidade numeric,
  valor_unitario numeric(12,4),
  valor_total numeric(14,2)
);
```

### Chave de permissão
- `acesso_financeiro` — já criada no banco na Fase 1

---

## Fase 8 — Portal do Cliente 🌐

**Status:** 🔲 Pendente  
**Prioridade:** 🟡 Média — diferencial comercial

### O que faz
- Acesso restrito para o cliente (empresa contratante)
- Visualização em tempo real: avanço físico, RDO, indicadores SMS, fotos
- Exportação de relatórios em PDF
- Log de visitas do cliente ao portal
- Autenticação separada (cliente não acessa o sistema interno)

### Implementação
- Nova role `cliente_externo` no sistema de auth
- Rotas prefixadas `/portal/*` com layout diferente
- Dados de leitura apenas das obras vinculadas ao cliente
- Gerador de PDF para RDO e relatório mensal

### Chave de permissão
- `acesso_portal_cliente` — já criada no banco na Fase 1

---

## Fase 9 — Qualidade / Não Conformidades ✅

**Status:** 🔲 Pendente  
**Prioridade:** 🟢 Complementar

### O que faz
- Registro de não conformidades de qualidade (diferente dos desvios de segurança)
- Punch List: lista de pendências antes da entrega
- Inspeção de serviço executado com checklist por etapa
- Registro fotográfico de entrega por atividade

### Chave de permissão
- `acesso_qualidade` — já criada no banco na Fase 1

---

## Fase 10 — Comunicação Interna 💬

**Status:** 🔲 Pendente  
**Prioridade:** 🟢 Complementar

### O que faz
- Comunicados oficiais para equipe (mudança de procedimento, alertas, avisos)
- Confirmação de leitura por funcionário
- Substituição dos grupos de WhatsApp desorganizados
- Filtro por obra, cargo ou frente

### Chave de permissão
- `acesso_comunicados` — já criada no banco na Fase 1

---

## Fase 11 — Visitantes e Controle de Acesso 🪪

**Status:** 🔲 Pendente  
**Prioridade:** 🟢 Complementar

### O que faz
- Registro de visitantes: nome, empresa, finalidade, hora de entrada/saída
- Integração com SMS: confirmação de integração de visitante realizada
- Assinatura digital do termo de segurança
- Relatório de visitação por período

### Chave de permissão
- `acesso_visitantes` — já criada no banco na Fase 1

---

## Visão do Sistema Completo

```
PESSOAS              OPERAÇÃO             FINANCEIRO / GESTÃO
────────────         ──────────────       ───────────────────
Funcionários ✅       SMS completo ✅       Fundo Fixo ✅
Escalas ✅           Frota ✅              Orçado x Realizado (F7)
Efetivo/Ponto (F2)   Manutenção ✅         Subcontratadas (F6)
Treinamentos ✅       Cronograma (F5)       Almoxarifado (F3)
Admissão ✅          Inspeções ✅

ATIVOS               QUALIDADE            CLIENTE
────────             ─────────            ───────
Ferramentas (F4)     Não Conform. (F9)    Portal (F8)
EPIs ✅              Punch List (F9)      Relatórios ✅

COMUNICAÇÃO          CONTROLE
────────────         ────────────
Chat ✅              Acesso por Cargo (F1) 🟡
Comunicados (F10)    Visitantes (F11)
```

---

## Stack técnica por fase

| Aspecto | Solução |
|---------|---------|
| Banco | Supabase PostgreSQL + RLS |
| Auth | Supabase Auth + `cargo_permissions` |
| Frontend | React 18 + TailwindCSS + shadcn/ui |
| Upload de arquivos | Supabase Storage (`sms-midias`, `docs-obra`) |
| PDF | `@react-pdf/renderer` ou geração server-side via edge function |
| Gráficos | `recharts` (já utilizado) |
| Mobile | PWA com App Router dedicado (já existente para motoristas) |

---

*Documento gerado em 2026-08-11. Atualizar conforme cada fase for concluída.*
