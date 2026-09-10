# Módulo de Gestão de Alojamento

**Status:** núcleo operacional implementado em 10/09/2026 — migração pendente de aplicação no ambiente
**Base:** POP-ALJ-001 Rev. 00 (Manual de Gestão do Alojamento, 09/09/2026)
**Contexto original:** Parques Eólicos Sento Sé — CONEXX
**Proposta visual:** https://claude.ai/code/artifact/22ec8d19-868c-4cb0-8ecb-a14e779cd48e

Implementação iniciada após a conclusão dos testes do checkpoint de velocidade.

### Entregue no núcleo operacional

- Cadastro de alojamentos por obra, ambientes, quartos e geração automática de leitos.
- Hierarquia escalável de obra, complexo e unidade, permitindo combinar casas,
  blocos, hotéis, apartamentos, contêineres e estruturas terceirizadas.
- Cadastro em lote de até 200 quartos por operação, com geração automática dos
  leitos, adequado a complexos com milhares de alojados.
- Controle de imóvel próprio, aluguel, hospedagem ou cessão, incluindo contrato,
  proprietário/fornecedor, vigência, valor mensal e capacidade autorizada.
- Estados operacionais de leito: disponível, reservado, ocupado, higienização,
  manutenção, interditado e desativado.
- Reserva e cancelamento, check-in, check-out, transferência e liberação após higienização.
- Registro de ausência temporária e retorno, mantendo o leito corretamente ocupado.
- Bloqueio contra dupla ocupação do leito e do colaborador.
- Validação de capacidade, funcionário ativo e escopo de acesso por obra.
- Mapa visual de leitos, painel de ocupação e alerta da proporção de chuveiros.
- Chamados preventivos, corretivos e emergenciais.
- Cadastro patrimonial e conferência item a item no check-out, com termos
  versionados, retrato imutável dos bens e trilha de movimentações.
- Estrutura de regimentos e aceites preparada para a próxima tela operacional.
- Permissões específicas e integração com a auditoria central.

### Próximas evoluções sobre a base entregue

- Editor de termos com assinatura e geração do PDF comparativo.
- Assinatura digital dos termos e tela de publicação/aceite dos regimentos.
- Catálogo versionado de inspeção NR-24 integrado aos desvios SMS.
- Lotes, validade e PVPS/FEFO no depósito do alojamento.
- Abertura de chamados pelo aplicativo do colaborador.

---

## 1. O problema

O alojamento tem três controles que não conversam entre si — consumíveis,
patrimônio e pessoas — e hoje vivem em planilhas paralelas. Quando um
colaborador sai, ninguém consegue dizer com certeza o que ele recebeu na
entrada, em que estado estava, e qual leito ficou livre.

O manual resolve no papel (termo de recebimento de bens na entrada, conferido
com o mesmo checklist na saída). O problema é que dois checklists em papel,
separados por meses, não se cruzam sozinhos.

Dor recorrente: vários clientes com alojamento têm o mesmo problema.

---

## 2. Levantamento: o que o sistema já tem

Feito em 09/09/2026 inspecionando migrations e páginas.

### 2.1 Almoxarifado — cobre o capítulo 3 do manual quase inteiro

11 migrations (`20260812_almoxarifado.sql` até `20260902000002_almox_app_profissional.sql`).

Tabelas:
- `materiais_catalogo`
- `almoxarifado_estoque`
- `almoxarifado_movimentos`
- `almoxarifado_entregas`
- `almoxarifado_devolucoes`
- `requisicoes_compra` + `requisicao_itens`
- `ordens_compra` + `ordens_compra_itens`
- `inventario_fisico` + `inventario_itens`
- `fornecedores`

O fluxo do manual (Requisição → Aprovação → Compra → Recebimento →
Armazenamento → Distribuição → Baixa) **já está implementado**, com estoque
mínimo, ponto de pedido e inventário físico.

Falta: conceito de depósito/local "alojamento", categorias de gêneros
alimentícios / gás / água, e controle de validade (PVPS).

### 2.2 Ferramentas — padrão a copiar para patrimônio

`20260812_ferramentas.sql`:
- `ferramentas_catalogo` — nome, descrição, categoria, número de série,
  fabricante, modelo, capacidade, exige_certificacao, ativo
- `ferramentas_alocacao` — ferramenta_id, obra_id, ...
- `ferramentas_certificacoes`
- `v_ferramentas_situacao` (view)

Estrutura serve como referência, mas a semântica difere: ferramenta é alocada
a pessoa/obra; bem de alojamento fica **num quarto**.

### 2.3 SMS — vistorias e não conformidades

- `sms_inspecoes_catalogo`, `sms_inspecoes_itens_catalogo`, `sms_inspecoes`,
  `sms_inspecoes_respostas` — checklist genérico com foto e geração automática
  de desvio quando item é "nao_conforme"
- `sms_desvios` + `sms_desvios_tratativas` + `sms_desvios_validacoes` —
  máquina de estados completa com prazo e responsável
- `sms_empresas` — empresas contratadas/subcontratadas

### 2.4 Base compartilhada

- `employees` — colaboradores (já com empresa, obra, cargo)
- `obras` — o alojamento pertence a uma obra
- `cargos` + PBAC (`usePermissions.ts`, `PermKey`) — papéis do capítulo 2
- `maintenance_records` — manutenção, hoje atrelada a veículo

---

## 3. Mapeamento capítulo → sistema

| Capítulo do manual | O que existe | Situação |
|---|---|---|
| 3. Consumíveis | Almoxarifado completo | **Reuso** — falta local e categorias |
| 3.4 Validade / PVPS | — | **Novo** — campo de validade + alerta |
| 4. Patrimônio | `ferramentas_*` como padrão | **Adaptar** — tabela própria |
| 4.3 Manutenção | `maintenance_records` | **Adaptar** — hoje é só veículo |
| 5. Alojados | — | **Novo** — é o núcleo |
| 6. Vistorias | `sms_inspecoes_*` | **Reuso** |
| 7. NR-24 / não conformidades | `sms_desvios` | **Reuso** |
| 2. Papéis e acesso | `cargos` + PBAC | **Reuso** — uma permissão nova |
| 5.1 Empresa do alojado | `employees`, `sms_empresas` | **Reuso** |

**Conta:** de nove frentes, cinco têm infraestrutura, duas precisam adaptação,
duas são construção nova — e as duas novas são exatamente onde está a dor.

---

## 4. Modelo de dados proposto

```
alojamentos                obra_id, nome, endereco, responsavel_id, capacidade
  └── alojamento_quartos   numero, tipo, sexo, capacidade
       └── alojamento_leitos        identificacao, status
            └── alojamento_ocupacoes  employee_id, data_entrada,
                                      data_saida, empresa_id

alojamento_bens            tombamento, descricao, quarto_id, estado,
                           valor_aquisicao, numero_serie, data_aquisicao
alojamento_termos          ocupacao_id, tipo (entrada|saida), itens,
                           assinatura, pdf_url
alojamento_chamados        bem_id | quarto_id, tipo (preventiva|corretiva),
                           status, prazo, abertura, conclusao, custo
alojamento_ocorrencias     ocupacao_id, tipo, descricao, comunicado_rh
alojamento_regimento       versao, texto, aceites por alojado
```

### A amarração que resolve a dor

`alojamento_termos` é a peça central. O termo de entrada congela a lista de
bens do quarto com o estado de cada um. O de saída aplica **o mesmo
checklist** e o sistema compara automaticamente: o que sumiu, o que quebrou,
quem responde. É o item 4.2 do manual, que em papel não funciona.

### Mapa de ocupação é derivado, não mantido

O item 5.2 pede quadro visual de leitos ocupados/vagos. Com esta hierarquia,
o leito está ocupado se existe ocupação sem `data_saida`. **Nunca desatualiza
porque ninguém atualiza** — é consulta, não cadastro.

---

## 5. Telas

| Tela | O que resolve |
|---|---|
| Painel | KPIs do cap. 8: ocupação, custo/alojado, chamados vencidos, estoque abaixo do mínimo, validades a vencer |
| Mapa de leitos | Planta visual por quarto; clicar em leito livre abre check-in |
| Alojados | Lista com filtro por obra/empresa; check-in puxa colaborador já cadastrado; check-out roda vistoria comparativa |
| Patrimônio | Cadastro por tombamento agrupado por quarto; inventário trimestral |
| Chamados | Abertura por zeladoria ou pelo alojado; prazo, responsável, histórico na ficha do bem |
| Consumíveis | Atalho para o Almoxarifado filtrado no depósito do alojamento — não é tela nova |

---

## 6. Fases

Ordenadas por dor resolvida, não por facilidade.

**Fase 1 — Núcleo de ocupação**
Alojamentos, quartos, leitos, check-in/check-out, mapa visual. Sem patrimônio.
→ *Entrega: mapa de ocupação sempre correto, sem manutenção manual.*

**Fase 2 — Patrimônio e termo de responsabilidade**
Cadastro com tombamento, vínculo com quarto, termo de entrada/saída com
comparação automática, inventário.
→ *Entrega: fim da discussão sobre quem quebrou o quê.*

**Fase 3 — Manutenção e vistorias**
Chamados preventivos/corretivos com prazo. Vistorias reusando o checklist do
SMS com foto e geração de desvio.
→ *Entrega: histórico por equipamento e conformidade NR-24 documentada.*

**Fase 4 — Consumíveis e indicadores**
Depósito do alojamento no Almoxarifado, controle de validade com PVPS, painel
de KPIs consolidando as três frentes.
→ *Entrega: relatório mensal de gestão gerado, não digitado.*

---

## 7. Por que vende

- **O concorrente é a planilha.** Não há software brasileiro de gestão de
  alojamento de obra integrado a RH, obra e patrimônio. ERPs de hotelaria não
  falam de NR-24, empreiteira nem efetivo de canteiro.
- **O cadastro já está lá.** Em sistema isolado, alojar alguém exige
  recadastrar a pessoa. No Ápice o colaborador já existe com empresa, obra e
  função — check-in em dois cliques.
- **NR-24 é argumento de auditoria.** Cliente contratante audita alojamento de
  empreiteira; vistoria com foto, data e responsável muda a conversa.
- **O app já existe.** A base do app de campo serve para o alojado abrir
  chamado com foto, sem aplicativo novo.

---

## 8. Decisões pendentes

| Questão | Recomendação |
|---|---|
| Patrimônio: tabela própria ou estender `ferramentas_*`? | **Tabela própria** seguindo o mesmo padrão. Forçar a semântica de ferramenta complica os dois módulos. |
| Consumíveis: depósito no Almoxarifado ou estoque separado? | **Depósito no Almoxarifado.** Duplicar controle de estoque seria o maior desperdício aqui. |
| O alojado acessa o sistema? | **Fora da Fase 1.** Planejar a partir da Fase 3, quando existir chamado para ele abrir. |
| Termo assinado: digital ou papel? | **Os dois.** Assinatura em tela no app + geração de PDF para imprimir quando o cliente exigir via física. |

---

## 9. Validação sugerida

Fase 1 em um alojamento real do Sento Sé. Se o mapa de ocupação se sustentar
sozinho por um mês, o resto do módulo se justifica.
