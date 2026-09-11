import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Plus, Users, KeyRound, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Permission = { id:string; chave:string; modulo:string; acao:string; nome:string; sensivel:boolean };
type Profile = { id:string; nome:string; descricao:string|null; cor:string; sistema:boolean; ativo:boolean };
type User = { id:string; user_id:string|null; nome:string|null; email:string|null };
type Assignment = { id:string; user_id:string; profile_id:string; scope_type:string; scope_id:string|null; valido_ate:string|null; access_profiles?:{nome:string}|null };
const actions = ["visualizar","criar","editar","excluir","aprovar","encerrar","exportar","administrar"];

export default function ControleAcesso(){
  const qc=useQueryClient();
  const [profileOpen,setProfileOpen]=useState(false); const [assignmentOpen,setAssignmentOpen]=useState(false);
  const [editing,setEditing]=useState<Profile|null>(null); const [name,setName]=useState(""); const [description,setDescription]=useState(""); const [selected,setSelected]=useState<Set<string>>(new Set());
  const [userId,setUserId]=useState(""); const [profileId,setProfileId]=useState(""); const [scope,setScope]=useState("empresa"); const [expires,setExpires]=useState("");
  const {data,isLoading}=useQuery({queryKey:["access-control"],queryFn:async()=>{
    const [p,pr,link,u,a]=await Promise.all([
      (supabase as any).from("access_profiles").select("*").order("nome"),
      (supabase as any).from("access_permissions").select("*").order("modulo").order("acao"),
      (supabase as any).from("access_profile_permissions").select("profile_id,permission_id").eq("permitido",true),
      (supabase as any).from("profiles").select("id,user_id,nome,email").not("user_id","is",null).order("nome"),
      (supabase as any).from("employee_access_profiles").select("*,access_profiles(nome)").order("created_at",{ascending:false}),
    ]);
    const error=[p,pr,link,u,a].find(x=>x.error)?.error; if(error) throw error;
    return {profiles:p.data as Profile[],permissions:pr.data as Permission[],links:link.data as {profile_id:string;permission_id:string}[],users:u.data as User[],assignments:a.data as Assignment[]};
  }});
  useEffect(()=>{if(!profileOpen){setEditing(null);setName("");setDescription("");setSelected(new Set());}},[profileOpen]);
  const modules=useMemo(()=>Object.entries((data?.permissions??[]).reduce((acc:Record<string,Permission[]>,p)=>{(acc[p.modulo]??=[]).push(p);return acc;},{})),[data?.permissions]);
  const openEdit=(p:Profile)=>{setEditing(p);setName(p.nome);setDescription(p.descricao??"");setSelected(new Set((data?.links??[]).filter(x=>x.profile_id===p.id).map(x=>x.permission_id)));setProfileOpen(true)};
  const saveProfile=async()=>{try{if(!name.trim()) throw new Error("Informe o nome do perfil"); let id=editing?.id;
    if(id){const {error}=await (supabase as any).from("access_profiles").update({nome:name.trim(),descricao:description.trim()||null,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;await (supabase as any).from("access_profile_permissions").delete().eq("profile_id",id);}
    else {const {data:created,error}=await (supabase as any).from("access_profiles").insert({nome:name.trim(),descricao:description.trim()||null}).select("id").single();if(error)throw error;id=created.id;}
    if(selected.size){const {error}=await (supabase as any).from("access_profile_permissions").insert([...selected].map(permission_id=>({profile_id:id,permission_id,permitido:true})));if(error)throw error;}
    toast.success("Perfil salvo com sucesso");setProfileOpen(false);qc.invalidateQueries({queryKey:["access-control"]});
  }catch(e:any){toast.error(e.message??"Não foi possível salvar")}};
  const saveAssignment=async()=>{try{if(!userId||!profileId)throw new Error("Selecione o usuário e o perfil");const {error}=await (supabase as any).from("employee_access_profiles").insert({user_id:userId,profile_id:profileId,scope_type:scope,valido_ate:expires?new Date(expires+"T23:59:59").toISOString():null,justificativa:"Atribuído pelo Controle de Acesso"});if(error)throw error;toast.success("Acesso atribuído");setAssignmentOpen(false);setUserId("");setProfileId("");setExpires("");qc.invalidateQueries({queryKey:["access-control"]});}catch(e:any){toast.error(e.message??"Não foi possível atribuir")}};
  const userName=(uid:string)=>{const u=data?.users.find(x=>x.user_id===uid);return u?.nome||u?.email||uid};
  return <Layout><div className="mx-auto max-w-screen-xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary"/>Controle de Acesso</h1><p className="text-sm text-muted-foreground">Perfis, ações, escopos e acessos temporários com rastreabilidade.</p></div><Button onClick={()=>setAssignmentOpen(true)}><UserPlus className="mr-2 h-4 w-4"/>Atribuir acesso</Button></div>
    <div className="grid gap-3 md:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-4"><KeyRound className="text-primary"/><div><b className="text-2xl">{data?.profiles.length??0}</b><p className="text-xs text-muted-foreground">Perfis configurados</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><Users className="text-primary"/><div><b className="text-2xl">{new Set(data?.assignments.map(x=>x.user_id)).size||0}</b><p className="text-xs text-muted-foreground">Usuários com perfil</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><ShieldCheck className="text-primary"/><div><b className="text-2xl">{data?.permissions.length??0}</b><p className="text-xs text-muted-foreground">Permissões por ação</p></div></CardContent></Card></div>
    <Tabs defaultValue="profiles"><TabsList><TabsTrigger value="profiles">Perfis</TabsTrigger><TabsTrigger value="users">Usuários e escopos</TabsTrigger><TabsTrigger value="matrix">Matriz de permissões</TabsTrigger></TabsList>
      <TabsContent value="profiles"><div className="mb-3 flex justify-end"><Button size="sm" onClick={()=>setProfileOpen(true)}><Plus className="mr-2 h-4 w-4"/>Novo perfil</Button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{isLoading?<p>Carregando...</p>:data?.profiles.map(p=><Card key={p.id}><CardHeader className="pb-2"><div className="flex justify-between gap-2"><CardTitle className="text-base">{p.nome}</CardTitle><Button size="icon" variant="ghost" onClick={()=>openEdit(p)}><Pencil className="h-4 w-4"/></Button></div></CardHeader><CardContent><p className="min-h-10 text-sm text-muted-foreground">{p.descricao||"Sem descrição"}</p><div className="mt-3 flex gap-2"><Badge variant="secondary">{data.links.filter(x=>x.profile_id===p.id).length} permissões</Badge>{p.sistema&&<Badge variant="outline">Padrão</Badge>}</div></CardContent></Card>)}</div></TabsContent>
      <TabsContent value="users"><Card><CardContent className="p-0"><div className="divide-y">{data?.assignments.map(a=><div key={a.id} className="grid gap-2 p-4 md:grid-cols-4"><div><b>{userName(a.user_id)}</b></div><div>{a.access_profiles?.nome}</div><Badge className="w-fit" variant="outline">{a.scope_type}</Badge><div className="text-sm text-muted-foreground">{a.valido_ate?`Até ${new Date(a.valido_ate).toLocaleDateString("pt-BR")}`:"Sem expiração"}</div></div>)}{!data?.assignments.length&&<p className="p-8 text-center text-muted-foreground">Nenhum perfil atribuído.</p>}</div></CardContent></Card></TabsContent>
      <TabsContent value="matrix"><Card><CardContent className="overflow-auto p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">Módulo</th>{actions.map(a=><th className="p-3 text-center" key={a}>{a}</th>)}</tr></thead><tbody>{modules.map(([m,ps])=><tr className="border-b" key={m}><td className="p-3 font-medium">{m.replaceAll("_"," ")}</td>{actions.map(a=><td className="p-3 text-center" key={a}>{ps.some(p=>p.acao===a)?"✓":"—"}</td>)}</tr>)}</tbody></table></CardContent></Card></TabsContent>
    </Tabs>
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{editing?"Editar perfil":"Novo perfil de acesso"}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-2"><div><Label>Nome</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div><div><Label>Descrição</Label><Input value={description} onChange={e=>setDescription(e.target.value)}/></div></div><div className="space-y-4">{modules.map(([m,ps])=><div key={m} className="rounded-lg border p-3"><b className="capitalize">{m.replaceAll("_"," ")}</b><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{ps.map(p=><label className="flex items-center gap-2 text-sm" key={p.id}><Checkbox checked={selected.has(p.id)} onCheckedChange={v=>setSelected(s=>{const n=new Set(s);if(v){n.add(p.id)}else{n.delete(p.id)}return n})}/>{p.acao}{p.sensivel&&<span title="Dado sensível">*</span>}</label>)}</div></div>)}</div><DialogFooter><Button variant="outline" onClick={()=>setProfileOpen(false)}>Cancelar</Button><Button onClick={saveProfile}>Salvar perfil</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}><DialogContent><DialogHeader><DialogTitle>Atribuir acesso ao usuário</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Usuário</Label><Select value={userId} onValueChange={setUserId}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{data?.users.map(u=><SelectItem key={u.id} value={u.user_id!}>{u.nome||u.email||u.user_id}</SelectItem>)}</SelectContent></Select></div><div><Label>Perfil</Label><Select value={profileId} onValueChange={setProfileId}><SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger><SelectContent>{data?.profiles.filter(p=>p.ativo).map(p=><SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Escopo</Label><Select value={scope} onValueChange={setScope}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["proprio","equipe","setor","departamento","obra","empresa"].map(x=><SelectItem value={x} key={x}>{x}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Obras permitidas continuam seguindo as vinculações do funcionário.</p></div><div><Label>Expira em (opcional)</Label><Input type="date" value={expires} onChange={e=>setExpires(e.target.value)}/></div></div><DialogFooter><Button variant="outline" onClick={()=>setAssignmentOpen(false)}>Cancelar</Button><Button onClick={saveAssignment}>Atribuir</Button></DialogFooter></DialogContent></Dialog>
  </div></Layout>;
}
