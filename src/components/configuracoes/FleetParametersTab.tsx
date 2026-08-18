import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Car, Gauge, Wrench, AlertTriangle, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function FleetParametersTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [defaultKmLimit, setDefaultKmLimit] = useState("2000");
  const [kmAlertPercent, setKmAlertPercent] = useState("80");
  const [maintenanceIntervalKm, setMaintenanceIntervalKm] = useState("10000");
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState("180");
  const [docAlertDays, setDocAlertDays] = useState("30");
  const [autoCreateCycles, setAutoCreateCycles] = useState(true);
  const [autoCloseExpiredCycles, setAutoCloseExpiredCycles] = useState(true);

  // ─── Carregar do Supabase ao montar ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("fleet_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (data) {
        setDefaultKmLimit(String(data.limite_km_mensal_padrao));
        setKmAlertPercent(String(data.alerta_km_percentual));
        setMaintenanceIntervalKm(String(data.intervalo_manutencao_km));
        setMaintenanceIntervalDays(String(data.intervalo_manutencao_dias));
        setDocAlertDays(String(data.alerta_documentacao_dias));
        setAutoCreateCycles(data.criar_ciclos_auto);
        setAutoCloseExpiredCycles(data.fechar_ciclos_expirados);
      } else {
        // Migração: se ainda há valores em localStorage, usa como ponto de partida
        const saved = localStorage.getItem("fleet_parameters");
        if (saved) {
          try {
            const p = JSON.parse(saved);
            if (p.defaultKmLimit) setDefaultKmLimit(String(p.defaultKmLimit));
            if (p.kmAlertPercent) setKmAlertPercent(String(p.kmAlertPercent));
            if (p.maintenanceIntervalKm) setMaintenanceIntervalKm(String(p.maintenanceIntervalKm));
            if (p.maintenanceIntervalDays) setMaintenanceIntervalDays(String(p.maintenanceIntervalDays));
            if (p.docAlertDays) setDocAlertDays(String(p.docAlertDays));
            if (p.autoCreateCycles !== undefined) setAutoCreateCycles(p.autoCreateCycles);
            if (p.autoCloseExpiredCycles !== undefined) setAutoCloseExpiredCycles(p.autoCloseExpiredCycles);
          } catch {
            // ignore parse error
          }
        }
      }

      setLoading(false);
    })();
  }, []);

  // ─── Salvar no Supabase ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("fleet_config").upsert({
        id: 1,
        limite_km_mensal_padrao: parseInt(defaultKmLimit) || 2000,
        alerta_km_percentual: parseInt(kmAlertPercent) || 80,
        intervalo_manutencao_km: parseInt(maintenanceIntervalKm) || 10000,
        intervalo_manutencao_dias: parseInt(maintenanceIntervalDays) || 180,
        alerta_documentacao_dias: parseInt(docAlertDays) || 30,
        criar_ciclos_auto: autoCreateCycles,
        fechar_ciclos_expirados: autoCloseExpiredCycles,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Remove dados antigos do localStorage (migração completa)
      localStorage.removeItem("fleet_parameters");
      toast.success("Parâmetros de frota salvos com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message ?? "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KM Parameters */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Gauge className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Controle de Quilometragem</CardTitle>
              <CardDescription>Defina limites e alertas de km para os veículos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-km">Limite Km Mensal Padrão</Label>
              <div className="relative">
                <Input
                  id="default-km"
                  type="number"
                  value={defaultKmLimit}
                  onChange={(e) => setDefaultKmLimit(e.target.value)}
                  className="rounded-xl pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">km</span>
              </div>
              <p className="text-xs text-muted-foreground">Aplicado a novos veículos cadastrados</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="km-alert">Alerta de Km (%)</Label>
              <div className="relative">
                <Input
                  id="km-alert"
                  type="number"
                  value={kmAlertPercent}
                  onChange={(e) => setKmAlertPercent(e.target.value)}
                  className="rounded-xl pr-8"
                  min="50"
                  max="100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Percentual do limite para gerar alerta no app do motorista</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Criação Automática de Ciclos</p>
                <p className="text-xs text-muted-foreground">Criar ciclos mensais de km automaticamente</p>
              </div>
              <Switch checked={autoCreateCycles} onCheckedChange={setAutoCreateCycles} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Fechar Ciclos Expirados</p>
                <p className="text-xs text-muted-foreground">Fechar ciclos de km automaticamente ao expirar</p>
              </div>
              <Switch checked={autoCloseExpiredCycles} onCheckedChange={setAutoCloseExpiredCycles} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Parameters */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Manutenção Preventiva</CardTitle>
              <CardDescription>Configure intervalos para manutenções programadas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maint-km">Intervalo por Km</Label>
              <div className="relative">
                <Input
                  id="maint-km"
                  type="number"
                  value={maintenanceIntervalKm}
                  onChange={(e) => setMaintenanceIntervalKm(e.target.value)}
                  className="rounded-xl pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">km</span>
              </div>
              <p className="text-xs text-muted-foreground">Km entre manutenções preventivas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maint-days">Intervalo por Tempo</Label>
              <div className="relative">
                <Input
                  id="maint-days"
                  type="number"
                  value={maintenanceIntervalDays}
                  onChange={(e) => setMaintenanceIntervalDays(e.target.value)}
                  className="rounded-xl pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">dias</span>
              </div>
              <p className="text-xs text-muted-foreground">Dias entre manutenções preventivas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Alert */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Alertas de Documentação</CardTitle>
              <CardDescription>Configure antecedência dos alertas de vencimento</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="doc-alert">Antecedência do Alerta</Label>
            <div className="relative">
              <Input
                id="doc-alert"
                type="number"
                value={docAlertDays}
                onChange={(e) => setDocAlertDays(e.target.value)}
                className="rounded-xl pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">dias</span>
            </div>
            <p className="text-xs text-muted-foreground">Dias antes do vencimento para exibir alerta</p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl px-6">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar Parâmetros"}
        </Button>
      </div>
    </div>
  );
}
