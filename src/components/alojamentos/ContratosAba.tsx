/**
 * Contratos de locação do alojamento.
 *
 * Dois casos que a obra vive e que custam dinheiro todo mês:
 *   • a casa alugada pronta, com contrato e locador;
 *   • o terreno alugado onde a empresa monta a própria estrutura.
 *
 * Os dois viram custo da obra pela mesma porta (v_alojamento_custos_obra), e
 * aparecem no Orçado x Realizado sem ninguém precisar lançar nada todo mês.
 *
 * O contrato tem período. Reajuste não é editar o valor: é encerrar o contrato
 * e abrir o seguinte. Assim o custo de um mês passado continua sendo o que
 * realmente se pagou naquele mês.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mensagemDeErro } from "@/lib/erros";
import { useI18n } from "@/i18n";
import { Building2, CalendarClock, FileText, Home, LandPlot, Pencil, Plus, TriangleAlert } from "lucide-react";

type Complexo = { id: string; nome: string; obra_id: string };
type Unidade  = { id: string; nome: string; complexo_id: string };
type Fornecedor = { id: string; nome: string };

type Contrato = {
  id: string;
  complexo_id: string;
  alojamento_id: string | null;
  objeto: "imovel" | "terreno" | "hospedagem" | "outro";
  fornecedor_id: string | null;
  nome_locador: string | null;
  numero: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_mensal: number;
  dia_vencimento: number | null;
  reajuste_indice: string | null;
  encerrado_em: string | null;
  motivo_encerramento: string | null;
  observacoes: string | null;
};

const OBJETO: Record<string, { label: string; icone: typeof Home; ajuda: string }> = {
  imovel:     { label: "Imóvel alugado",  icone: Home,      ajuda: "Casa ou apartamento alugado pronto." },
  terreno:    { label: "Terreno alugado", icone: LandPlot,  ajuda: "O chão é alugado e a estrutura em cima é da empresa." },
  hospedagem: { label: "Hospedagem",      icone: Building2, ajuda: "Hotel ou pousada contratada por mês." },
  outro:      { label: "Outro",           icone: FileText,  ajuda: "" },
};

const hoje = () => new Date().toISOString().slice(0, 10);

/** Vigente, encerrado ou ainda por começar — pelo que está no contrato. */
function situacaoDo(c: Contrato): { texto: string; cls: string } {
  const h = hoje();
  const fim = c.encerrado_em ?? c.data_fim;
  if (c.data_inicio > h) return { texto: "Começa depois", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" };
  if (fim && fim < h)    return { texto: "Encerrado",     cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  return { texto: "Vigente", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
}

export function ContratosAba({
  complexos, unidades, onMudou,
}: { complexos: Complexo[]; unidades: Unidade[]; onMudou?: () => void }) {
  const { t, money, date } = useI18n();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Contrato | null>(null);
  const [aberto, setAberto] = useState(false);

  const idsComplexo = useMemo(() => complexos.map(c => c.id), [complexos]);

  const carregar = useCallback(async () => {
    if (!idsComplexo.length) { setContratos([]); setCarregando(false); return; }
    setCarregando(true);
    const [ct, fo] = await Promise.all([
      (supabase as any).from("alojamento_contratos_locacao")
        .select("*").in("complexo_id", idsComplexo).order("data_inicio", { ascending: false }),
      (supabase as any).from("fornecedores").select("id, nome").order("nome"),
    ]);
    setCarregando(false);
    if (ct.error) { toast.error(mensagemDeErro(ct.error)); return; }
    setContratos(ct.data ?? []);
    // Fornecedor é opcional: se a lista falhar, ainda dá para digitar o nome.
    setFornecedores(fo.data ?? []);
  }, [idsComplexo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const nomeComplexo = (id: string) => complexos.find(c => c.id === id)?.nome ?? "—";
  const nomeUnidade  = (id: string | null) => id ? (unidades.find(u => u.id === id)?.nome ?? "—") : null;
  const nomeLocador  = (c: Contrato) =>
    (c.fornecedor_id && fornecedores.find(f => f.id === c.fornecedor_id)?.nome) || c.nome_locador || "—";

  const mensalVigente = contratos
    .filter(c => situacaoDo(c).texto === "Vigente")
    .reduce((s, c) => s + Number(c.valor_mensal), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("Contratos de locação")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Casa alugada e terreno alugado viram custo mensal da obra automaticamente.")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {mensalVigente > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("Aluguel mensal vigente")}</p>
              <p className="text-lg font-bold text-foreground">{money(mensalVigente)}</p>
            </div>
          )}
          <Button size="sm" onClick={() => { setEditando(null); setAberto(true); }} disabled={!complexos.length}>
            <Plus className="mr-1.5 h-4 w-4" />{t("Novo contrato")}
          </Button>
        </div>
      </div>

      {carregando ? (
        <div className="rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
          {t("Carregando contratos...")}
        </div>
      ) : !contratos.length ? (
        <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm font-medium">{t("Nenhum contrato de locação cadastrado")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {t("Enquanto não houver contrato, o aluguel não entra no custo da obra — nem o da casa, nem o do terreno.")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">{t("Objeto")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Locador")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Vigência")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t("Mensal")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Situação")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {contratos.map(c => {
                const cfg = OBJETO[c.objeto] ?? OBJETO.outro;
                const Icone = cfg.icone;
                const sit = situacaoDo(c);
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {nomeUnidade(c.alojamento_id) ?? nomeComplexo(c.complexo_id)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t(cfg.label)}{c.numero ? ` · ${c.numero}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(!c.fornecedor_id && "text-muted-foreground")}>{nomeLocador(c)}</span>
                      {!c.fornecedor_id && (
                        <p className="text-[11px] text-amber-600">{t("sem fornecedor cadastrado")}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {date(c.data_inicio)}
                      {" — "}
                      {c.encerrado_em ? date(c.encerrado_em) : c.data_fim ? date(c.data_fim) : t("sem fim definido")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{money(Number(c.valor_mensal))}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", sit.cls)}>
                        {t(sit.texto)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditando(c); setAberto(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <ContratoDialog
          contrato={editando}
          complexos={complexos}
          unidades={unidades}
          fornecedores={fornecedores}
          onFechar={() => setAberto(false)}
          onSalvo={() => { setAberto(false); void carregar(); onMudou?.(); }}
        />
      )}
    </div>
  );
}

function ContratoDialog({
  contrato, complexos, unidades, fornecedores, onFechar, onSalvo,
}: {
  contrato: Contrato | null;
  complexos: Complexo[];
  unidades: Unidade[];
  fornecedores: Fornecedor[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { t } = useI18n();
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({
    complexo_id:   contrato?.complexo_id ?? (complexos[0]?.id ?? ""),
    alojamento_id: contrato?.alojamento_id ?? "",
    objeto:        contrato?.objeto ?? "imovel",
    fornecedor_id: contrato?.fornecedor_id ?? "",
    nome_locador:  contrato?.nome_locador ?? "",
    numero:        contrato?.numero ?? "",
    data_inicio:   contrato?.data_inicio ?? hoje(),
    data_fim:      contrato?.data_fim ?? "",
    valor_mensal:  contrato?.valor_mensal != null ? String(contrato.valor_mensal) : "",
    dia_vencimento: contrato?.dia_vencimento != null ? String(contrato.dia_vencimento) : "",
    reajuste_indice: contrato?.reajuste_indice ?? "",
    encerrado_em:  contrato?.encerrado_em ?? "",
    motivo_encerramento: contrato?.motivo_encerramento ?? "",
    observacoes:   contrato?.observacoes ?? "",
  });
  const campo = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));

  // Terreno é do complexo inteiro: a estrutura em cima é própria, não há
  // unidade alugada a escolher.
  const ehTerreno = f.objeto === "terreno";
  const unidadesDoComplexo = unidades.filter(u => u.complexo_id === f.complexo_id);

  async function salvar() {
    if (!f.complexo_id) return toast.error(t("Escolha o complexo."));
    if (!f.valor_mensal || Number(f.valor_mensal) <= 0) return toast.error(t("Informe o valor mensal."));
    if (!f.fornecedor_id && !f.nome_locador.trim()) {
      return toast.error(t("Informe o locador: escolha um fornecedor ou digite o nome."));
    }
    if (f.data_fim && f.data_fim < f.data_inicio) {
      return toast.error(t("O fim do contrato não pode ser antes do início."));
    }

    setSalvando(true);
    const valores = {
      complexo_id: f.complexo_id,
      alojamento_id: ehTerreno ? null : (f.alojamento_id || null),
      objeto: f.objeto,
      fornecedor_id: f.fornecedor_id || null,
      nome_locador: f.nome_locador.trim() || null,
      numero: f.numero.trim() || null,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim || null,
      valor_mensal: Number(f.valor_mensal),
      dia_vencimento: f.dia_vencimento ? Number(f.dia_vencimento) : null,
      reajuste_indice: f.reajuste_indice || null,
      encerrado_em: f.encerrado_em || null,
      motivo_encerramento: f.motivo_encerramento.trim() || null,
      observacoes: f.observacoes.trim() || null,
    };

    const { error } = contrato
      ? await (supabase as any).from("alojamento_contratos_locacao").update(valores).eq("id", contrato.id)
      : await (supabase as any).from("alojamento_contratos_locacao").insert(valores);

    setSalvando(false);
    if (error) return toast.error(mensagemDeErro(error));
    toast.success(contrato ? t("Contrato atualizado") : t("Contrato cadastrado"));
    onSalvo();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contrato ? t("Editar contrato de locação") : t("Novo contrato de locação")}</DialogTitle>
          <DialogDescription>
            {t("O valor entra no custo da obra todo mês, rateado pelos dias de vigência.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("O que está sendo alugado")}</Label>
              <Select value={f.objeto} onValueChange={campo("objeto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJETO).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{t(v.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t(OBJETO[f.objeto]?.ajuda ?? "")}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Complexo")}</Label>
              <Select value={f.complexo_id} onValueChange={campo("complexo_id")}>
                <SelectTrigger><SelectValue placeholder={t("Selecione")} /></SelectTrigger>
                <SelectContent>
                  {complexos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {ehTerreno ? (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
              {t("O aluguel do terreno pertence ao complexo inteiro: a estrutura construída em cima é da empresa, não há unidade alugada a escolher.")}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Unidade alugada")}</Label>
              <Select value={f.alojamento_id || "__nenhuma__"}
                onValueChange={v => campo("alojamento_id")(v === "__nenhuma__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhuma__">{t("— Contrato do complexo inteiro —")}</SelectItem>
                  {unidadesDoComplexo.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Locador (fornecedor cadastrado)")}</Label>
              <Select value={f.fornecedor_id || "__nenhum__"}
                onValueChange={v => campo("fornecedor_id")(v === "__nenhum__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("Selecione")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">{t("— Não cadastrado —")}</SelectItem>
                  {fornecedores.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Ou nome do locador")}</Label>
              <Input value={f.nome_locador} onChange={e => campo("nome_locador")(e.target.value)}
                placeholder={t("Pessoa física, por exemplo")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Nº do contrato")}</Label>
              <Input value={f.numero} onChange={e => campo("numero")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Início")}</Label>
              <Input type="date" value={f.data_inicio} onChange={e => campo("data_inicio")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Fim previsto")}</Label>
              <Input type="date" value={f.data_fim} onChange={e => campo("data_fim")(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Valor mensal (R$)")}</Label>
              <Input type="number" step="0.01" min="0" value={f.valor_mensal}
                onChange={e => campo("valor_mensal")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Dia de vencimento")}</Label>
              <Input type="number" min="1" max="31" value={f.dia_vencimento}
                onChange={e => campo("dia_vencimento")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Índice de reajuste")}</Label>
              <Select value={f.reajuste_indice || "__nenhum__"}
                onValueChange={v => campo("reajuste_indice")(v === "__nenhum__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("Nenhum")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">{t("Nenhum")}</SelectItem>
                  {["igpm", "ipca", "incc", "fixo", "outro"].map(i => (
                    <SelectItem key={i} value={i}>{i.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/15">
            <p className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {t("Para reajustar o aluguel, encerre este contrato e cadastre o seguinte com o valor novo. Alterar o valor aqui muda também o custo dos meses já passados.")}
            </p>
          </div>

          {contrato && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Encerrado em")}</Label>
                <Input type="date" value={f.encerrado_em} onChange={e => campo("encerrado_em")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Motivo do encerramento")}</Label>
                <Input value={f.motivo_encerramento} onChange={e => campo("motivo_encerramento")(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">{t("Observações")}</Label>
            <Textarea rows={2} value={f.observacoes} onChange={e => campo("observacoes")(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onFechar}>{t("Cancelar")}</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? t("Salvando...") : t("Salvar contrato")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
