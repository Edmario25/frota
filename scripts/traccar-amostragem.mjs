/**
 * Diagnóstico de amostragem do rastreador — Fase 0 do controle de velocidade por GPS.
 *
 * Responde a pergunta que decide a viabilidade: o rastreador reporta com
 * frequência suficiente para pegar excesso de velocidade em trecho curto?
 *
 * Só lê dados. Não grava nada no banco nem no Traccar.
 *
 * Uso:
 *   node scripts/traccar-amostragem.mjs --listar
 *   node scripts/traccar-amostragem.mjs --device 3 --horas 2
 *   node scripts/traccar-amostragem.mjs --device 3 --de 2026-10-24T06:00 --ate 2026-10-24T18:00
 *
 * Dois caminhos para alcançar o Traccar:
 *
 *   1. Pela edge function traccar-proxy (padrão) — credenciais do Traccar ficam no
 *      `system_settings`, como o app já faz. Exige a function publicada.
 *   2. Direto, quando a máquina alcança o Traccar na rede:
 *        TRACCAR_URL=https://gps.empresa.com TRACCAR_TOKEN=xxxx node scripts/traccar-amostragem.mjs --listar
 *      ou TRACCAR_EMAIL / TRACCAR_PASSWORD no lugar do token.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://dadosfrota.apicesystem.shop";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3OTEyNTUyMCwiZXhwIjo0OTM0Nzk5MTIwLCJyb2xlIjoiYW5vbiJ9.IqWNK7emQs5KOqcKqMVaDx2V_NtE6RKYKGjAXvCUqcE";

const KNOTS_TO_KMH = 1.852;

// ─── Argumentos ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { horas: 2 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--listar") args.listar = true;
    else if (arg === "--device") args.device = argv[++i];
    else if (arg === "--horas") args.horas = Number(argv[++i]);
    else if (arg === "--de") args.de = argv[++i];
    else if (arg === "--ate") args.ate = argv[++i];
    else if (arg === "--json") args.json = true;
  }
  return args;
}

// ─── Chamada ao Traccar ──────────────────────────────────────────────────────

const TRACCAR_URL = (process.env.TRACCAR_URL || "").replace(/\/$/, "");
const TRACCAR_TOKEN = process.env.TRACCAR_TOKEN || "";
const TRACCAR_EMAIL = process.env.TRACCAR_EMAIL || "";
const TRACCAR_PASSWORD = process.env.TRACCAR_PASSWORD || "";
const modoDireto = Boolean(TRACCAR_URL);

function comoJson(texto, status, origem) {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Resposta não-JSON de ${origem} (HTTP ${status}): ${texto.slice(0, 300)}`);
  }
}

async function traccarDireto(path, params) {
  const url = new URL(`${TRACCAR_URL}/api${path}`);
  if (TRACCAR_TOKEN) url.searchParams.set("token", TRACCAR_TOKEN);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
    else url.searchParams.append(k, String(v));
  }

  const headers = { Accept: "application/json" };
  if (!TRACCAR_TOKEN && TRACCAR_EMAIL && TRACCAR_PASSWORD) {
    headers.Authorization = `Basic ${Buffer.from(`${TRACCAR_EMAIL}:${TRACCAR_PASSWORD}`).toString("base64")}`;
  }

  const res = await fetch(url, { headers });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Traccar ${res.status}: ${texto.slice(0, 300)}`);
  return comoJson(texto, res.status, "Traccar");
}

async function traccarViaProxy(path, params) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/traccar-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ path, params }),
  });
  const texto = await res.text();
  const dados = comoJson(texto, res.status, "proxy");
  if (!res.ok || dados?.error) throw new Error(dados?.error ?? `HTTP ${res.status}`);
  return dados;
}

const traccar = (path, params) =>
  modoDireto ? traccarDireto(path, params) : traccarViaProxy(path, params);

// ─── Estatística ─────────────────────────────────────────────────────────────

const percentil = (ordenados, p) =>
  ordenados.length ? ordenados[Math.min(ordenados.length - 1, Math.floor((ordenados.length - 1) * p))] : null;

const fmt = (n, casas = 1) => (n == null ? "—" : Number(n).toFixed(casas).replace(".", ","));

function analisar(posicoes) {
  const ordenadas = [...posicoes].sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));

  const intervalos = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const seg = (new Date(ordenadas[i].fixTime) - new Date(ordenadas[i - 1].fixTime)) / 1000;
    if (seg >= 0) intervalos.push(seg);
  }
  const ordenadosInt = [...intervalos].sort((a, b) => a - b);

  const velocidades = ordenadas.map((p) => (p.speed ?? 0) * KNOTS_TO_KMH);
  const emMovimento = velocidades.filter((v) => v >= 5);

  // Intervalo só entre amostras em movimento: é o que importa para pegar excesso.
  const intervalosMovimento = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = (ordenadas[i - 1].speed ?? 0) * KNOTS_TO_KMH;
    const atual = (ordenadas[i].speed ?? 0) * KNOTS_TO_KMH;
    if (anterior >= 5 && atual >= 5) {
      intervalosMovimento.push((new Date(ordenadas[i].fixTime) - new Date(ordenadas[i - 1].fixTime)) / 1000);
    }
  }
  const ordenadosMov = [...intervalosMovimento].sort((a, b) => a - b);

  const numeros = (valores) => valores.filter((v) => typeof v === "number" && Number.isFinite(v));
  const satelites = numeros(ordenadas.map((p) => p.attributes?.sat));
  const hdops = numeros(ordenadas.map((p) => p.attributes?.hdop));
  const invalidas = ordenadas.filter((p) => p.valid === false).length;

  return {
    amostras: ordenadas.length,
    primeira: ordenadas[0]?.fixTime ?? null,
    ultima: ordenadas.at(-1)?.fixTime ?? null,
    intervaloMediano: percentil(ordenadosInt, 0.5),
    intervaloP90: percentil(ordenadosInt, 0.9),
    intervaloMaximo: ordenadosInt.at(-1) ?? null,
    amostrasMovimento: emMovimento.length,
    intervaloMedianoMovimento: percentil(ordenadosMov, 0.5),
    intervaloP90Movimento: percentil(ordenadosMov, 0.9),
    velocidadeMaxima: velocidades.length ? Math.max(...velocidades) : null,
    velocidadeMediaMovimento: emMovimento.length
      ? emMovimento.reduce((s, v) => s + v, 0) / emMovimento.length
      : null,
    satelitesMediano: percentil([...satelites].sort((a, b) => a - b), 0.5),
    satelitesMinimo: satelites.length ? Math.min(...satelites) : null,
    hdopMediano: percentil([...hdops].sort((a, b) => a - b), 0.5),
    hdopMaximo: hdops.length ? Math.max(...hdops) : null,
    temSatelites: satelites.length > 0,
    temHdop: hdops.length > 0,
    invalidas,
  };
}

/** Portão de decisão da Fase 0: o intervalo entre amostras em movimento. */
function veredito(r) {
  const base = r.intervaloMedianoMovimento ?? r.intervaloMediano;
  if (base == null) {
    return {
      nivel: "sem-dado",
      texto: "Sem amostras suficientes no período. Escolha uma janela em que o veículo rodou.",
    };
  }
  if (base <= 30) {
    return {
      nivel: "ok",
      texto: `Intervalo mediano em movimento de ${fmt(base)} s — dá para detectar excesso quase instantâneo. Seguir com as fases 1 a 4 como planejado.`,
    };
  }
  if (base <= 60) {
    return {
      nivel: "parcial",
      texto: `Intervalo mediano em movimento de ${fmt(base)} s — detecta excesso sustentado, não arrancada curta. Seguir, mas com a regra de velocidade média no trecho em vez de instantânea.`,
    };
  }
  return {
    nivel: "insuficiente",
    texto: `Intervalo mediano em movimento de ${fmt(base)} s — longo demais para controle de velocidade. Antes de desenvolver, reconfigurar o rastreador para reportar por distância/ângulo (ex.: a cada 100 m ou 15°). Se não for possível, o radar fixo continua necessário nesse trecho.`,
  };
}

// ─── Saída ───────────────────────────────────────────────────────────────────

function imprimir(device, janela, r) {
  const linha = (rotulo, valor) => console.log(`  ${rotulo.padEnd(34)} ${valor}`);

  console.log(`\nDispositivo: ${device?.name ?? "?"} (id ${device?.id ?? "?"}, ${device?.uniqueId ?? "?"})`);
  console.log(`Janela: ${janela.de} → ${janela.ate}\n`);

  console.log("Amostragem");
  linha("Amostras no período", r.amostras);
  linha("Amostras em movimento (≥ 5 km/h)", r.amostrasMovimento);
  linha("Intervalo mediano (tudo)", `${fmt(r.intervaloMediano)} s`);
  linha("Intervalo mediano (em movimento)", `${fmt(r.intervaloMedianoMovimento)} s`);
  linha("Intervalo p90 (em movimento)", `${fmt(r.intervaloP90Movimento)} s`);
  linha("Maior intervalo (tudo)", `${fmt(r.intervaloMaximo)} s`);

  console.log("\nVelocidade (convertida de nós para km/h)");
  linha("Máxima registrada", `${fmt(r.velocidadeMaxima)} km/h`);
  linha("Média em movimento", `${fmt(r.velocidadeMediaMovimento)} km/h`);

  console.log("\nQualidade do sinal");
  linha("Satélites (mediana / mínimo)", r.temSatelites ? `${fmt(r.satelitesMediano, 0)} / ${fmt(r.satelitesMinimo, 0)}` : "não reportado pelo rastreador");
  linha("HDOP (mediana / máximo)", r.temHdop ? `${fmt(r.hdopMediano, 1)} / ${fmt(r.hdopMaximo, 1)}` : "não reportado pelo rastreador");
  linha("Posições marcadas inválidas", r.invalidas);

  const v = veredito(r);
  console.log(`\nVeredito [${v.nivel}]\n  ${v.texto}\n`);

  if (!r.temSatelites && !r.temHdop) {
    console.log("Observação: sem satélites/HDOP não há como descartar amostra ruim pela qualidade do sinal;");
    console.log("a regra de infração terá de se apoiar só em amostras consecutivas.\n");
  }
}

// ─── Principal ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(modoDireto ? `\nFalando direto com ${TRACCAR_URL}` : `\nFalando pelo proxy em ${SUPABASE_URL}`);

  const devices = await traccar("/devices");

  if (args.listar || !args.device) {
    console.log(`\n${devices.length} dispositivo(s) no Traccar:\n`);
    for (const d of devices) {
      console.log(`  id ${String(d.id).padEnd(5)} ${String(d.name).padEnd(28)} ${String(d.uniqueId).padEnd(20)} ${d.status}`);
    }
    if (!args.device) {
      console.log("\nRode de novo com --device <id> para o diagnóstico de amostragem.\n");
    }
    if (!args.device) return;
  }

  const ate = args.ate ? new Date(args.ate) : new Date();
  const de = args.de ? new Date(args.de) : new Date(ate.getTime() - args.horas * 3600_000);

  const posicoes = await traccar("/reports/route", {
    deviceId: String(args.device),
    from: de.toISOString(),
    to: ate.toISOString(),
  });

  const device = devices.find((d) => String(d.id) === String(args.device));
  const r = analisar(posicoes);

  if (args.json) {
    console.log(JSON.stringify({ device, de: de.toISOString(), ate: ate.toISOString(), ...r, veredito: veredito(r) }, null, 2));
    return;
  }

  imprimir(device, { de: de.toLocaleString("pt-BR"), ate: ate.toLocaleString("pt-BR") }, r);
}

main().catch((err) => {
  console.error(`\nFalhou: ${err.message}\n`);
  if (modoDireto) {
    console.error("Modo direto: confira TRACCAR_URL, token/credenciais e se a máquina alcança o servidor.\n");
  } else {
    console.error("Modo proxy. Se a mensagem foi 'function not found', a edge function traccar-proxy não está");
    console.error("publicada nesse servidor — publique com `supabase functions deploy traccar-proxy` ou rode direto:");
    console.error("  TRACCAR_URL=https://seu-traccar TRACCAR_TOKEN=xxxx node scripts/traccar-amostragem.mjs --listar\n");
  }
  process.exit(1);
});
