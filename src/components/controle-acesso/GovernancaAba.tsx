import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Alerta={tipo:string;severidade:"alta"|"media"|"baixa";quantidade:number;descricao:string};
type Revisao={id:string;titulo:string;referencia:string;status:string;created_at:string};
type Item={id:string;review_id:string;assignment_id:string|null;user_id:string;profile_id:string;decisao:string|null;observacao:string|null;access_profiles?:{nome:string}|null};
type Usuario={user_id:string|null;nome:string|null;email:string|null};

export function GovernancaAba(){
  const qc=useQueryClient();
  const [revisaoId,setRevisaoId]=useState("");
  const [observacoes,setObservacoes]=useState<Record<string,string>>({});
  const {data,isLoading}=useQuery({queryKey:["access-governance"],queryFn:async()=>{
    const [al,rv,it,us]=await Promise.all([
      (supabase as any).rpc("alertas_governanca_acesso"),
      (supabase as any).from("access_reviews").select("id,titulo,referencia,status,created_at").order("created_at",{ascending:false}),
      (supabase as any).from("access_review_items").select("id,review_id,assignment_id,user_id,profile_id,decisao,observacao,access_profiles(nome)"),
      (supabase as any).from("profiles").select("user_id,nome,email").not("user_id","is",null),
    ]);const erro=[al,rv,it,us].find(x=>x.error)?.error;if(erro)throw erro;
    return {alertas:(al.data??[]) as Alerta[],revisoes:(rv.data??[]) as Revisao[],itens:(it.data??[]) as Item[],usuarios:(us.data??[]) as Usuario[]};
  }});
  const revisao=data?.revisoes.find(r=>r.id===revisaoId)??data?.revisoes.find(r=>["aberta","em_revisao"].includes(r.status))??data?.revisoes[0];
  const itens=(data?.itens??[]).filter(i=>i.review_id===revisao?.id);
  const nome=(id:string)=>{const u=data?.usuarios.find(x=>x.user_id===id);return u?.nome||u?.email||"Usuário não identificado"};
  const decidir=async(i:Item,decisao:string)=>{const {error}=await (supabase as any).rpc("decidir_item_revisao_acesso",{p_item_id:i.id,p_decisao:decisao,p_observacao:observacoes[i.id]||null});if(error)toast.error(error.message);else{toast.success(decisao==="revogar"?"Acesso revogado":"Decisão registrada");qc.invalidateQueries({queryKey:["access-governance"]});qc.invalidateQueries({queryKey:["access-users"]})}};
  const concluir=async()=>{if(!revisao)return;const {error}=await (supabase as any).rpc("concluir_revisao_acesso",{p_review_id:revisao.id});if(error)toast.error(error.message);else{toast.success("Revisão concluída");qc.invalidateQueries({queryKey:["access-governance"]})}};
  if(isLoading)return <p className="py-10 text-center text-muted-foreground">Carregando governança...</p>;
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{data?.alertas.map(a=><Card key={a.tipo} className={a.severidade==="alta"?"border-red-300":a.severidade==="media"?"border-amber-300":""}><CardContent className="flex gap-3 p-4"><ShieldAlert className={a.severidade==="alta"?"text-red-600":a.severidade==="media"?"text-amber-600":"text-blue-600"}/><div><b className="text-2xl">{a.quantidade}</b><p className="text-sm">{a.descricao}</p><Badge variant="outline" className="mt-2 capitalize">Prioridade {a.severidade}</Badge></div></CardContent></Card>)}{!data?.alertas.length&&<Card className="md:col-span-2 lg:col-span-3"><CardContent className="flex items-center justify-center gap-2 p-6 text-emerald-700"><CheckCircle2/>Nenhuma pendência de governança identificada.</CardContent></Card>}</div>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-primary"/>Revisões periódicas</CardTitle><Select value={revisao?.id??""} onValueChange={setRevisaoId}><SelectTrigger className="w-72"><SelectValue placeholder="Selecione uma revisão"/></SelectTrigger><SelectContent>{data?.revisoes.map(r=><SelectItem key={r.id} value={r.id}>{r.titulo} · {r.status}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent className="space-y-3">
      {!revisao&&<p className="py-8 text-center text-muted-foreground">Inicie uma revisão para conferir todos os acessos ativos.</p>}
      {itens.map(i=><div key={i.id} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_1fr_2fr_auto]"><div><p className="font-medium">{nome(i.user_id)}</p><p className="text-xs text-muted-foreground">Usuário</p></div><div><p className="font-medium">{i.access_profiles?.nome??"Perfil removido"}</p><p className="text-xs text-muted-foreground">Perfil concedido</p></div><Textarea className="min-h-9" placeholder="Justificativa obrigatória para revogar ou ajustar" value={observacoes[i.id]??i.observacao??""} onChange={e=>setObservacoes(x=>({...x,[i.id]:e.target.value}))}/><div className="flex flex-wrap items-center gap-1">{i.decisao?<Badge className="capitalize">{i.decisao}</Badge>:<><Button size="sm" variant="outline" onClick={()=>decidir(i,"manter")}>Manter</Button><Button size="sm" variant="outline" onClick={()=>decidir(i,"ajustar")}>Ajustar</Button><Button size="sm" variant="destructive" onClick={()=>decidir(i,"revogar")}>Revogar</Button></>}</div></div>)}
      {revisao&&itens.length>0&&<div className="flex items-center justify-between border-t pt-3"><p className="text-sm text-muted-foreground">{itens.filter(i=>i.decisao).length} de {itens.length} acessos revisados</p><Button disabled={itens.some(i=>!i.decisao)||revisao.status==="concluida"} onClick={concluir}>Concluir revisão</Button></div>}
    </CardContent></Card>
  </div>;
}
