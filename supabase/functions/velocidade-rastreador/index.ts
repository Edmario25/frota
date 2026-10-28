/**
 * Edge Function: velocidade-rastreador
 *
 * Alimenta o controle de velocidade por zona GPS com as posições que o Traccar
 * já recebe da frota. Duas portas, uma única regra no banco:
 *
 *   1. Varredura (padrão)  — body {} ou { modo: "varredura", minutos?: 10 }
 *      Para cada veículo com rastreador, busca as posições da janela em
 *      /reports/route e manda em lote para sms_registrar_amostras_rastreador.
 *      Reprocessar a mesma janela é seguro: o banco ignora fix já processado.
 *
 *   2. Webhook — body { event, position, device } vindo do event forwarding do
 *      Traccar. Caminho rápido; a varredura serve de rede de segurança.
 *
 * A velocidade do Traccar vem em NÓS. A conversão para km/h acontece aqui, uma
 * única vez, antes de qualquer comparação com limite.
 *
 * Agendamento sugerido: a cada 1 minuto, com minutos = 10 (a sobreposição é de
 * graça e cobre falha momentânea de rede).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOTS_TO_KMH = 1.852;
const JANELA_PADRAO_MIN = 10;
const JANELA_MAXIMA_MIN = 120;

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

// ─── Credenciais do Traccar (mesma fonte do traccar-proxy) ───────────────────

async function credenciaisTraccar() {
  const { data } = await admin()
    .from("system_settings")
    .select("key, value")
    .in("key", ["traccarUrl", "traccarToken", "traccarEmail", "traccarPassword"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";

  return {
    url: (map.traccarUrl || "").replace(/\/$/, ""),
    token: map.traccarToken || "",
    email: map.traccarEmail || "",
    password: map.traccarPassword || "",
  };
}

async function traccar(path: string, params: Record<string, string>) {
  const cred = await credenciaisTraccar();
  if (!cred.url) throw new Error("Traccar não configurado em Configurações → GPS / Traccar.");

  const url = new URL(`${cred.url}/api${path}`);
  if (cred.token) url.searchParams.set("token", cred.token);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (!cred.token && cred.email && cred.password) {
    headers.Authorization = `Basic ${btoa(`${cred.email}:${cred.password}`)}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const texto = await res.text().catch(() => res.statusText);
    throw new Error(`Traccar ${res.status}: ${texto.slice(0, 300)}`);
  }
  return await res.json();
}

// ─── Conversão de uma posição do Traccar para a amostra do banco ─────────────

function paraAmostra(posicao: any) {
  return {
    lat: posicao.latitude,
    lng: posicao.longitude,
    kmh: Number(((posicao.speed ?? 0) * KNOTS_TO_KMH).toFixed(1)),
    t: posicao.fixTime ?? posicao.deviceTime ?? posicao.serverTime,
    sat: posicao.attributes?.sat ?? null,
    hdop: posicao.attributes?.hdop ?? null,
    valida: posicao.valid !== false,
  };
}

// ─── Medição: km e horas percorridos na janela ───────────────────────────────
// O Traccar acumula distância (metros) e horas de motor (ms) por dispositivo.
// Interessa o quanto andou DENTRO da janela já processada — a diferença entre a
// primeira e a última posição. Delta evita herdar o acumulado de um rastreador
// que veio de outro veículo.

function medicaoDaJanela(posicoes: any[]) {
  const dist = posicoes
    .map((p) => p.attributes?.totalDistance)
    .filter((v) => typeof v === "number");
  const horas = posicoes
    .map((p) => p.attributes?.hours)
    .filter((v) => typeof v === "number");
  const odometro = posicoes
    .map((p) => p.attributes?.odometer)
    .filter((v) => typeof v === "number" && v > 0);

  const delta = (v: number[]) => (v.length >= 2 ? v[v.length - 1] - v[0] : 0);
  const km = delta(dist) / 1000;
  const h = delta(horas) / 3_600_000;

  return {
    km_delta: km > 0 ? Number(km.toFixed(1)) : null,
    horas_delta: h > 0 ? Number(h.toFixed(2)) : null,
    // `odometer` é o painel do veículo, quando o equipamento reporta.
    km_absoluto: odometro.length ? Math.round(odometro[odometro.length - 1] / 1000) : null,
  };
}

// ─── Porta 1: varredura ──────────────────────────────────────────────────────

async function varredura(minutos: number) {
  const db = admin();
  const ate = new Date();
  const janela = Math.min(Math.max(minutos, 1), JANELA_MAXIMA_MIN);

  const { data: veiculos, error } = await db
    .from("vehicles")
    .select("id, placa, traccar_device_id")
    .not("traccar_device_id", "is", null);

  if (error) throw new Error(`Falha ao listar veículos: ${error.message}`);

  // Último fix já processado: evita puxar janela maior do que o necessário.
  const { data: estados } = await db
    .from("sms_rastreador_estado")
    .select("vehicle_id, ultimo_fix_em");
  const ultimoFix = new Map((estados ?? []).map((e: any) => [e.vehicle_id, e.ultimo_fix_em]));

  const resultado: any[] = [];

  for (const v of veiculos ?? []) {
    const desdeEstado = ultimoFix.get(v.id) ? new Date(ultimoFix.get(v.id)!) : null;
    const limiteJanela = new Date(ate.getTime() - janela * 60_000);
    const de = desdeEstado && desdeEstado > limiteJanela ? desdeEstado : limiteJanela;

    try {
      const posicoes = await traccar("/reports/route", {
        deviceId: String(v.traccar_device_id),
        from: de.toISOString(),
        to: ate.toISOString(),
      });

      if (!Array.isArray(posicoes) || posicoes.length === 0) {
        resultado.push({ placa: v.placa, amostras: 0 });
        continue;
      }

      const amostras = posicoes.map(paraAmostra).filter((a: any) => a.t && a.lat != null && a.lng != null);

      const { data: resposta, error: erroRpc } = await db.rpc("sms_registrar_amostras_rastreador", {
        p_device_id: v.traccar_device_id,
        p_amostras: amostras,
      });

      if (erroRpc) throw new Error(erroRpc.message);

      // Mesma varredura alimenta o gatilho do plano de manutenção: sem isso, km
      // e horímetro só mudam quando alguém digita.
      const medicao = medicaoDaJanela(posicoes);
      let medicaoAplicada: any = null;
      if (medicao.km_delta || medicao.horas_delta || medicao.km_absoluto) {
        const { data: med, error: erroMed } = await db.rpc("frota_atualizar_medicao", {
          p_device_id: v.traccar_device_id,
          p_km_delta: medicao.km_delta,
          p_horas_delta: medicao.horas_delta,
          p_km_absoluto: medicao.km_absoluto,
        });
        // Falha na medição não invalida as amostras de velocidade já gravadas.
        medicaoAplicada = erroMed ? { erro: erroMed.message } : med;
      }

      resultado.push({ placa: v.placa, ...resposta, medicao: medicaoAplicada });
    } catch (e: any) {
      // Um veículo com problema não pode derrubar a varredura dos outros.
      resultado.push({ placa: v.placa, erro: e.message });
    }
  }

  // Evento que ficou aberto porque o veículo saiu da zona ou perdeu sinal.
  const { data: fechados } = await db.rpc("sms_fechar_eventos_velocidade", { p_ocioso_seg: 180 });

  return {
    modo: "varredura",
    janela_min: janela,
    veiculos: resultado.length,
    eventos_fechados_por_ociosidade: fechados ?? 0,
    detalhe: resultado,
  };
}

// ─── Porta 2: webhook de evento do Traccar ───────────────────────────────────

async function webhook(body: any) {
  const posicao = body.position;
  const deviceId = body.device?.id ?? posicao?.deviceId;

  if (!posicao || !deviceId) {
    return { modo: "webhook", ignorado: "payload sem position/device" };
  }

  const { data, error } = await admin().rpc("sms_registrar_amostras_rastreador", {
    p_device_id: deviceId,
    p_amostras: [paraAmostra(posicao)],
  });

  if (error) throw new Error(error.message);

  return { modo: "webhook", evento: body.event?.type ?? null, resultado: data };
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const resultado = body?.position || body?.event
      ? await webhook(body)
      : await varredura(Number(body?.minutos) || JANELA_PADRAO_MIN);

    return json({ ok: true, ...resultado });
  } catch (err: any) {
    return json({ ok: false, erro: err?.message ?? "Erro interno" }, 500);
  }
});
