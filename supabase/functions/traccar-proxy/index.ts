/**
 * Edge Function: traccar-proxy
 *
 * Lê as credenciais do Traccar direto da tabela system_settings do Supabase.
 * O usuário configura tudo pelo painel da aplicação — sem necessidade de
 * variáveis de ambiente manuais.
 *
 * Fluxo:
 *   1. Lê traccarUrl / traccarToken / traccarEmail / traccarPassword do system_settings
 *   2. Faz a requisição server-to-server ao Traccar (sem CORS)
 *   3. Retorna o JSON para o browser
 *
 * Body esperado (JSON):
 * {
 *   path: "/devices" | "/positions" | "/reports/summary" | "/session" ...
 *   params?: { deviceId: "1" | ["1","2"], from: "...", to: "..." }
 *   method?: "GET" | "POST"
 *   formBody?: string
 *   // Override temporário para testar credenciais antes de salvar:
 *   _overrideUrl?:      string
 *   _overrideToken?:    string
 *   _overrideEmail?:    string
 *   _overridePassword?: string
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Lê as credenciais do Traccar da tabela system_settings */
async function loadCredsFromDB(): Promise<{
  url: string | null;
  token: string | null;
  email: string | null;
  password: string | null;
}> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["traccarUrl", "traccarToken", "traccarEmail", "traccarPassword"]);

    const map: Record<string, string> = {};
    for (const row of (data ?? [])) map[row.key] = row.value ?? "";

    return {
      url:      map.traccarUrl      || null,
      token:    map.traccarToken    || null,
      email:    map.traccarEmail    || null,
      password: map.traccarPassword || null,
    };
  } catch {
    return { url: null, token: null, email: null, password: null };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      path,
      params,
      method = "GET",
      formBody,
      _overrideUrl,
      _overrideToken,
      _overrideEmail,
      _overridePassword,
    } = body;

    if (!path) {
      return new Response(
        JSON.stringify({ error: "Campo 'path' obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Credenciais: override (teste na tela de config) > system_settings ──
    let TRACCAR_URL: string | null = _overrideUrl || null;
    let TRACCAR_TOKEN: string | null = _overrideToken || null;
    let TRACCAR_EMAIL: string | null = _overrideEmail || null;
    let TRACCAR_PASSWORD: string | null = _overridePassword || null;

    // Se não veio override, lê do banco
    if (!TRACCAR_URL) {
      const creds = await loadCredsFromDB();
      TRACCAR_URL     = creds.url;
      TRACCAR_TOKEN   = creds.token;
      TRACCAR_EMAIL   = creds.email;
      TRACCAR_PASSWORD = creds.password;
    }

    TRACCAR_URL = TRACCAR_URL?.replace(/\/$/, "") ?? null;

    if (!TRACCAR_URL) {
      return new Response(
        JSON.stringify({ error: "Traccar não configurado. Acesse Configurações → GPS / Traccar e salve as credenciais." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Monta URL ────────────────────────────────────────────────────────
    const url = new URL(`${TRACCAR_URL}/api${path}`);

    if (TRACCAR_TOKEN) url.searchParams.set("token", TRACCAR_TOKEN);

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) {
          (v as any[]).forEach((item) => url.searchParams.append(k, String(item)));
        } else {
          url.searchParams.append(k, String(v));
        }
      }
    }

    // ── Headers de autenticação ──────────────────────────────────────────
    const headers: Record<string, string> = { Accept: "application/json" };

    if (!TRACCAR_TOKEN && TRACCAR_EMAIL && TRACCAR_PASSWORD) {
      headers["Authorization"] = `Basic ${btoa(`${TRACCAR_EMAIL}:${TRACCAR_PASSWORD}`)}`;
    }

    // ── Requisição para o Traccar ────────────────────────────────────────
    let fetchOptions: RequestInit = { method, headers };

    if (method === "POST" && formBody) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchOptions = { method: "POST", headers, body: formBody };
    }

    const traccarRes = await fetch(url.toString(), fetchOptions);

    if (!traccarRes.ok) {
      const errText = await traccarRes.text().catch(() => traccarRes.statusText);
      return new Response(
        JSON.stringify({ error: `Traccar ${traccarRes.status}: ${errText}` }),
        { status: traccarRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await traccarRes.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Erro interno no proxy" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
