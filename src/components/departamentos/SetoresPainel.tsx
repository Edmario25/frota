import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Undo2 } from "lucide-react";
import { toast } from "sonner";

type Setor = { id: string; departamento_id: string; nome: string; ativo: boolean };

/**
 * Setores de cada departamento. Servem para organizar as pessoas e como
 * escopo de acesso ("vale só para o setor Departamento Pessoal").
 */
export function SetoresPainel({ departamentos }: { departamentos: Array<{ id: string; nome: string }> }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState<Record<string, string>>({});

  const { data: setores = [] } = useQuery({
    queryKey: ["departamento-setores"],
    queryFn: async (): Promise<Setor[]> => {
      const { data, error } = await (supabase as any).from("departamento_setores").select("id,departamento_id,nome,ativo").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

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
    </div>
  );
}
