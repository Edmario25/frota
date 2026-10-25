# Controle de velocidade por rastreador (zonas GPS)

Segunda fonte de medição do módulo de velocidade do SMS. O radar fixo continua
igual: mede o instante da passagem num ponto. A zona mede o trecho inteiro,
usando as posições que o Traccar já recebe da frota — sem poste, sem leitor UHF
e sem 4G novo.

As duas fontes gravam nas **mesmas tabelas** (`sms_checkpoint_passagens` e
`sms_infracoes_velocidade`): radar preenche `checkpoint_id`, zona preenche
`zona_id`, e um CHECK garante exatamente uma das duas.

## O que a zona não faz

- **Não vê veículo de terceiro.** Visitante, carreta de fornecedor e caminhão de
  concreto não têm rastreador. Nos pontos por onde passa terceiro, o radar
  continua sendo a única opção.
- **Não é medição aferida.** Radar com certificado serve para autuação; GPS
  serve para gestão de comportamento. Por isso a zona não tem campo de
  calibração e a tolerância padrão (5 km/h) é maior que a do radar (0).

## Caminho do dado

```
posição no Traccar (velocidade em NÓS)
  ↓  edge function velocidade-rastreador — converte para km/h (× 1,852)
sms_registrar_amostras_rastreador(device_id, amostras[])
  ↓  descarta sinal ruim: valid = false, sat < 5, hdop > 5
  ↓  sms_zona_do_ponto() — corredor (buffer em metros) ou polígono
  ↓  acima de limite + tolerância? acumula em sms_zona_eventos
  ↓  fecha quando desacelera, sai da zona, para, ou fica ocioso 180 s
  ↓  cumpriu amostras_minimas e duracao_minima_seg?
sms_checkpoint_passagens (origem = 'rastreador', amostras = rastro)
  ↓  trigger que já existia
sms_infracoes_velocidade — só se a zona estiver em modo 'autuacao'
```

Duas garantias que evitam encher a fila do SMS de falso positivo:

- **amostra isolada não vira nada** — exige sequência (`amostras_minimas`, padrão
  2) e duração (`duracao_minima_seg`, padrão 3 s);
- **reprocessar é seguro** — `sms_rastreador_estado.ultimo_fix_em` guarda o
  último fix por veículo, então webhook e varredura podem trazer a mesma
  posição sem contar duas vezes.

## Instalação

1. **Migrations** (nesta ordem, cada arquivo inteiro de uma vez no SQL editor):
   `20261025000001_velocidade_zonas_rastreador.sql` e
   `20261025000002_velocidade_ingestao_rastreador.sql`.

2. **Edge functions**:

   ```bash
   supabase functions deploy velocidade-rastreador
   ```

   O `traccar-proxy` também precisa estar publicado se você quiser usar o
   diagnóstico de amostragem pelo caminho padrão.

3. **Agendamento da varredura** — a cada 1 minuto, chamando a function com
   `{ "minutos": 10 }`. A sobreposição de janela é de graça e cobre queda
   momentânea de rede. Vale qualquer agendador: cron do servidor, Agendador de
   Tarefas do Windows, ou `pg_cron` + `pg_net` se as extensões estiverem
   habilitadas.

4. **Webhook (opcional, caminho rápido)** — no `traccar.xml`, o event forwarding
   apontando para a URL da function. Os nomes das chaves mudaram entre versões
   do Traccar; confira na versão instalada antes de editar. Mesmo com o webhook
   ligado, mantenha a varredura: ela é a rede de segurança.

## Na tela

`/sms/velocidade` ganhou a aba **Zonas GPS**, ao lado de Checkpoints — as duas
fontes convivem na mesma tela:

- **Cadastro da zona**: obra, nome, tipo (corredor ou polígono), limite,
  tolerância, faixa da via, amostras mínimas, duração mínima e horário opcional.
  As coordenadas entram uma por linha (`lat, lng`), na ordem do trecho; o
  contador mostra quantos pontos foram lidos e um link abre o primeiro no Google
  Maps para conferência. Não há biblioteca de mapa no projeto — capture
  dirigindo com o celular, exporte do GPS ou copie do Maps.
- **Selo de origem** nas listas de infrações e passagens: *Radar fixo* (roxo) ou
  *Rastreador* (azul), além da contagem de amostras no rastro da passagem GPS.
- **Botão de modo**: "Passar a autuar" pede confirmação e fica bloqueado enquanto
  a zona não tiver geometria suficiente (2 pontos no corredor, 3 no polígono).
- **Editar e excluir**: o mesmo diálogo edita a zona e traz o traçado atual para
  ajuste. O traçado é substituído inteiro ao salvar, e a alteração vale da
  próxima amostra em diante — passagens e infrações já gravadas guardam o limite
  do momento e não mudam. Excluir leva junto passagens e infrações da zona
  (`ON DELETE CASCADE`); para tirar de operação sem perder histórico, use
  Desativar.
- **Rastro**: na aba Passagens, a contagem de amostras abre a lista de posições
  que sustenta a infração — horário, velocidade, satélites, HDOP e link para o
  ponto no mapa. É a evidência equivalente à foto do radar.
- Zona sem geometria aparece com aviso explícito: ela não detecta nada.

## Teste ponta a ponta sem dirigir

Mesmo método que validou o radar: uma zona de teste com limite baixo e amostras
sintéticas. Rode no SQL editor, trocando o `obra_id` e o `traccar_device_id`.

```sql
-- 1. Zona de teste: corredor de 500 m, limite 10 km/h, já em autuação
WITH z AS (
  INSERT INTO public.sms_zonas_velocidade
    (obra_id, nome, tipo, limite_velocidade_kmh, tolerancia_kmh,
     buffer_metros, amostras_minimas, duracao_minima_seg, modo_operacao)
  VALUES ('COLE-O-OBRA-ID'::uuid, 'ZONA TESTE', 'corredor', 10, 0, 50, 2, 0, 'autuacao')
  RETURNING id
)
INSERT INTO public.sms_zona_vertices (zona_id, ordem, latitude, longitude)
SELECT z.id, v.ordem, v.lat, v.lng FROM z,
  (VALUES (0, -8.0500000, -35.0000000),
          (1, -8.0500000, -34.9950000)) AS v(ordem, lat, lng);

-- 2. Três amostras a 40 km/h dentro do corredor
SELECT public.sms_registrar_amostras_rastreador(
  <TRACCAR_DEVICE_ID>,
  jsonb_build_array(
    jsonb_build_object('lat', -8.05, 'lng', -34.9990, 'kmh', 40, 't', now() - interval '40 s', 'sat', 9, 'hdop', 1.0),
    jsonb_build_object('lat', -8.05, 'lng', -34.9980, 'kmh', 42, 't', now() - interval '20 s', 'sat', 9, 'hdop', 1.0),
    jsonb_build_object('lat', -8.05, 'lng', -34.9970, 'kmh', 38, 't', now(),                   'sat', 9, 'hdop', 1.0)
  )
);

-- 3. Fecha o evento como faria a varredura
SELECT public.sms_fechar_eventos_velocidade(0);

-- 4. Confere: passagem com origem 'rastreador' e a infração gerada
SELECT p.velocidade_kmh, p.limite_no_momento, p.origem, jsonb_array_length(p.amostras) AS amostras,
       i.gravidade, i.excesso_percentual
FROM public.sms_checkpoint_passagens p
LEFT JOIN public.sms_infracoes_velocidade i ON i.passagem_id = p.id
WHERE p.origem = 'rastreador'
ORDER BY p.detectado_em DESC LIMIT 5;
```

Esperado: uma passagem com 42,0 km/h, três amostras no rastro e infração
`gravissima` (320% acima de 10 km/h). Depois do teste, apague a zona — o
`ON DELETE CASCADE` leva junto vértices, eventos, passagens e infrações dela.

O retorno de `sms_registrar_amostras_rastreador` diz o que o banco decidiu por
amostra (`acima_do_teto`, `dentro_do_limite`, `fora_de_zona`,
`descartada_qualidade`, `ja_processada`, `parado`, `veiculo_nao_vinculado`). Em
campo, é esse campo que responde "por que não gerou infração?" sem adivinhação.

## Calibração antes de autuar

Toda zona nova nasce em `modo_operacao = 'observacao'`: **registra a passagem e
não gera infração**. Rode assim por uma ou duas semanas e use os dados para
ajustar (tudo pelo botão **Editar** da zona):

- `buffer_metros` — se aparecer passagem de veículo que estava na via paralela,
  está largo demais; se o veículo some no meio do trecho, está estreito.
- `tolerancia_kmh` — compare a velocidade registrada com o velocímetro em uma
  volta controlada.
- `amostras_minimas` / `duracao_minima_seg` — `sms_zona_eventos.descartado_motivo`
  mostra quantas sequências foram barradas e por quê.

Só então mude para `autuacao`.

## Diagnóstico de amostragem

Antes de criar zonas, confirme que o rastreador reporta com frequência
suficiente:

```bash
TRACCAR_URL=https://seu-traccar TRACCAR_TOKEN=seu_token node scripts/traccar-amostragem.mjs --device 3 --horas 4
```

O intervalo mediano **entre amostras em movimento** é o número que decide:
até 30 s detecta excesso quase instantâneo; de 30 a 60 s detecta excesso
sustentado, não arrancada curta; acima disso, reconfigure o rastreador para
reportar por distância ou ângulo (ex.: a cada 100 m ou 15°) antes de confiar na
zona.

## Quem responde pela infração

Sem registro de jornada por veículo, a infração é atribuída ao
`vehicles.responsavel_id` — a mesma regra que o caminho do radar já usa quando a
tag não identifica o condutor. Se o veículo for compartilhado, identifique o
condutor na tela antes de notificar, como já se faz hoje.
