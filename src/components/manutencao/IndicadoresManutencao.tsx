/**
 * Indicadores de manutenção.
 *
 * Os blocos anteriores produziram o dado (plano, vencimento, OS com peça, mão de
 * obra e tempo de oficina). Aqui ele vira número de decisão: o plano está sendo
 * cumprido, quanto custa cada km, quanto tempo a frota passa parada e o quanto
 * ainda é corretiva.
 *
 * Cada card diz como foi calculado — e avisa quando o número é bonito por falta
 * de dado, não por desempenho. Indicador sem a origem do cálculo é discussão de
 * reunião, não gestão.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity, AlertTriangle, CalendarRange, Gauge, Loader2, RefreshCw, TrendingDown, Wrench,
} from "lucide-react";
import { toast } from "sonner";

type Indicadores = {
  previstas: number;
  concluidas: number;
  concluidas_no_prazo: number;
  aderencia_pct: number | null;
  vencidas_hoje: number;
  custo_total: number;
  custo_preventiva: number;
  custo_corretiva: number;
  corretiva_pct_custo: number | null;
  ordens_preventivas: number;
  ordens_corretivas: number;
  km_rodado: number;
  custo_km_frota: number;
  custo_por_km: number | null;
  horas_rodadas: number;
  custo_hora_frota: number;
  custo_por_hora: number | null;
  horas_parado: number;
  veiculos: number;
  disponibilidade_pct: number | null;
};

type PorVeiculo = {
  vehicle_id: string;
  placa: string;
  marca: string;
  modelo: string;
  tipo_medicao: string;
  ordens: number;
  corretivas: number;
  custo: number;
  km_rodado: number;
  custo_por_km: number | null;
  horas_rodadas: number;
  custo_por_hora: number | null;
  horas_parado: number;
  vencidas: number;
};

const brl = (v: number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (v: number | null, casas = 0) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const pct = (v: number | null) => (v == null ? "—" : `${num(v, 1)}%`);

const hoje = () => new Date().toISOString().slice(0, 10);

const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Faixa de cor por meta. Verde não quer dizer bom em absoluto: quer dizer
 *  dentro da faixa que o próprio parque aceita. */
const cor = (valor: number | null, bom: number, ruim: number, maiorMelhor = true) => {
  if (valor == null) return "text-muted-foreground";
  const ok = maiorMelhor ? valor >= bom : valor <= bom;
  const mal = maiorMelhor ? valor < ruim : valor > ruim;
  if (ok) return "text-green-600";
  if (mal) return "text-destructive";
  return "text-amber-600";
};

export function IndicadoresManutencao() {
  const [inicio, setInicio] = useState(diasAtras(90));
  const [fim, setFim] = useState(hoje());
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [veiculos, setVeiculos] = useState<PorVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [geral, porVeiculo] = await Promise.all([
        supabase.rpc("manutencao_indicadores", { p_inicio: inicio, p_fim: fim, p_obra_id: null }),
        supabase.rpc("manutencao_indicadores_veiculo", { p_inicio: inicio, p_fim: fim }),
      ]);
      if (geral.error) throw geral.error;
      if (porVeiculo.error) throw porVeiculo.error;

      setDados(((geral.data as Indicadores[]) ?? [])[0] ?? null);
      setVeiculos((porVeiculo.data as PorVeiculo[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível calcular os indicadores");
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (carregando && !dados) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calculando...
      </div>
    );
  }

  const semMedicao = !dados || (dados.km_rodado === 0 && dados.horas_rodadas === 0);
  const semOficina = !dados || dados.horas_parado === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ind-inicio" className="text-xs">Início</Label>
          <Input id="ind-inicio" type="date" value={inicio} className="w-40"
                 onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ind-fim" className="text-xs">Fim</Label>
          <Input id="ind-fim" type="date" value={fim} className="w-40"
                 onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
                  onClick={() => { setInicio(diasAtras(30)); setFim(hoje()); }}>
            30 dias
          </Button>
          <Button variant="outline" size="sm"
                  onClick={() => { setInicio(diasAtras(90)); setFim(hoje()); }}>
            90 dias
          </Button>
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aderência ao plano</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cor(dados?.aderencia_pct ?? null, 90, 70)}`}>
              {pct(dados?.aderencia_pct ?? null)}
            </div>
            <p className="text-xs text-muted-foreground">
              {num(dados?.concluidas_no_prazo ?? 0)} no prazo de {num(dados?.previstas ?? 0)} previstas
              {(dados?.previstas ?? 0) === 0 && " - nenhuma manutenção de plano no período"}
            </p>
            {(dados?.vencidas_hoje ?? 0) > 0 && (
              <Badge variant="destructive" className="mt-2">
                {num(dados?.vencidas_hoje ?? 0)} vencidas hoje
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo por km e por hora</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{brl(dados?.custo_por_km ?? null)}</div>
            <p className="text-xs text-muted-foreground">
              {brl(dados?.custo_km_frota ?? 0)} em {num(dados?.km_rodado ?? 0)} km
            </p>
            <div className="mt-2 border-t pt-2">
              <div className="text-lg font-bold">{brl(dados?.custo_por_hora ?? null)}<span className="ml-1 text-xs font-normal text-muted-foreground">/h</span></div>
              <p className="text-xs text-muted-foreground">
                {brl(dados?.custo_hora_frota ?? 0)} em {num(dados?.horas_rodadas ?? 0, 1)} h de equipamento
              </p>
            </div>
            {semMedicao && (
              <p className="mt-2 text-xs text-amber-600">
                Sem medição no período: o ciclo do veículo precisa estar aberto.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponibilidade</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cor(dados?.disponibilidade_pct ?? null, 95, 85)}`}>
              {pct(dados?.disponibilidade_pct ?? null)}
            </div>
            <p className="text-xs text-muted-foreground">
              {num(dados?.horas_parado ?? 0, 1)} h de oficina em {num(dados?.veiculos ?? 0)} veículos
            </p>
            {semOficina && (
              <p className="mt-2 text-xs text-amber-600">
                100% aqui é ausência de dado: preencha entrada e saída da oficina na OS.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Corretiva no custo</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cor(dados?.corretiva_pct_custo ?? null, 30, 50, false)}`}>
              {pct(dados?.corretiva_pct_custo ?? null)}
            </div>
            <p className="text-xs text-muted-foreground">
              {num(dados?.ordens_corretivas ?? 0)} corretivas x {num(dados?.ordens_preventivas ?? 0)} preventivas
            </p>
            <p className="text-xs text-muted-foreground">
              {brl(dados?.custo_corretiva ?? 0)} de {brl(dados?.custo_total ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" /> Veículos por custo de manutenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          {veiculos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum veículo ativo no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Veículo</th>
                    <th className="py-2 pr-3 text-right">OS</th>
                    <th className="py-2 pr-3 text-right">Corretivas</th>
                    <th className="py-2 pr-3 text-right">Custo</th>
                    <th className="py-2 pr-3 text-right">Rodagem</th>
                    <th className="py-2 pr-3 text-right">Custo unit.</th>
                    <th className="py-2 pr-3 text-right">H parado</th>
                    <th className="py-2 text-right">Vencidas</th>
                  </tr>
                </thead>
                <tbody>
                  {veiculos.map((v) => (
                    <tr key={v.vehicle_id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{v.placa}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{v.marca} {v.modelo}</span>
                      </td>
                      <td className="py-2 pr-3 text-right">{num(v.ordens)}</td>
                      <td className="py-2 pr-3 text-right">
                        {v.corretivas > 0 ? <span className="text-amber-600">{num(v.corretivas)}</span> : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">{brl(v.custo)}</td>
                      <td className="py-2 pr-3 text-right">
                        {v.tipo_medicao === "horimetro"
                          ? (v.horas_rodadas > 0 ? `${num(v.horas_rodadas, 1)} h` : "—")
                          : (v.km_rodado > 0 ? `${num(v.km_rodado)} km` : "—")}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {v.tipo_medicao === "horimetro"
                          ? (v.custo_por_hora != null ? `${brl(v.custo_por_hora)}/h` : "—")
                          : (v.custo_por_km != null ? `${brl(v.custo_por_km)}/km` : "—")}
                      </td>
                      <td className="py-2 pr-3 text-right">{v.horas_parado > 0 ? num(v.horas_parado, 1) : "—"}</td>
                      <td className="py-2 text-right">
                        {v.vencidas > 0 ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> {num(v.vencidas)}
                          </Badge>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Aderência conta só manutenção nascida de plano, comparando a data realizada com a agendada.
        Custo por km conta só veículo medido em quilômetro, e custo por hora só equipamento com
        horímetro — cada um dividido pelo custo da sua própria turma, porque uma escavadeira que
        roda 20 km e trabalha 180 h destruiria o custo por km da frota. Disponibilidade usa as
        horas de oficina das OS sobre a frota ativa.
      </p>
    </div>
  );
}
