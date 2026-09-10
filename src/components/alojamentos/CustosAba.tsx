import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIA, CATEGORIAS_LANCAVEIS, brl, dataParaMes, grupoDe, rotuloMes, somarMeses } from "./custos";
import { useFornecedores } from "@/hooks/useFornecedores";

interface Props {
  complexos: any[];
  unidades: any[];
  abrirNovo: number;
  onMudou: () => void;
}

const COMPLEXO_TODO = "__complexo";

export function CustosAba({ complexos, unidades, abrirNovo, onMudou }: Props) {
  const { fornecedores } = useFornecedores();
  const [mes, setMes] = useState(() => dataParaMes(new Date()));
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [salvando, setSalvando] = useState(false);

  const complexoIds = useMemo(() => new Set(complexos.map(c => c.id)), [complexos]);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await (supabase as any)
      .from("alojamento_despesas").select("*")
      .eq("competencia", `${mes}-01`)
      .order("categoria").order("created_at");
    if (error) toast.error(error.message);
    setLista((data ?? []).filter((d: any) => complexoIds.has(d.complexo_id)));
    setCarregando(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [mes, complexoIds]);

  // O botão "Lançar despesa" do painel abre o formulário aqui
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (abrirNovo) novo(); }, [abrirNovo]);

  function novo() {
    setEditando({});
    setForm({ competencia: mes, categoria: "agua", complexo_id: complexos.length === 1 ? complexos[0].id : "", alojamento_id: COMPLEXO_TODO });
  }
  function editar(d: any) {
    setEditando(d);
    setForm({ ...d, competencia: String(d.competencia).slice(0, 7), alojamento_id: d.alojamento_id ?? COMPLEXO_TODO });
  }
  const campo = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  async function salvar() {
    if (!form.complexo_id) return toast.error("Escolha o complexo.");
    if (!form.valor || Number(form.valor) < 0) return toast.error("Informe o valor.");
    const linha = {
      complexo_id: form.complexo_id,
      alojamento_id: form.alojamento_id === COMPLEXO_TODO ? null : form.alojamento_id,
      competencia: `${form.competencia}-01`,
      categoria: form.categoria,
      descricao: form.descricao?.trim() || null,
      valor: Number(form.valor),
      quantidade: form.quantidade ? Number(form.quantidade) : null,
      unidade_medida: form.quantidade ? (form.unidade_medida?.trim() || CATEGORIA[form.categoria]?.medida || null) : null,
      fornecedor_id: form.fornecedor_id || null,
      fornecedor: fornecedores.find(f => f.id === form.fornecedor_id)?.nome ?? form.fornecedor?.trim() ?? null,
      documento: form.documento?.trim() || null,
      data_pagamento: form.data_pagamento || null,
    };
    setSalvando(true);
    const q = (supabase as any).from("alojamento_despesas");
    const { error } = editando?.id ? await q.update(linha).eq("id", editando.id) : await q.insert(linha);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(editando?.id ? "Despesa atualizada." : "Despesa lançada.");
    setEditando(null);
    if (linha.competencia.slice(0, 7) !== mes) setMes(linha.competencia.slice(0, 7));
    else carregar();
    onMudou();
  }

  async function excluir(d: any) {
    if (!confirm(`Excluir ${CATEGORIA[d.categoria]?.label} de ${brl(Number(d.valor))}?`)) return;
    const { error } = await (supabase as any).from("alojamento_despesas").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Despesa excluída.");
    carregar();
    onMudou();
  }

  // Contas fixas se repetem todo mês: copia os lançamentos do mês anterior com
  // os mesmos valores, para o gestor só ajustar o que mudou. O consumo (m³, kWh)
  // não é copiado, porque muda a cada fatura.
  async function copiarMesAnterior() {
    const anterior = somarMeses(mes, -1);
    const { data, error } = await (supabase as any)
      .from("alojamento_despesas").select("*").eq("competencia", `${anterior}-01`);
    if (error) return toast.error(error.message);
    const origem = (data ?? []).filter((d: any) => complexoIds.has(d.complexo_id));
    if (!origem.length) return toast.error(`Nenhuma despesa em ${rotuloMes(anterior)} para copiar.`);
    const novas = origem.map((d: any) => ({
      complexo_id: d.complexo_id, alojamento_id: d.alojamento_id, competencia: `${mes}-01`,
      categoria: d.categoria, descricao: d.descricao, valor: d.valor, quantidade: null,
      unidade_medida: d.unidade_medida, fornecedor_id: d.fornecedor_id, fornecedor: d.fornecedor,
    }));
    const { error: e2 } = await (supabase as any).from("alojamento_despesas").insert(novas);
    if (e2) return toast.error(e2.message);
    toast.success(`${novas.length} lançamentos copiados de ${rotuloMes(anterior)}. Ajuste os valores das contas que mudaram.`);
    carregar();
    onMudou();
  }

  const total = lista.reduce((s, d) => s + Number(d.valor), 0);
  const nomeUnidade = (d: any) => d.alojamento_id
    ? unidades.find(u => u.id === d.alojamento_id)?.nome ?? "Unidade"
    : `${complexos.find(c => c.id === d.complexo_id)?.nome ?? "Complexo"} (rateado)`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="h-9 w-44" />
          <p className="text-sm text-muted-foreground">{lista.length} lançamentos · <strong className="text-foreground">{brl(total)}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copiarMesAnterior}><Copy className="mr-1.5 h-4 w-4" />Copiar mês anterior</Button>
          <Button size="sm" onClick={novo}><Plus className="mr-1.5 h-4 w-4" />Lançar despesa</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Categoria</th>
              <th className="p-3 font-medium">Onde</th>
              <th className="p-3 font-medium">Fornecedor / documento</th>
              <th className="p-3 text-right font-medium">Consumo</th>
              <th className="p-3 text-right font-medium">Valor</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.map(d => (
              <tr key={d.id} className="border-t">
                <td className="p-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: grupoDe(d.categoria).cor }} />
                    <span>{CATEGORIA[d.categoria]?.label ?? d.categoria}{d.descricao && <span className="block text-xs text-muted-foreground">{d.descricao}</span>}</span>
                  </span>
                </td>
                <td className="p-3 text-xs">{nomeUnidade(d)}</td>
                <td className="p-3 text-xs text-muted-foreground">{[d.fornecedor, d.documento].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3 text-right text-xs tabular-nums">{d.quantidade != null ? `${Number(d.quantidade).toLocaleString("pt-BR")} ${d.unidade_medida ?? ""}` : "—"}</td>
                <td className="p-3 text-right font-medium tabular-nums">{brl(Number(d.valor))}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => editar(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => excluir(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!carregando && !lista.length && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma despesa em {rotuloMes(mes)}. Lance as contas do mês ou copie as do mês anterior.
          </p>
        )}
        {carregando && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      </div>
      <p className="text-xs text-muted-foreground">
        Aluguel e manutenção não precisam ser lançados: vêm do contrato da unidade e do custo dos chamados concluídos.
      </p>

      <Dialog open={!!editando} onOpenChange={o => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editando?.id ? "Editar despesa" : "Lançar despesa"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Categoria">
                <Select value={form.categoria} onValueChange={campo("categoria")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS_LANCAVEIS.map(c => <SelectItem key={c} value={c}>{CATEGORIA[c].label}</SelectItem>)}</SelectContent>
                </Select>
              </Campo>
              <Campo label="Competência"><Input type="month" value={form.competencia ?? ""} onChange={campo("competencia")} /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Complexo">
                <Select value={form.complexo_id || undefined} onValueChange={v => setForm((f: any) => ({ ...f, complexo_id: v, alojamento_id: COMPLEXO_TODO }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{complexos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </Campo>
              <Campo label="Unidade">
                <Select value={form.alojamento_id} onValueChange={campo("alojamento_id")} disabled={!form.complexo_id}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COMPLEXO_TODO}>Complexo inteiro (rateado)</SelectItem>
                    {unidades.filter(u => u.complexo_id === form.complexo_id).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <Campo label="Descrição (opcional)"><Input value={form.descricao ?? ""} onChange={campo("descricao")} placeholder="Ex.: conta Compesa, 20 fardos de papel higiênico" /></Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Valor (R$)"><Input type="number" min="0" step="0.01" value={form.valor ?? ""} onChange={campo("valor")} /></Campo>
              <Campo label="Consumo"><Input type="number" min="0" step="0.001" value={form.quantidade ?? ""} onChange={campo("quantidade")} placeholder="opcional" /></Campo>
              <Campo label="Medida"><Input value={form.unidade_medida ?? ""} onChange={campo("unidade_medida")} placeholder={CATEGORIA[form.categoria]?.medida ?? "un"} /></Campo>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Fornecedor">
                <Select value={form.fornecedor_id || "__sem_fornecedor"} onValueChange={v => setForm((f: any) => ({ ...f, fornecedor_id: v === "__sem_fornecedor" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__sem_fornecedor">Não informado</SelectItem>
                    {fornecedores.filter(f => f.status === "ativo").map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Nota / fatura"><Input value={form.documento ?? ""} onChange={campo("documento")} /></Campo>
              <Campo label="Pago em"><Input type="date" value={form.data_pagamento ?? ""} onChange={campo("data_pagamento")} /></Campo>
            </div>
            {form.alojamento_id === COMPLEXO_TODO && (
              <p className="text-xs text-muted-foreground">
                Conta única do complexo? Ela é dividida entre as unidades pelas diárias de cada uma no mês.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
