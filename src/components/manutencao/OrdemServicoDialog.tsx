/**
 * Ordem de serviço da manutenção.
 *
 * Completa o registro raso que existia: oficina como fornecedor de verdade,
 * entrada e saída da oficina (de onde sai a indisponibilidade do veículo),
 * mão de obra e peças aplicadas.
 *
 * Regra de custo que a tela precisa deixar explícita: peça que sai do estoque
 * JÁ virou custo da obra na baixa do almoxarifado. Ela aparece aqui para quem
 * lê a OS saber o que foi usado, mas não entra de novo no custo — senão a obra
 * pagaria duas vezes pelo mesmo item.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, Loader2, Package, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

type OS = {
  id: string;
  numero_os: string | null;
  placa: string;
  marca: string;
  modelo: string;
  obra_id: string | null;
  obra_nome: string | null;
  status: string;
  tipo: string;
  descricao: string;
  data_agendada: string;
  data_realizada: string | null;
  entrada_oficina: string | null;
  saida_oficina: string | null;
  indisponibilidade_horas: number | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  oficina: string | null;
  horas_mao_obra: number | null;
  custo_mao_obra: number;
  custo_pecas_estoque: number;
  custo_pecas_compradas: number;
  custo_os: number;
  servico_plano: string | null;
};

type Peca = {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  origem: "estoque" | "compra";
  material_id: string | null;
};

const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O input datetime-local não aceita offset; corta para o formato que ele espera. */
const paraInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function OrdemServicoDialog({ maintenanceId, onClose, onSaved }: {
  maintenanceId: string; onClose: () => void; onSaved: () => void;
}) {
  const [os, setOs] = useState<OS | null>(null);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [materiais, setMateriais] = useState<{ id: string; nome: string; unidade: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Oficina e mão de obra
  const [fornecedorId, setFornecedorId] = useState("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [horas, setHoras] = useState("");
  const [custoMaoObra, setCustoMaoObra] = useState("");

  // Nova peça
  const [origem, setOrigem] = useState<"estoque" | "compra">("compra");
  const [materialId, setMaterialId] = useState("");
  const [descricaoPeca, setDescricaoPeca] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [valorUnitario, setValorUnitario] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [osRes, pecasRes, forn, mat] = await Promise.all([
      (supabase as any).from("v_manutencao_os").select("*").eq("id", maintenanceId).maybeSingle(),
      (supabase as any).from("manutencao_pecas").select("*").eq("maintenance_id", maintenanceId).order("created_at"),
      (supabase as any).from("fornecedores").select("id,nome").eq("status", "ativo").order("nome"),
      (supabase as any).from("materiais_catalogo").select("id,nome,unidade").eq("ativo", true).order("nome"),
    ]);

    if (osRes.error) toast.error(`Não foi possível abrir a OS: ${osRes.error.message}`);

    const dados = osRes.data as OS | null;
    setOs(dados);
    setPecas((pecasRes.data ?? []) as Peca[]);
    setFornecedores(forn.data ?? []);
    setMateriais(mat.data ?? []);

    if (dados) {
      setFornecedorId(dados.fornecedor_id ?? "");
      setEntrada(paraInput(dados.entrada_oficina));
      setSaida(paraInput(dados.saida_oficina));
      setHoras(dados.horas_mao_obra?.toString() ?? "");
      setCustoMaoObra(dados.custo_mao_obra ? String(dados.custo_mao_obra) : "");
    }
    setLoading(false);
  }, [maintenanceId]);

  useEffect(() => { carregar(); }, [carregar]);

  const indisponibilidade = useMemo(() => {
    if (!entrada || !saida) return null;
    const h = (new Date(saida).getTime() - new Date(entrada).getTime()) / 3_600_000;
    return h >= 0 ? h : null;
  }, [entrada, saida]);

  async function salvarOficina() {
    if (entrada && saida && new Date(saida) < new Date(entrada)) {
      return toast.error("A saída da oficina não pode ser anterior à entrada.");
    }

    setSalvando(true);
    const { error } = await (supabase as any).from("maintenance_records").update({
      fornecedor_id: fornecedorId || null,
      entrada_oficina: entrada ? new Date(entrada).toISOString() : null,
      saida_oficina: saida ? new Date(saida).toISOString() : null,
      horas_mao_obra: horas ? Number(horas) : null,
      custo_mao_obra: custoMaoObra ? Number(custoMaoObra) : null,
    }).eq("id", maintenanceId);
    setSalvando(false);

    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    toast.success("Ordem de serviço atualizada.");
    carregar();
    onSaved();
  }

  async function adicionarPeca() {
    if (origem === "estoque" && !materialId) {
      return toast.error("Peça do estoque exige escolher o material do catálogo.");
    }
    if (origem === "compra" && !descricaoPeca.trim() && !materialId) {
      return toast.error("Descreva a peça comprada.");
    }
    if (!quantidade || Number(quantidade) <= 0) {
      return toast.error("Informe a quantidade.");
    }
    if (origem === "estoque" && !os?.obra_id) {
      return toast.error("Sem obra vinculada não dá para dar baixa no estoque. Use 'compra' ou vincule a manutenção a uma obra.");
    }

    setAdicionando(true);
    const { error } = await (supabase as any).rpc("manutencao_aplicar_peca", {
      p_maintenance_id: maintenanceId,
      p_descricao: descricaoPeca.trim() || null,
      p_quantidade: Number(quantidade),
      p_origem: origem,
      p_material_id: materialId || null,
      p_valor_unitario: valorUnitario ? Number(valorUnitario) : null,
      p_observacoes: null,
    });
    setAdicionando(false);

    if (error) return toast.error(`Não foi possível aplicar a peça: ${error.message}`);

    toast.success(origem === "estoque"
      ? "Peça baixada do estoque e registrada na OS. O custo já foi lançado na obra pelo almoxarifado."
      : "Peça registrada na OS.");

    setMaterialId(""); setDescricaoPeca(""); setQuantidade("1"); setValorUnitario("");
    carregar();
    onSaved();
  }

  async function removerPeca(peca: Peca) {
    if (!window.confirm(
      peca.origem === "estoque"
        ? `Remover "${peca.descricao}" da OS?\n\nAtenção: a baixa no estoque NÃO é desfeita — para devolver o material, use a devolução no almoxarifado.`
        : `Remover "${peca.descricao}" da OS?`
    )) return;

    const { error } = await (supabase as any).from("manutencao_pecas").delete().eq("id", peca.id);
    if (error) return toast.error(`Não foi possível remover: ${error.message}`);
    toast.success("Peça removida da OS.");
    carregar();
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {os?.numero_os ?? "Ordem de serviço"}
            {os ? ` — ${os.placa}` : ""}
          </DialogTitle>
          <DialogDescription>
            {os ? `${os.marca} ${os.modelo} · ${os.descricao}` : ""}
            {os?.servico_plano ? ` · item do plano: ${os.servico_plano}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando...
        </p>}

        {!loading && os && (
          <div className="space-y-5">
            {/* ── Oficina e indisponibilidade ─────────────────────── */}
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Oficina e parada</h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Fornecedor / oficina</Label>
                  <Select value={fornecedorId} onValueChange={setFornecedorId}>
                    <SelectTrigger>
                      <SelectValue placeholder={os.oficina ? `Texto antigo: ${os.oficina}` : "Selecione o fornecedor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {os.oficina && !fornecedorId && (
                    <p className="text-[11px] text-muted-foreground">
                      Esta OS tem a oficina como texto livre ({os.oficina}). Escolher o fornecedor
                      passa a somar no histórico por prestador.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Entrada na oficina</Label>
                  <Input type="datetime-local" value={entrada} onChange={e => setEntrada(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Saída da oficina</Label>
                  <Input type="datetime-local" value={saida} onChange={e => setSaida(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Clock className="h-3 w-3" />Indisponibilidade</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
                    {indisponibilidade != null
                      ? `${indisponibilidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Horas de mão de obra</Label>
                  <Input type="number" step="0.5" min={0} value={horas} onChange={e => setHoras(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Custo da mão de obra (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={custoMaoObra} onChange={e => setCustoMaoObra(e.target.value)} />
                </div>
              </div>

              <Button size="sm" disabled={salvando} onClick={salvarOficina}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar oficina e mão de obra
              </Button>
            </section>

            {/* ── Peças ───────────────────────────────────────────── */}
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Peças aplicadas</h3>
                <span className="text-xs text-muted-foreground">{pecas.length} item(ns)</span>
              </div>

              <div className="divide-y rounded-lg border">
                {!pecas.length && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">Nenhuma peça registrada.</p>
                )}
                {pecas.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{p.descricao}</span>
                    <Badge variant="outline" className={p.origem === "estoque"
                      ? "border-sky-300 bg-sky-50 text-[10px] text-sky-700"
                      : "border-violet-300 bg-violet-50 text-[10px] text-violet-700"}>
                      {p.origem === "estoque" ? "estoque" : "compra"}
                    </Badge>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {Number(p.quantidade).toLocaleString("pt-BR")} × {brl(p.valor_unitario)}
                    </span>
                    <span className="w-24 text-right font-medium">{brl(p.valor_total)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removerPeca(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Origem</Label>
                  <Select value={origem} onValueChange={v => setOrigem(v as "estoque" | "compra")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compra">Compra direta</SelectItem>
                      <SelectItem value="estoque">Estoque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{origem === "estoque" ? "Material do catálogo *" : "Material ou descrição"}</Label>
                  {origem === "estoque" ? (
                    <Select value={materialId} onValueChange={setMaterialId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {materiais.map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={descricaoPeca} onChange={e => setDescricaoPeca(e.target.value)}
                      placeholder="Ex.: Filtro de óleo" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" step="0.001" min={0} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor unitário</Label>
                  <Input type="number" step="0.01" min={0} value={valorUnitario} disabled={origem === "estoque"}
                    onChange={e => setValorUnitario(e.target.value)}
                    placeholder={origem === "estoque" ? "custo médio" : "0,00"} />
                </div>
              </div>

              {origem === "estoque" && (
                <p className="text-[11px] text-muted-foreground">
                  O valor vem do custo médio do estoque, e a baixa é registrada no almoxarifado
                  {os.obra_nome ? ` da obra ${os.obra_nome}` : ""}.
                </p>
              )}

              <Button size="sm" variant="outline" disabled={adicionando} onClick={adicionarPeca}>
                {adicionando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Aplicar peça
              </Button>
            </section>

            {/* ── Totais ──────────────────────────────────────────── */}
            <section className="space-y-2 rounded-xl border p-4">
              <h3 className="text-sm font-semibold">Custos</h3>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peças compradas</span>
                  <span>{brl(os.custo_pecas_compradas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mão de obra</span>
                  <span>{brl(os.custo_mao_obra)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Custo desta OS</span>
                  <span>{brl(os.custo_os)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Peças do estoque (já custeadas na saída)</span>
                  <span>{brl(os.custo_pecas_estoque)}</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Leitura gerencial, somando tudo</span>
                  <span>{brl(os.custo_os + os.custo_pecas_estoque)}</span>
                </div>
              </div>

              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-800">
                Peça do estoque já virou custo da obra quando saiu do almoxarifado. Por isso ela
                fica fora do <strong>custo desta OS</strong>, que é o valor que vai para o Orçado ×
                Realizado — somar de novo faria a obra pagar duas vezes pelo mesmo item.
              </p>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
