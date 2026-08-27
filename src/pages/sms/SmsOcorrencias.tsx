import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Siren } from "lucide-react";
import { toast } from "sonner";

type ObraRef = { nome: string } | null;
type NearMiss = { id: string; o_que_aconteceu: string; o_que_poderia: string; local: string | null; status: string; created_at: string; obras: ObraRef };
type Acidente = { id: string; tipo: string; descricao: string; afastamento: boolean; cat_gerada: boolean; data_hora: string; obras: ObraRef };
type Pt = { id: string; tipo_pt: string; atividade: string; local: string; status: string; data_inicio: string; data_fim: string | null; obras: ObraRef };

const labels: Record<string, string> = {
  aberto: "Aberto", em_analise: "Em análise", encerrado: "Encerrado",
  aberta: "Aberta", encerrada: "Encerrada", cancelada: "Cancelada",
  acidente_tipico: "Acidente típico", doenca_ocupacional: "Doença ocupacional",
  acidente_trajeto: "Acidente de trajeto", incidente_perigoso: "Incidente perigoso",
  primeiros_socorros: "Primeiros socorros", trabalho_altura: "Trabalho em altura",
  espaco_confinado: "Espaço confinado", eletrica: "Eletricidade", icamento: "Içamento",
  trabalho_quente: "Trabalho a quente", outros: "Outros",
};

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-500" /><p className="text-sm text-muted-foreground">{text}</p></div>;
}

export default function SmsOcorrencias() {
  const [nearMiss, setNearMiss] = useState<NearMiss[]>([]);
  const [acidentes, setAcidentes] = useState<Acidente[]>([]);
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [nm, ac, pt] = await Promise.all([
      (supabase as any).from("sms_near_miss").select("id,o_que_aconteceu,o_que_poderia,local,status,created_at,obras(nome)").order("created_at", { ascending: false }),
      (supabase as any).from("sms_acidentes").select("id,tipo,descricao,afastamento,cat_gerada,data_hora,obras(nome)").order("data_hora", { ascending: false }),
      (supabase as any).from("sms_pt").select("id,tipo_pt,atividade,local,status,data_inicio,data_fim,obras(nome)").order("data_inicio", { ascending: false }),
    ]);
    const failure = [nm, ac, pt].find(result => result.error)?.error;
    if (failure) toast.error(`Não foi possível carregar as ocorrências: ${failure.message}`);
    setNearMiss((nm.data ?? []) as NearMiss[]);
    setAcidentes((ac.data ?? []) as Acidente[]);
    setPts((pt.data ?? []) as Pt[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    nearMiss: nearMiss.filter(item => item.status !== "encerrado").length,
    acidentes: acidentes.length,
    pts: pts.filter(item => item.status === "aberta").length,
    catPendente: acidentes.filter(item => item.afastamento && !item.cat_gerada).length,
  }), [nearMiss, acidentes, pts]);

  async function updateStatus(table: "sms_near_miss" | "sms_pt", id: string, status: string) {
    setBusy(id);
    const { error } = await (supabase as any).from(table).update({ status }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Situação atualizada e registrada.");
    load();
  }

  async function registrarCat(id: string) {
    setBusy(id);
    const { error } = await (supabase as any).from("sms_acidentes").update({ cat_gerada: true, cat_data: new Date().toISOString().slice(0, 10) }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Emissão da CAT registrada. Informe o número/recibo na investigação.");
    load();
  }

  return (
    <Layout>
      <div className="mx-auto max-w-screen-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">SMS / SSMA</p><h1 className="text-2xl font-bold">Ocorrências e permissões de trabalho</h1><p className="text-sm text-muted-foreground">Tratamento de quase-acidentes, acidentes, CAT e PTs.</p></div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Quase-acidentes abertos", totals.nearMiss, AlertTriangle], ["Acidentes registrados", totals.acidentes, Siren], ["CAT pendente", totals.catPendente, ShieldAlert], ["PTs abertas", totals.pts, CheckCircle2]].map(([label, value, Icon]) => (
            <div key={String(label)} className="rounded-xl border bg-card p-4"><Icon className="mb-3 h-5 w-5 text-primary" /><p className="text-2xl font-bold">{String(value)}</p><p className="text-xs text-muted-foreground">{String(label)}</p></div>
          ))}
        </div>

        <Tabs defaultValue="near-miss" className="rounded-xl border bg-card p-4">
          <TabsList className="grid w-full max-w-xl grid-cols-3"><TabsTrigger value="near-miss">Quase-acidentes</TabsTrigger><TabsTrigger value="acidentes">Acidentes</TabsTrigger><TabsTrigger value="pt">PT / PET</TabsTrigger></TabsList>
          <TabsContent value="near-miss" className="mt-4 divide-y">
            {!loading && !nearMiss.length && <Empty text="Nenhum quase-acidente registrado." />}
            {nearMiss.map(item => <div key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center"><div className="flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant={item.status === "encerrado" ? "secondary" : "destructive"}>{labels[item.status]}</Badge><span className="text-xs text-muted-foreground">{item.obras?.nome ?? "Obra"} · {dateTime(item.created_at)}</span></div><p className="font-medium">{item.o_que_aconteceu}</p><p className="text-sm text-muted-foreground">Potencial: {item.o_que_poderia}{item.local ? ` · Local: ${item.local}` : ""}</p></div><div className="flex gap-2">{item.status === "aberto" && <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => updateStatus("sms_near_miss", item.id, "em_analise")}>Iniciar análise</Button>}{item.status !== "encerrado" && <Button size="sm" disabled={busy === item.id} onClick={() => updateStatus("sms_near_miss", item.id, "encerrado")}>Encerrar</Button>}</div></div>)}
          </TabsContent>
          <TabsContent value="acidentes" className="mt-4 divide-y">
            {!loading && !acidentes.length && <Empty text="Nenhum acidente ou incidente registrado." />}
            {acidentes.map(item => <div key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center"><div className="flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="outline">{labels[item.tipo] ?? item.tipo}</Badge>{item.afastamento && <Badge variant="destructive">Com afastamento</Badge>}{item.cat_gerada ? <Badge className="bg-emerald-600">CAT emitida</Badge> : item.afastamento ? <Badge className="bg-amber-500">CAT pendente</Badge> : null}<span className="text-xs text-muted-foreground">{item.obras?.nome ?? "Obra"} · {dateTime(item.data_hora)}</span></div><p className="font-medium">{item.descricao}</p></div>{item.afastamento && !item.cat_gerada && <Button size="sm" disabled={busy === item.id} onClick={() => registrarCat(item.id)}>Registrar CAT emitida</Button>}</div>)}
          </TabsContent>
          <TabsContent value="pt" className="mt-4 divide-y">
            {!loading && !pts.length && <Empty text="Nenhuma permissão de trabalho registrada." />}
            {pts.map(item => <div key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center"><div className="flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant={item.status === "aberta" ? "default" : "secondary"}>{labels[item.status]}</Badge><Badge variant="outline">{labels[item.tipo_pt] ?? item.tipo_pt}</Badge><span className="text-xs text-muted-foreground">{item.obras?.nome ?? "Obra"} · {dateTime(item.data_inicio)}</span></div><p className="font-medium">{item.atividade}</p><p className="text-sm text-muted-foreground">Local: {item.local}</p></div>{item.status === "aberta" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => updateStatus("sms_pt", item.id, "cancelada")}>Cancelar</Button><Button size="sm" disabled={busy === item.id} onClick={() => updateStatus("sms_pt", item.id, "encerrada")}>Encerrar PT</Button></div>}</div>)}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
