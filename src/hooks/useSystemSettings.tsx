import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SystemSettings {
  companyName: string;
  logoUrl: string;
  iconUrl: string;
}

const STORAGE_KEY = "fleet_settings";
const SETTINGS_KEYS = ["companyName", "logoUrl", "iconUrl"];

function readLocalSettings(): Partial<SystemSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalSettings(partial: Partial<SystemSettings>) {
  try {
    const existing = readLocalSettings();
    const merged = { ...existing, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
}

/** Carrega as settings de branding do Supabase e sincroniza com o localStorage */
export async function loadBrandingFromDB(): Promise<Partial<SystemSettings>> {
  try {
    const { data, error } = await (supabase as any)
      .from("system_settings")
      .select("key, value")
      .in("key", SETTINGS_KEYS);

    if (error || !data || data.length === 0) return {};

    const result: Record<string, string> = {};
    for (const row of data) {
      result[row.key] = row.value ?? "";
    }

    // Sincronizar com localStorage para uso offline / próximos renders
    writeLocalSettings(result as Partial<SystemSettings>);

    // Disparar evento para que Sidebar e outros componentes atualizem
    window.dispatchEvent(new Event("fleet-settings-updated"));

    return result as Partial<SystemSettings>;
  } catch {
    return {};
  }
}

/** Salva settings de branding no Supabase (upsert por chave) — nunca lança exceção */
export async function saveBrandingToDB(settings: Partial<SystemSettings>): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const rows = Object.entries(settings)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({
        key,
        value: value ?? "",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }));

    const { error } = await (supabase as any)
      .from("system_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      console.warn("saveBrandingToDB: erro ao salvar no Supabase (tabela pode não existir ainda):", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("saveBrandingToDB falhou silenciosamente:", err);
    return false;
  }
}

/** Hook para usar as settings de branding em componentes React */
export function useSystemSettings() {
  const [settings, setSettings] = useState<Partial<SystemSettings>>(readLocalSettings);

  const reload = useCallback(async () => {
    const fromDB = await loadBrandingFromDB();
    if (Object.keys(fromDB).length > 0) {
      setSettings(s => ({ ...s, ...fromDB }));
    }
  }, []);

  useEffect(() => {
    reload();

    const onUpdate = () => setSettings(readLocalSettings());
    window.addEventListener("fleet-settings-updated", onUpdate);
    return () => window.removeEventListener("fleet-settings-updated", onUpdate);
  }, []);

  return { settings, reload };
}
