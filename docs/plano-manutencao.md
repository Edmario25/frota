# Plano de manutenção preventiva

Antes, a regra de preventiva era um intervalo único para a frota inteira em
`fleet_config` (10.000 km / 180 dias), com o aviso aparecendo só no app do
motorista. Isso é lembrete, não plano: não distingue caminhonete de escavadeira,
ignora horímetro, e veículo sem preventiva concluída nunca avisava nada.

O plano resolve as três coisas. Quem não tiver plano aplicado **continua no
intervalo antigo** — nada do que existia parou de funcionar.

## Como funciona

```
plano  →  itens (serviços)  →  aplicado a veículos (com linha de base)
                                        ↓
              v_manutencao_vencimentos: próximo vencimento por item,
              em km, horas e dias — vale o que chegar primeiro
```

- **Item** é um serviço com ciclo próprio: óleo a cada 10.000 km, correia a cada
  60.000, revisão anual — tudo no mesmo plano, cada um com seu vencimento.
- **Gatilho triplo**: km, horas e dias. Preencha os que fizerem sentido; vence o
  primeiro que chegar. Equipamento de obra costuma usar horas; veículo de rua, km
  e dias.
- **Linha de base**: ao aplicar o plano, o banco grava km, horímetro e data do
  momento. É o que faz veículo sem histórico já nascer com vencimento, em vez de
  ficar silencioso.
- **Execução amarrada ao item**: ao concluir uma manutenção com `plano_item_id`,
  o contador **daquele item** zera — não o do plano inteiro.

## Usando

Tela **Manutenção → aba Planos**:

1. **Novo plano** — nome, descrição e fonte (manual do fabricante, norma interna).
   Dois modelos de partida ajudam a começar: *Veículo leve* e *Equipamento por
   horímetro*. São valores de referência: confirme no manual e no regime de uso —
   obra é uso severo, o que encurta intervalo.
2. **Serviços** — cada um com ciclo e antecedência de aviso. Marque *Parar o
   veículo se vencer* no que for de segurança (correia, freio, inspeção).
3. **Veículos** — selecione quem segue o plano. Entrou agora, conta da medição de
   hoje.

O card do plano mostra serviços, veículos, **vencidas** e **a vencer**, e avisa
quando um plano não tem item ou não tem veículo — os dois casos em que ele
existe mas não vale para ninguém.

## Conferindo depois de aplicar a migration

```sql
-- O cálculo responde?
SELECT placa, servico, gatilho, situacao,
       km_restante, horas_restantes, dias_restantes, sem_historico
FROM public.v_manutencao_vencimentos
ORDER BY (situacao = 'vencida') DESC, folga_fracao
LIMIT 20;
```

Com um plano aplicado, cada linha é um item por veículo. `gatilho` diz o que
vence primeiro; `sem_historico` marca o que ainda conta da linha de base.

## Vencimentos e documentos (Bloco 2)

Migration `20261027000002_vencimentos_frota_alertas.sql`.

- **Aba Vencimentos**, na mesma tela de Manutenção: o que está vencido e o que
  vai vencer, em manutenção e em documento, com busca e filtro. O botão
  **Agendar** cria a manutenção já amarrada ao item do plano — é isso que faz
  concluí-la recomeçar o ciclo daquele serviço.
- **Documentos do veículo**: CRLV, seguro, IPVA, aferição de tacógrafo, inspeção
  veicular, RNTRC e licença ambiental. Cadastrar de novo o mesmo tipo é
  renovar: o anterior sai de vigente e fica no histórico, que é prova de
  auditoria. A antecedência do aviso vem de `fleet_config.alerta_documentacao_dias`
  — a configuração que existia na tela sem dado por trás.
- **Alerta para quem decide**: `processar_alertas_frota()` cria notificação em
  `sms_notificacoes` para gestor de frota e admin, sem repetir no mesmo dia. Com
  `pg_cron` habilitado, roda sozinha às 10h; sem a extensão, chame a função pelo
  agendador que preferir.
- **Horímetro na manutenção**: o formulário mostra o campo quando o veículo mede
  por hora. Sem ele, item de plano com gatilho em horas nunca recomeça.

Para gerar os alertas na mão e conferir:

```sql
SELECT public.processar_alertas_frota();   -- devolve quantas notificações criou

SELECT tipo, titulo, mensagem, created_at
FROM public.sms_notificacoes
WHERE tipo IN ('manutencao_vencida','documento_veiculo')
ORDER BY created_at DESC LIMIT 20;
```

## Ordem de serviço (Bloco 3)

Migration `20261028000001_ordem_servico_manutencao.sql`. Botão **OS** em cada
linha da lista de manutenções.

- **Número da OS** gerado por ano (`OS-2026-0001`) na criação. Registros antigos
  ficam sem número — numerar depois reescreveria o histórico.
- **Oficina como fornecedor de verdade** (`fornecedor_id`), com o texto livre
  antigo preservado e visível enquanto ninguém escolher o fornecedor.
- **Entrada e saída da oficina** → `indisponibilidade_horas`, coluna calculada.
  É a base do indicador de disponibilidade do Bloco 4.
- **Mão de obra**: horas e custo.
- **Peças**: do estoque (baixa pela RPC oficial do almoxarifado, herdando o
  custo médio) ou de compra direta.

### A regra de custo que evita cobrar duas vezes

Material que sai do estoque **já vira custo da obra na saída**, pela regra do
almoxarifado (`v_almoxarifado_custos_obra` → `v_orcado_realizado`). Se o valor
dessa peça também entrasse no custo da OS, a obra pagaria duas vezes pelo mesmo
item. Por isso a OS separa:

| Campo | Entra no Orçado × Realizado? |
|---|---|
| `custo_pecas_estoque` | **Não** — já custeado na baixa do almoxarifado |
| `custo_pecas_compradas` | Sim |
| `custo_mao_obra` | Sim |
| `custo` | É a soma dos dois de cima — o que o Orçado × Realizado consome |

Quando a OS tem detalhamento (peça comprada ou mão de obra), `custo` passa a ser
calculado por trigger. Sem detalhamento, o valor digitado continua valendo, como
sempre foi.

Remover peça de estoque da OS **não desfaz a baixa** — devolver material é
operação do almoxarifado, e a tela avisa isso antes de remover.

## Indicadores e medição automática (Bloco 4)

Migration `20261028000002_indicadores_manutencao.sql`. Aba **Indicadores**, na
mesma tela, com período ajustável (atalhos de 30 e 90 dias).

| Indicador | Cálculo | Faixa usada na cor |
|---|---|---|
| Aderência ao plano | preventivas **de plano** concluídas com `data_realizada ≤ data_agendada` ÷ previstas | verde ≥ 90%, vermelho < 70% |
| Custo por km | custo das concluídas ÷ km dos ciclos de quilometragem | sem faixa — compare com a própria série |
| Disponibilidade | 1 − horas de oficina ÷ (veículos ativos × horas do período) | verde ≥ 95%, vermelho < 85% |
| Corretiva no custo | custo de não-preventiva ÷ custo total | verde ≤ 30%, vermelho > 50% |

A tabela abaixo dos cards ordena os veículos por custo — é onde aparece o
veículo que consome manutenção acima do resto da frota.

**Os cards avisam quando o número é bonito por falta de dado.** Disponibilidade
de 100% sem nenhuma hora de oficina não é frota impecável: é OS sem entrada e
saída preenchidas. O mesmo para custo por km sem ciclo de quilometragem aberto.
Essa distinção é o que separa indicador de enfeite.

### Odômetro e horímetro pelo rastreador

A varredura do controle de velocidade (`velocidade-rastreador`) já busca as
posições de cada veículo. Na mesma passada ela agora soma o percorrido na janela
e chama `frota_atualizar_medicao`, que alimenta `quilometragem_atual` e
`horimetro_atual` — os campos que o gatilho do plano lê.

- **Soma o delta da janela**, não o acumulado do rastreador: equipamento que veio
  de outro veículo não injeta a quilometragem alheia.
- **`odometer` tem prioridade** quando o equipamento reporta o painel do veículo
   — é o número que o mecânico lê e por onde a manutenção é cobrada.
- **Nunca retrocede**, e ignora salto acima de 5.000 km ou 500 h numa leitura.
- Falha na medição não invalida as amostras de velocidade da mesma varredura.

Para conferir:

```sql
SELECT * FROM public.manutencao_indicadores(current_date - 90, current_date, NULL);

SELECT placa, ordens, corretivas, custo, km_rodado, custo_por_km, horas_parado, vencidas
FROM public.manutencao_indicadores_veiculo(current_date - 90, current_date)
LIMIT 10;

-- Medição chegando do rastreador (traccar_device_id do veículo):
SELECT placa, quilometragem_atual, horimetro_atual, updated_at
FROM public.vehicles WHERE traccar_device_id IS NOT NULL ORDER BY updated_at DESC;
```

Quem ainda não implantou a varredura continua digitando a medição no cadastro —
nada do que existia deixou de funcionar.

## Revisão de cobertura da frota (28/10/2026)

Migrations `20261029000001_manutencao_ajustes_frota.sql` e
`20261029000002_horimetro_ciclos_custo_hora.sql`.

### Dois defeitos corrigidos

- **Veículo baixado não vence mais nada.** `baixar_veiculo` marca
  `status='inativo'`, mas a view não filtrava: um caminhão devolvido à locadora
  aparecia como vencido todo dia e ainda entrava em `vencidas_hoje`. A view foi
  reescrita idêntica, com uma linha a mais.
- **Documento vencido passa a bloquear.** Havia duas tabelas:
  `vehicle_documents` (antiga, só arquivo, sem tela) e `vehicle_documentos` (com
  tela, histórico e alerta). A liberação consultava a antiga, então o documento
  cadastrado na tela nova avisava mas não bloqueava — sensação de controle sem
  controle. Os registros com vencimento foram migrados (vencido entra como
  histórico, não como vigente, para não gerar alarme falso no primeiro dia), a
  antiga ficou marcada como obsoleta e a liberação lê `v_documentos_vencidos`.

### O veículo pesado entrou no plano

Leve e pesado dividem a tabela `vehicles` (`tipo='pesado'`), então o cálculo já
os cobria — mas as telas, não. Agora a ficha do pesado tem o bloco de
vencimentos e a ação de OS, e o cadastro tem o campo de plano e o **ID do
dispositivo Traccar**, que só existia no leve. Sem esse campo, a medição
automática não alcançava justamente quem mede por horímetro.

### Preventiva crítica bloqueia a saída

`useVehicleLiberacao` já exigia nova liberação por corretiva posterior, item
reprovado e documento vencido. Agora inclui item do plano marcado como
`bloqueia_veiculo` **e já vencido**. Item vencido não crítico não bloqueia:
bloquear tudo é o caminho mais curto para o gestor aprender a ignorar o
bloqueio.

### Custo por hora, e a separação das unidades

`vehicle_horimetro_cycles` espelha `vehicle_km_cycles`: horas de motor por mês,
mantidas por **trigger** em `vehicles.horimetro_atual`. Trigger, e não chamada
no aplicativo, porque o horímetro entra por três portas (cadastro, OS e
rastreador) e depender de cada uma lembrar de atualizar o ciclo é a forma
garantida de a série ficar furada.

Com a série existindo, os indicadores passam a separar:

| Indicador | Conta quais veículos | Divide por |
|---|---|---|
| Custo por km | `tipo_medicao <> 'horimetro'` | km dos ciclos de quilometragem |
| Custo por hora | `tipo_medicao = 'horimetro'` | horas dos ciclos de horímetro |

Cada um divide pelo custo da **sua própria turma**. Misturar é o erro comum:
uma escavadeira que roda 20 km e trabalha 180 horas no mês destruiria o custo
por km da frota inteira.

O primeiro ciclo de cada equipamento nasce zerado na migration: conta daqui
para frente, não retroage — não há como inventar as horas do mês passado.

```sql
SELECT public.frota_fechar_ciclos_horimetro();   -- na virada do mês

SELECT placa, tipo_medicao, custo, km_rodado, custo_por_km,
       horas_rodadas, custo_por_hora, vencidas
FROM public.manutencao_indicadores_veiculo(current_date - 90, current_date);
```

### Vencimentos da frota no painel principal

O dashboard mostrava só os vencimentos de RH. Agora os dois cartões ficam lado
a lado: pessoas de um lado, frota do outro — manutenção vencida e documento de
veículo, com o item crítico marcado e link para a tela de Manutenção.

O detalhe de cada linha fala **na unidade do gatilho que vence primeiro**:
dizer "faltam 15 dias" de um item que vence por quilometragem confunde quem
agenda a oficina.

## O que ainda falta

- **Ciclo de horímetro só conta a partir de agora.** O custo por hora fica
  pobre no primeiro mês e ganha sentido a partir do segundo.
- **Meta por frota**: as faixas de cor dos indicadores continuam fixas no
  código.
- **`fleet_config` ainda existe** como padrão de quem não tem plano. Só faz
  sentido aposentá-lo quando toda a frota tiver plano.

## Decisões de modelagem

- **Plano aplicado explicitamente**, não resolvido por marca/modelo. Resolução
  automática economiza cliques e esconde erro: o gestor não vê por que um
  veículo caiu num plano.
- **Substituição integral dos itens** ao salvar (delete + insert), como nas
  demais listas ordenadas do sistema — evita item órfão de uma versão anterior.
- **`bloqueia_veiculo` não bloqueia sozinho.** Marca o item como crítico para o
  painel; tirar o veículo de operação continua sendo decisão de gente, como já é
  no fluxo de avaria.
- **`fleet_config` continua existindo** como padrão de quem não tem plano. Só
  faz sentido aposentá-lo quando toda a frota tiver plano.

## Revisão da frota no ar — 04/11/2026

Análise feita no sistema publicado, com dados reais (3 veículos ativos, 1 baixado,
um plano "UTILITARIO" com 5 serviços aplicado a um veículo).

### Defeitos corrigidos

**1. O ciclo de km nunca funcionou.** `get_current_km_cycle` retornava erro 42702
(`column reference "km_rodados" is ambiguous`): o nome existia ao mesmo tempo como
coluna de retorno do `RETURNS TABLE` e como coluna da tabela no `UPDATE ... RETURNING`.
O frontend engolia o erro num `console.error` e exibia "Nenhum ciclo ativo". Sem ciclo,
`frota_km_rodado()` devolvia 0, o custo por km ficava eternamente em "—" e o limite
mensal de km da locadora não era fiscalizado. Migração `20261104000001`.

**2. "Alertas Críticos: 2" era um número escrito no código.** Literal `value: 2` em
`Manutencao.tsx`. Mostrava 2 com a base zerada, enquanto a aba Vencimentos, ao lado,
mostrava 0 itens críticos vencidos. Agora conta veículos distintos com item de plano
crítico vencido.

**3. Editar um plano apagava o histórico de cumprimento.** O salvamento fazia
`DELETE` de todos os itens e `INSERT` de novo. Como `maintenance_records.plano_item_id`
é `ON DELETE SET NULL`, corrigir uma vírgula no nome de um serviço desligava o vínculo
de todo o histórico: os contadores voltavam à linha de base e a aderência ao plano caía
a zero. Agora é upsert por id; só sai do banco o que o usuário removeu da tela.

**4. Contagem de veículos divergente.** O KPI de Manutenção contava o veículo baixado
(4) enquanto o Painel da Frota e os indicadores contavam 3. Dois painéis lado a lado
com números diferentes custam a confiança nos dois.

### Preenchimento do plano — o rótulo induziu ao erro

No plano real, dois dos cinco serviços têm antecedência quase igual ao ciclo:
troca de óleo avisa faltando 9.000 km num ciclo de 10.000; filtro de ar avisa faltando
360 dias num ciclo de 365. O item nasce "a vencer" e fica assim o ano inteiro — é por
isso que o painel mostra "Filtro de ar — faltam 359 dias" como alerta.

A causa é o rótulo: "Avisar com (km)" foi lido como "avisar depois de X km rodados".
O campo é o oposto: quanto falta para vencer. Renomeado para **"Avisar faltando (km)"**,
com aviso em tela quando a antecedência passa de metade do ciclo e bloqueio ao salvar
quando ela é maior ou igual ao ciclo.

Também: "Revisão de freios" no modelo pronto não parava o veículo. Freio é item de
segurança — passou a vir com "Parar o veículo se vencer" marcado.

### O que depende do usuário, não do código

- **Corrigir as antecedências do plano UTILITARIO** (óleo: 9.000 → ~500; filtro de ar:
  1.990 → ~1.000 e 360 → ~30 dias). Enquanto não corrigir, o alerta continua permanente.
- **Aplicar plano ao caminhão Accelo.** Ele tem 100.000 km e nenhum plano: o painel
  mostra "manutenção vencida 0" para ele porque não há nada a vencer, não porque está em dia.
- **Alimentar o odômetro.** Quatro dos cinco serviços do plano estão vencendo por *dias*,
  não por km, porque o km do veículo não avança desde o cadastro. Sem a função
  `velocidade-rastreador` publicada e agendada no Coolify, o plano por quilometragem
  nunca dispara — vira calendário.
- **Nenhum equipamento por horímetro na base.** Toda a infraestrutura de horas e custo
  por hora está correta e sem uso. O Accelo está cadastrado como medido em km, o que é
  adequado para caminhão de estrada.
