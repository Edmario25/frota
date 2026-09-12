import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitCompareArrows, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Config = { helper: string; descricao: string; permissao: string; modo: "legado" | "novo"; alterado_em: string };
type Linha = { helper: string; user_id: string; usuario: string; alvo_tipo: string; alvo_id: string; alvo_nome: string; legado: boolean; novo: boolean };

const LIMITE_LINHAS = 300;

/**
 * Compara, antes da troca, o que cada usuário acessa hoje (regra por papel)
 * com o que acessaria pelo modelo novo (perfil + ação + escopo).
 * Cada regra do banco vira para o modelo novo separadamente.
 */
export function ComparacaoAba() {
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [gerando, setGerando] = useState(false);
  const [filtro, setFiltro] = useState("todas");

  const { data: config = [], isLoading } = useQuery({
    queryKey: ["access-config"],
    queryFn: async (): Promise<Config[]> => {
      const { data, error } = await (supabase as any).from("access_config").select("*").order("helper");
      if (error) throw error;
      return data ?? [];
    },
  });

  const gerar = async () => {
    setGerando(true);
    const { data, error } = await (supabase as any).rpc("access_compare_report", { p_incluir_funcionarios: true });
    setGerando(false);
    if (error) { toast.error(error.message); return; }
    setLinhas(data ?? []);
  };

  const porRegra = useMemo(() => {
    const m = new Map<string, { perde: number; ganha: number }>();
    for (const l of linhas ?? []) {
      const c = m.get(l.helper) ?? { perde: 0, ganha: 0 };
      if (l.legado && !l.novo) c.perde++; else c.ganha++;
      m.set(l.helper, c);
    }
    return m;
  }, [linhas]);

  const trocar = async (c: Config) => {
    const novo = c.modo === "legado" ? "novo" : "legado";
    if (novo === "novo") {
      if (!linhas) { toast.error("Gere a comparação antes de trocar a regra."); return; }
      const d = porRegra.get(c.helper);
      const aviso = d ? `\n\nAtenção: ${d.perde} acesso(s) serão perdidos e ${d.ganha} ganhos.` : "\n\nNenhuma diferença encontrada.";
      if (!confirm(`Passar "${c.descricao}" para o modelo novo?${aviso}`)) return;
    } else if (!confirm(`Voltar "${c.descricao}" para a regra antiga, por papel?`)) return;
    const { error } = await (supabase as any).rpc("access_set_modo", { p_helper: c.helper, p_modo: novo });
    if (error) { toast.error(error.message); return; }
    toast.success(novo === "novo" ? "Regra passou para o modelo novo" : "Regra voltou ao modelo antigo");
    qc.invalidateQueries({ queryKey: ["access-config"] });
  };

  const visiveis = (linhas ?? []).filter(l => filtro === "todas" || l.helper === filtro);
  const nomeRegra = (h: string) => config.find(c => c.helper === h)?.descricao ?? h;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base">Regras do banco de dados</CardTitle>
            <p className="text-sm text-muted-foreground">
              Todas começam na regra antiga, por papel. Troque uma regra para o modelo novo só quando a comparação não mostrar diferenças indesejadas.
            </p>
          </div>
          <Button size="sm" onClick={gerar} disabled={gerando}>
            {gerando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <GitCompareArrows className="mr-2 h-4 w-4" />}
            {linhas ? "Comparar de novo" : "Comparar acessos"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
            {!isLoading && config.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Aplique a migration 20260911000008 para habilitar a comparação.</p>
            )}
            {config.map(c => {
              const d = porRegra.get(c.helper);
              return (
                <div key={c.helper} className="grid items-center gap-2 p-4 md:grid-cols-[1.6fr_1fr_auto_auto]">
                  <div>
                    <p className="font-medium">{c.descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.permissao}</p>
                  </div>
                  <div className="text-sm">
                    {!linhas ? <span className="text-muted-foreground">—</span>
                      : !d ? <span className="text-emerald-700">Sem diferenças</span>
                      : <span>
                          {d.perde > 0 && <span className="text-destructive">{d.perde} perdem acesso</span>}
                          {d.perde > 0 && d.ganha > 0 && " · "}
                          {d.ganha > 0 && <span className="text-amber-700">{d.ganha} ganham acesso</span>}
                        </span>}
                  </div>
                  <Badge variant={c.modo === "novo" ? "default" : "outline"} className="w-fit">
                    {c.modo === "novo" ? "Modelo novo" : "Regra antiga"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => trocar(c)}>
                    {c.modo === "legado" ? "Usar modelo novo" : "Voltar à regra antiga"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {linhas && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Diferenças ({linhas.length})</CardTitle>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="h-9 w-72 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as regras</SelectItem>
                {config.map(c => <SelectItem key={c.helper} value={c.helper}>{c.descricao}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {visiveis.length === 0
              ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma diferença: o modelo novo dá exatamente os mesmos acessos.</p>
              : <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50 text-left">
                    <th className="p-3">Usuário</th><th className="p-3">Regra</th><th className="p-3">Alvo</th><th className="p-3">Efeito da troca</th>
                  </tr></thead>
                  <tbody>
                    {visiveis.slice(0, LIMITE_LINHAS).map(l => (
                      <tr key={`${l.helper}-${l.user_id}-${l.alvo_id}`} className="border-b">
                        <td className="p-3 font-medium">{l.usuario}</td>
                        <td className="p-3 text-muted-foreground">{nomeRegra(l.helper)}</td>
                        <td className="p-3">{l.alvo_nome} <span className="text-xs text-muted-foreground">({l.alvo_tipo})</span></td>
                        <td className="p-3">
                          {l.legado && !l.novo
                            ? <Badge variant="destructive">Perde acesso</Badge>
                            : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Ganha acesso</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
            {visiveis.length > LIMITE_LINHAS && (
              <p className="p-3 text-xs text-muted-foreground">Mostrando {LIMITE_LINHAS} de {visiveis.length}. Filtre por regra para ver o restante.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
