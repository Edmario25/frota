import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Building2, CalendarDays, Download, FileText, Image, Landmark, LockKeyhole, TrendingUp } from "lucide-react";

type PortalData = {
  obra: { id: string; nome: string; status: string; titulo: string; mensagem: string | null };
  secoes: { cronograma: boolean; fotos: boolean; documentos: boolean; financeiro: boolean };
  progresso: number | null;
  cronograma: Array<{ id:string; codigo:string|null; descricao:string; inicio:string|null; fim:string|null; percentual:number }>;
  fotos: Array<{ id:string; url:string; thumbnail:string|null; titulo:string|null; categoria:string; data:string; destaque:boolean }>;
  documentos: Array<{ id:string; nome:string; descricao:string|null; categoria:string; url:string; tamanho_kb:number|null; data:string }>;
  atualizacoes: Array<{ id:string; titulo:string; corpo:string|null; tipo:string; data:string }>;
  financeiro: { previsto:number; realizado:number } | null;
};

const date = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "—";
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 }).format(value ?? 0);
const labels: Record<string,string> = { progresso:"Progresso", alerta:"Alerta", marco:"Marco", geral:"Informação" };

export default function PortalPublico() {
  const { token = "" } = useParams();
  const { settings } = useSystemSettings();
  const [data,setData] = useState<PortalData|null>(null);
  const [loading,setLoading] = useState(true);
  const [invalid,setInvalid] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: result, error } = await (supabase as any).rpc("get_portal_publico", {
        access_token: token, client_user_agent: navigator.userAgent,
      });
      if (!active) return;
      if (error || !result) setInvalid(true); else setData(result as PortalData);
      setLoading(false);
    })();
    return () => { active = false; };
  },[token]);

  const tabs = useMemo(() => {
    if(!data) return [];
    return [data.secoes.cronograma&&"cronograma",data.secoes.fotos&&"fotos",data.secoes.documentos&&"documentos","atualizacoes"].filter(Boolean) as string[];
  },[data]);

  if(loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/></div>;
  if(invalid||!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><Card className="max-w-md w-full"><CardContent className="py-12 text-center"><LockKeyhole className="mx-auto h-10 w-10 text-slate-400"/><h1 className="mt-4 text-xl font-bold">Acesso indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Este link é inválido, expirou ou foi desativado. Solicite um novo acesso ao responsável pela obra.</p></CardContent></Card></div>;

  const firstTab=tabs[0]??"atualizacoes";
  const percent=Number(data.progresso??0);
  const financialPercent=data.financeiro?.previsto ? Math.round((data.financeiro.realizado/data.financeiro.previsto)*100) : 0;
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b bg-slate-950 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-3">{settings.logoUrl?<img src={settings.logoUrl} alt="Logo" className="h-9 max-w-36 object-contain"/>:<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600"><Building2 className="h-5 w-5"/></div>}<div><p className="text-sm font-bold">{settings.companyName||"Ápice Gestão"}</p><p className="text-[11px] text-slate-400">Portal de acompanhamento da obra</p></div></div>
      <Badge className="border-0 bg-emerald-500/15 text-emerald-300">Acesso protegido</Badge>
    </div></header>
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 p-6 text-white shadow-lg md:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Obra acompanhada</p><h1 className="mt-2 text-2xl font-bold md:text-3xl">{data.obra.titulo}</h1>{data.obra.mensagem&&<p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">{data.obra.mensagem}</p>}<div className="mt-6 max-w-xl"><div className="mb-2 flex justify-between text-sm"><span>Avanço físico</span><strong>{percent.toFixed(1)}%</strong></div><Progress value={percent} className="h-2 bg-white/15"/></div></section>

      <div className={`grid gap-4 ${data.financeiro?"md:grid-cols-3":"md:grid-cols-2"}`}>
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-blue-50 p-3"><TrendingUp className="h-5 w-5 text-blue-600"/></div><div><p className="text-2xl font-bold">{percent.toFixed(1)}%</p><p className="text-xs text-muted-foreground">Avanço físico realizado</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-violet-50 p-3"><CalendarDays className="h-5 w-5 text-violet-600"/></div><div><p className="text-2xl font-bold">{data.atualizacoes.length}</p><p className="text-xs text-muted-foreground">Atualizações publicadas</p></div></CardContent></Card>
        {data.financeiro&&<Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-amber-50 p-3"><Landmark className="h-5 w-5 text-amber-600"/></div><div><p className="text-2xl font-bold">{financialPercent}%</p><p className="text-xs text-muted-foreground">Orçamento realizado</p></div></CardContent></Card>}
      </div>

      <Tabs defaultValue={firstTab}><TabsList className="h-auto w-full justify-start overflow-x-auto bg-white p-1 shadow-sm">
        {data.secoes.cronograma&&<TabsTrigger value="cronograma"><CalendarDays className="mr-2 h-4 w-4"/>Cronograma</TabsTrigger>}
        {data.secoes.fotos&&<TabsTrigger value="fotos"><Image className="mr-2 h-4 w-4"/>Fotos</TabsTrigger>}
        {data.secoes.documentos&&<TabsTrigger value="documentos"><FileText className="mr-2 h-4 w-4"/>Documentos</TabsTrigger>}
        <TabsTrigger value="atualizacoes"><TrendingUp className="mr-2 h-4 w-4"/>Atualizações</TabsTrigger>
      </TabsList>
        <TabsContent value="cronograma" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Etapas principais</CardTitle></CardHeader><CardContent className="space-y-4">{data.cronograma.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Cronograma ainda não publicado.</p>:data.cronograma.map(item=><div key={item.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.codigo&&`${item.codigo} · `}{item.descricao}</p><p className="mt-1 text-xs text-muted-foreground">{date(item.inicio)} até {date(item.fim)}</p></div><strong className="text-sm text-blue-700">{Number(item.percentual).toFixed(0)}%</strong></div><Progress className="mt-3 h-2" value={Number(item.percentual)}/></div>)}</CardContent></Card></TabsContent>
        <TabsContent value="fotos" className="mt-4">{data.fotos.length===0?<Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma foto publicada.</CardContent></Card>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.fotos.map(f=><a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border bg-white shadow-sm"><img src={f.thumbnail||f.url} alt={f.titulo||"Foto da obra"} className="h-52 w-full object-cover transition group-hover:scale-[1.02]"/><div className="p-3"><p className="text-sm font-semibold">{f.titulo||"Registro da obra"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{f.categoria.replaceAll("_"," ")} · {date(f.data)}</p></div></a>)}</div>}</TabsContent>
        <TabsContent value="documentos" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Documentos liberados</CardTitle></CardHeader><CardContent className="space-y-2">{data.documentos.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento publicado.</p>:data.documentos.map(d=><div key={d.id} className="flex items-center gap-3 rounded-xl border p-3"><div className="rounded-lg bg-blue-50 p-2"><FileText className="h-5 w-5 text-blue-600"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.nome}</p><p className="text-xs capitalize text-muted-foreground">{d.categoria} · {date(d.data)}</p></div><a href={d.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4"/>Baixar</Button></a></div>)}</CardContent></Card></TabsContent>
        <TabsContent value="atualizacoes" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Linha do tempo da obra</CardTitle></CardHeader><CardContent>{data.atualizacoes.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Nenhuma atualização publicada.</p>:<div className="ml-2 space-y-5 border-l-2 pl-6">{data.atualizacoes.map(a=><article key={a.id} className="relative"><span className="absolute -left-[1.93rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600"/><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{labels[a.tipo]||a.tipo}</Badge><time className="text-xs text-muted-foreground">{date(a.data)}</time></div><h3 className="mt-2 text-sm font-semibold">{a.titulo}</h3>{a.corpo&&<p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{a.corpo}</p>}</article>)}</div>}</CardContent></Card></TabsContent>
      </Tabs>
      {data.financeiro&&<Card><CardHeader><CardTitle className="text-base">Resumo financeiro autorizado</CardTitle></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Orçamento previsto</p><p className="mt-1 text-xl font-bold">{money(data.financeiro.previsto)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted-foreground">Valor realizado</p><p className="mt-1 text-xl font-bold">{money(data.financeiro.realizado)}</p></div></div></CardContent></Card>}
    </main><footer className="border-t bg-white py-5 text-center text-xs text-muted-foreground">Informações disponibilizadas exclusivamente para acompanhamento do cliente.</footer>
  </div>;
}
