import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

type Setor = { id: string; departamento_id: string; nome: string; ativo: boolean };
type Pessoa = { id:string; nome:string; departamento_id:string|null };
type Vinculo = { id:string; employee_id:string; departamento_id:string; setor_id:string|null };

/**
 * Setores de cada departamento. Servem para organizar as pessoas e como
 * escopo de acesso ("vale só para o setor Departamento Pessoal").
 */
export function SetoresPainel({ departamentos }: { departamentos: Array<{ id: string; nome: string }> }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState<Record<string, string>>({});
  const [gerindo,setGerindo]=useState<Setor|null>(null);
  const [selecionados,setSelecionados]=useState<Set<string>>(new Set());

  const { data: setores = [] } = useQuery({
    queryKey: ["departamento-setores"],
    queryFn: async (): Promise<Setor[]> => {
      const { data, error } = await (supabase as any).from("departamento_setores").select("id,departamento_id,nome,ativo").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const {data:estrutura}=useQuery({queryKey:["setores-pessoas"],queryFn:async()=>{
    const [p,v]=await Promise.all([
      (supabase as any).from("employees").select("id,nome,departamento_id").eq("status","ativo").order("nome"),
      (supabase as any).from("employee_department_assignments").select("id,employee_id,departamento_id,setor_id"),
    ]); if(p.error)throw p.error;if(v.error)throw v.error;
    return {pessoas:(p.data??[]) as Pessoa[],vinculos:(v.data??[]) as Vinculo[]};
  }});

  const recarregar = () => qc.invalidateQueries({ queryKey: ["departamento-setores"] });

  const criar = async (departamentoId: string) => {
    const nome = (novo[departamentoId] ?? "").trim();
    if (!nome) return;
    const { error } = await (supabase as any).from("departamento_setores").insert({ departamento_id: departamentoId, nome });
    if (error) { toast.error(error.code === "23505" ? "Já existe um setor com esse nome neste departamento" : error.message); return; }
    setNovo(n => ({ ...n, [departamentoId]: "" }));
    toast.success("Setor criado"); recarregar();
  };

  const alternar = async (s: Setor) => {
    const { error } = await (supabase as any).from("departamento_setores").update({ ativo: !s.ativo, updated_at: new Date().toISOString() }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(s.ativo ? "Setor desativado" : "Setor reativado"); recarregar();
  };
  const abrirPessoas=(s:Setor)=>{setGerindo(s);setSelecionados(new Set((estrutura?.vinculos??[]).filter(v=>v.setor_id===s.id).map(v=>v.employee_id)))};
  const salvarPessoas=async()=>{if(!gerindo||!estrutura)return;const atuais=estrutura.vinculos.filter(v=>v.setor_id===gerindo.id);const remover=atuais.filter(v=>!selecionados.has(v.employee_id));const adicionar=[...selecionados].filter(id=>!atuais.some(v=>v.employee_id===id));
    // Sair de um setor não remove a pessoa do departamento: preserva o vínculo
    // organizacional e apenas limpa o setor associado.
    for(const v of remover){const {error}=await (supabase as any).from("employee_department_assignments").update({setor_id:null}).eq("id",v.id);if(error){toast.error(error.message);return}}
    for(const employee_id of adicionar){
      const existente=estrutura.vinculos.find(v=>v.employee_id===employee_id&&v.departamento_id===gerindo.departamento_id&&v.setor_id===null);
      const query=existente
        ?(supabase as any).from("employee_department_assignments").update({setor_id:gerindo.id}).eq("id",existente.id)
        :(supabase as any).from("employee_department_assignments").insert({employee_id,departamento_id:gerindo.departamento_id,setor_id:gerindo.id,principal:false});
      const {error}=await query;if(error){toast.error(error.message);return}
    }
    toast.success("Pessoas do setor atualizadas");setGerindo(null);qc.invalidateQueries({queryKey:["setores-pessoas"]});
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold">Setores</h2>
        <p className="text-sm text-muted-foreground">Divisões de cada departamento. Também podem limitar onde um acesso vale.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {departamentos.map(d => {
          const lista = setores.filter(s => s.departamento_id === d.id);
          return (
            <Card key={d.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{d.nome}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {lista.length === 0 && <span className="text-xs text-muted-foreground">Nenhum setor.</span>}
                  {lista.map(s => (
                    <span key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${s.ativo ? "bg-secondary" : "text-muted-foreground line-through"}`}>
                      {s.nome}
                      {s.ativo&&<button type="button" onClick={()=>abrirPessoas(s)} title="Gerenciar pessoas" className="ml-1 rounded-full p-0.5 hover:bg-muted"><Users className="h-3 w-3"/></button>}
                      <button type="button" onClick={() => alternar(s)} title={s.ativo ? "Desativar" : "Reativar"} className="rounded-full p-0.5 hover:bg-muted">
                        {s.ativo ? <X className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input className="h-8 text-sm" placeholder="Novo setor" value={novo[d.id] ?? ""}
                    onChange={e => setNovo(n => ({ ...n, [d.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") criar(d.id); }} />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => criar(d.id)}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={!!gerindo} onOpenChange={o=>!o&&setGerindo(null)}><DialogContent><DialogHeader><DialogTitle>Pessoas do setor {gerindo?.nome}</DialogTitle></DialogHeader><div className="max-h-96 divide-y overflow-y-auto rounded-lg border">{(estrutura?.pessoas??[]).filter(p=>p.departamento_id===gerindo?.departamento_id||(estrutura?.vinculos??[]).some(v=>v.employee_id===p.id&&v.departamento_id===gerindo?.departamento_id)).map(p=><label key={p.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40"><Checkbox checked={selecionados.has(p.id)} onCheckedChange={v=>setSelecionados(s=>{const n=new Set(s);if(v)n.add(p.id);else n.delete(p.id);return n})}/><span className="text-sm">{p.nome}</span></label>)}{!(estrutura?.pessoas??[]).some(p=>p.departamento_id===gerindo?.departamento_id||(estrutura?.vinculos??[]).some(v=>v.employee_id===p.id&&v.departamento_id===gerindo?.departamento_id))&&<p className="p-6 text-center text-sm text-muted-foreground">Nenhum funcionário ativo neste departamento.</p>}</div><DialogFooter><Button variant="outline" onClick={()=>setGerindo(null)}>Cancelar</Button><Button onClick={salvarPessoas}>Salvar vínculos</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
