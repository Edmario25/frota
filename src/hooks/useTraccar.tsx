/**
 * useTraccar — integração com servidor Traccar GPS
 *
 * Faz chamadas diretas à API REST do Traccar via sessão (cookie JSESSIONID).
 * Requer que o Traccar tenha CORS configurado para a origem do app:
 *   traccar.xml: <entry key='web.origin'>http://localhost:8080</entry>
 *
 * Quando o sistema for para produção, adicionar também a URL de produção.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Tipos da API Traccar ────────────────────────────────────────────────────

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: "online" | "offline" | "unknown";
  lastUpdate: string | null;
  positionId: number;
  attributes: Record<string, any>;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  address: string | null;
  fixTime: string;
  attributes: {
    totalDistance?: number;
    fuel?: number;
    consumption?: number;
    ignition?: boolean;
    motion?: boolean;
    [key: string]: any;
  };
}

export interface TraccarSummary {
  deviceId: number;
  deviceName: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  engineHours: number;
  spentFuel: number;
}

export interface TraccarConfig {
  url: string;
  token?: string;
  email?: string;
  password?: string;
}

// ─── Funções de configuração ─────────────────────────────────────────────────

export async function loadTraccarConfig(): Promise<TraccarConfig | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("system_settings")
      .select("key, value")
      .in("key", ["traccarUrl", "traccarToken", "traccarEmail", "traccarPassword"]);

    if (error || !data || data.length === 0) return null;

    const map: Record<string, string> = {};
    for (const row of data) map[row.key] = row.value ?? "";

    if (!map.traccarUrl) return null;

    return {
      url:      map.traccarUrl.replace(/\/$/, ""),
      token:    map.traccarToken    || undefined,
      email:    map.traccarEmail    || undefined,
      password: map.traccarPassword || undefined,
    };
  } catch {
    return null;
  }
}

export async function saveTraccarConfig(config: TraccarConfig): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const rows = [
      { key: "traccarUrl",      value: config.url },
      { key: "traccarToken",    value: config.token    ?? "" },
      { key: "traccarEmail",    value: config.email    ?? "" },
      { key: "traccarPassword", value: config.password ?? "" },
    ].map(r => ({ ...r, updated_by: user.id, updated_at: new Date().toISOString() }));

    const { error } = await (supabase as any)
      .from("system_settings")
      .upsert(rows, { onConflict: "key" });

    return !error;
  } catch {
    return false;
  }
}

// ─── Autenticação via sessão Traccar ─────────────────────────────────────────
//
// Traccar usa sessão baseada em cookie (JSESSIONID).
// POST /api/session com form-urlencoded → Set-Cookie: JSESSIONID
// Todas as chamadas seguintes enviam o cookie automaticamente (credentials: "include")

async function establishSession(config: TraccarConfig): Promise<void> {
  let res: Response;

  if (config.token) {
    // Token de API: GET /api/session?token=TOKEN
    const url = new URL(`${config.url}/api/session`);
    url.searchParams.set("token", config.token);
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } else if (config.email && config.password) {
    // Email + Senha: POST /api/session com form-urlencoded
    res = await fetch(`${config.url}/api/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ email: config.email, password: config.password }).toString(),
      credentials: "include",
    });
  } else {
    throw new Error("Forneça token ou email+senha.");
  }

  if (!res.ok) {
    throw new Error(`Falha na autenticação Traccar (${res.status}). Verifique as credenciais.`);
  }
}

async function traccarGet<T>(
  config: TraccarConfig,
  path: string,
  params?: Record<string, string | string[]>
): Promise<T> {
  const url = new URL(`${config.url}/api${path}`);

  // Token como query param (funciona no /api/session e em alguns endpoints)
  if (config.token) {
    url.searchParams.set("token", config.token);
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val));
      else url.searchParams.append(k, v);
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };

  // Bearer token no header (Traccar 6.x SecurityRequestFilter)
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }
  // Basic Auth para email+senha — sem cookies, funciona cross-origin
  else if (config.email && config.password) {
    headers["Authorization"] = `Basic ${btoa(`${config.email}:${config.password}`)}`;
  }

  let res = await fetch(url.toString(), {
    headers,
    credentials: "include",
  });

  // Se 401, tenta estabelecer sessão e repetir com cookie
  if (res.status === 401) {
    await establishSession(config);
    res = await fetch(url.toString(), {
      headers,
      credentials: "include",
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Traccar ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTraccar() {

  const testConnection = useCallback(async (config: TraccarConfig): Promise<string> => {
    // traccarGet já adiciona token/?bearer/basic auth — tenta direto
    const session = await traccarGet<{ name?: string; email?: string }>(config, "/session");
    return session.name ?? session.email ?? "conectado";
  }, []);

  const getDevices = useCallback(async (config: TraccarConfig): Promise<TraccarDevice[]> => {
    return traccarGet<TraccarDevice[]>(config, "/devices");
  }, []);

  const getPositions = useCallback(async (
    config: TraccarConfig,
    deviceIds: number[]
  ): Promise<TraccarPosition[]> => {
    if (deviceIds.length === 0) return [];
    return traccarGet<TraccarPosition[]>(config, "/positions", {
      deviceId: deviceIds.map(String),
    });
  }, []);

  const getMonthlySummary = useCallback(async (
    config: TraccarConfig,
    deviceId: number,
    year: number,
    month: number
  ): Promise<TraccarSummary | null> => {
    const from = new Date(year, month - 1, 1).toISOString();
    const to   = new Date(year, month, 0, 23, 59, 59).toISOString();

    const data = await traccarGet<TraccarSummary[]>(config, "/reports/summary", {
      deviceId: String(deviceId),
      from,
      to,
    });

    return data[0] ?? null;
  }, []);

  const syncOdometer = useCallback(async (
    config: TraccarConfig,
    traccarDeviceId: number
  ): Promise<number | null> => {
    const positions = await getPositions(config, [traccarDeviceId]);
    if (!positions.length) return null;
    const totalMeters = positions[0].attributes?.totalDistance ?? null;
    if (totalMeters == null) return null;
    return Math.round(totalMeters / 1000);
  }, [getPositions]);

  const calcFuelEfficiency = useCallback(async (
    config: TraccarConfig,
    traccarDeviceId: number,
    litersInPeriod: number,
    year: number,
    month: number
  ): Promise<number | null> => {
    if (litersInPeriod <= 0) return null;
    const summary = await getMonthlySummary(config, traccarDeviceId, year, month);
    if (!summary) return null;
    const km = summary.distance / 1000;
    if (km <= 0) return null;
    return parseFloat((km / litersInPeriod).toFixed(2));
  }, [getMonthlySummary]);

  return {
    testConnection,
    getDevices,
    getPositions,
    getMonthlySummary,
    syncOdometer,
    calcFuelEfficiency,
  };
}
