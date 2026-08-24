import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2,
  ClipboardCheck, FileCheck2, FileWarning, FlaskConical, RefreshCw,
  ShieldCheck, Truck, Users,
} from "lucide-react";

type Obra = { id: string; nome: string };
type Nc = {
  id: string; numero_nc: number; titulo: string; status: string; gravidade: string;
  data_limite: string | null; data_ocorrencia: string; obra_id: string;
  obras?: { nome: string } | null;
};

const modules = [
  { title: "Não Conformidades", description: "Causa raiz, ações corretivas, prazos e verificação de eficácia.", icon: FileWarning, status: "Disponível", url: "/nao-conformidades" },
  { title: "Inspeção de Serviços", description: "FVS, critérios de aceitação, evidências e liberação por etapa.", icon: ClipboardCheck, status: "Disponível", url: "/qualidade/servicos" },
  { title: "Controle de Materiais", description: "Recebimento, lotes, certificados, ensaios e rastreabilidade de aplicação.", icon: FlaskConical, status: "Disponível", url: "/qualidade/materiais" },
  { title: "Documentos da Qualidade", description: "PES, procedimentos, formulários, revisões e distribuição controlada.", icon: FileCheck2, status: "Disponível", url: "/qualidade/documentos" },
  { title: "Auditorias", description: "Plano de auditoria, constatações, evidências e acompanhamento das ações.", icon: ShieldCheck, status: "Disponível", url: "/qualidade/auditorias" },
  { title: "Avaliação de Fornecedores", description: "Critérios, notas, ocorrências e qualificação por desempenho.", icon: Truck, status: "Disponível", url: "/qualidade/fornecedores" },
];

export default function Qualidade() {
  const navigate = useNavigate();
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("todas");
  const [ncs, setNcs] = useState<Nc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [obrasResult, ncResult] = await Promise.all([
      (supabase as any).from("obras").select("id,nome").order("nome"),
      (supabase as any).from("nao_conformidades").select("id,numero_nc,titulo,status,gravidade,data_limite,data_ocorrencia,obra_id,obras(nome)").order("data_ocorrencia", { ascending: false }),
    ]);
    setObras(obrasResult.data ?? []);
    setNcs(ncResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => obraId === "todas" ? ncs : ncs.filter(nc => nc.obra_id === obraId), [ncs, obraId]);
  const today = new Date().toISOString().slice(0, 10);
  const abertas = filtered.filter(nc => !["encerrada", "cancelada"].includes(nc.status));
  const atrasadas = abertas.filter(nc => nc.data_limite && nc.data_limite < today);
  const criticas = abertas.filter(nc => nc.gravidade === "critica");
  const encerradas = filtered.filter(nc => nc.status === "encerrada");
  const taxaConclusao = filtered.length ? Math.round((encerradas.length / filtered.length) * 100) : 0;
  const recentes = abertas.slice(0, 5);

  return <Layout>
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1"><ShieldCheck className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-widest">Sistema de Gestão da Qualidade</span></div>
          <h1 className="text-2xl font-bold tracking-tight">Qualidade</h1>
          <p className="text-sm text-muted-foreground">Controle integrado da conformidade dos materiais, serviços e processos das obras.</p>
        </div>
        <div className="flex gap-2">
          <Select value={obraId} onValueChange={setObraId}><SelectTrigger className="w-64"><Building2 className="h-4 w-4 mr-2"/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas as obras</SelectItem>{obras.map(obra => <SelectItem key={obra.id} value={obra.id}>{obra.nome}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["NCs abertas", abertas.length, FileWarning, "text-blue-600", "bg-blue-50"],
          ["Atrasadas", atrasadas.length, AlertTriangle, "text-red-600", "bg-red-50"],
          ["Críticas", criticas.length, ShieldCheck, "text-orange-600", "bg-orange-50"],
          ["Encerradas", encerradas.length, CheckCircle2, "text-emerald-600", "bg-emerald-50"],
          ["Taxa de conclusão", `${taxaConclusao}%`, BarChart3, "text-violet-600", "bg-violet-50"],
        ].map(([label, value, Icon, color, bg]) => <Card key={String(label)}><CardContent className="p-4"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`}/></div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Módulos da Qualidade</CardTitle><p className="text-xs text-muted-foreground mt-1">Estrutura preparada para ISO 9001 e PBQP-H/SiAC.</p></div><Badge variant="outline">SGQ</Badge></div></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {modules.map(module => <button key={module.title} disabled={!module.url} onClick={() => module.url && navigate(module.url)} className="group rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/30 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-transparent">
              <div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><module.icon className="h-4 w-4 text-primary"/></div><Badge variant={module.url ? "default" : "secondary"} className="text-[10px]">{module.status}</Badge></div>
              <h3 className="mt-3 text-sm font-semibold">{module.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{module.description}</p>{module.url && <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">Acessar <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1"/></span>}
            </button>)}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Desempenho das tratativas</CardTitle></CardHeader><CardContent><div className="flex justify-between text-sm mb-2"><span>NCs encerradas</span><strong>{taxaConclusao}%</strong></div><Progress value={taxaConclusao}/><div className="mt-4 grid grid-cols-2 gap-3 text-center"><div className="rounded-lg bg-muted/50 p-3"><p className="text-lg font-bold">{abertas.length}</p><p className="text-[11px] text-muted-foreground">Em tratamento</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-lg font-bold">{atrasadas.length}</p><p className="text-[11px] text-muted-foreground">Fora do prazo</p></div></div></CardContent></Card>
          <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Pendências recentes</CardTitle><Button variant="ghost" size="sm" onClick={() => navigate("/nao-conformidades")}>Ver todas</Button></div></CardHeader><CardContent className="space-y-2">{recentes.length === 0 ? <div className="py-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500"/><p className="mt-2 text-sm font-medium">Nenhuma NC em aberto</p></div> : recentes.map(nc => <button key={nc.id} onClick={() => navigate("/nao-conformidades")} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/40"><div className={`h-2 w-2 rounded-full ${nc.gravidade === "critica" ? "bg-red-500" : nc.gravidade === "grave" ? "bg-orange-500" : "bg-amber-400"}`}/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">NC-{String(nc.numero_nc).padStart(4, "0")} · {nc.titulo}</p><p className="truncate text-[11px] text-muted-foreground">{nc.obras?.nome ?? "Obra"}</p></div>{nc.data_limite && nc.data_limite < today && <Badge variant="destructive" className="text-[9px]">Atrasada</Badge>}</button>)}</CardContent></Card>
        </div>
      </div>

      <Card className="border-dashed"><CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2"><Users className="h-5 w-5 text-slate-600"/></div><div><p className="text-sm font-semibold">Sistema de Gestão da Qualidade operacional</p><p className="text-xs text-muted-foreground">Centralize inspeções, recebimentos, documentos, auditorias, fornecedores e não conformidades com rastreabilidade por obra.</p></div></div><Badge variant="outline">6 módulos</Badge></CardContent></Card>
    </div>
  </Layout>;
}
