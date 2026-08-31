import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AprPayload,
  aprLocalDateTime,
  aprStatuses,
  aprTransitions,
} from "@/lib/apr";
import { AprEditor } from "./AprEditor";

async function rpc(name: string, params: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}
function Signature({
  onSign,
  busy,
}: {
  onSign: (png: string) => void;
  busy: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    moves = useRef(0);
  const [accepted, setAccepted] = useState(false),
    [marked, setMarked] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        O funcionário deve ler a APR e assinar pessoalmente. O usuário conectado
        fica registrado como coletor; a leitura de crachá não substitui a
        assinatura.
      </p>
      <canvas
        ref={canvas}
        width={600}
        height={180}
        className="border rounded bg-white w-full touch-none"
        aria-label="Área para assinatura do funcionário"
        onPointerDown={(e) => {
          if (busy) return;
          const c = canvas.current!;
          const rect = c.getBoundingClientRect();
          c.setPointerCapture(e.pointerId);
          const ctx = c.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - rect.left) * 600) / rect.width,
            ((e.clientY - rect.top) * 180) / rect.height,
          );
          drawing.current = true;
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = canvas.current!,
            rect = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.lineWidth = 2;
          ctx.lineTo(
            ((e.clientX - rect.left) * 600) / rect.width,
            ((e.clientY - rect.top) * 180) / rect.height,
          );
          ctx.stroke();
          moves.current++;
          setMarked(moves.current > 10);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        Declaro que recebi orientação sobre os riscos e controles desta revisão.
      </label>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
          moves.current = 0;
          setMarked(false);
          setAccepted(false);
        }}
      >
        Limpar
      </Button>{" "}
      <Button
        disabled={busy || !accepted || !marked}
        onClick={() => onSign(canvas.current!.toDataURL("image/png"))}
      >
        Registrar ciência
      </Button>
    </div>
  );
}
export function AprPanel({
  obras,
  allowCreate = true,
}: {
  obras: { id: string; nome: string }[];
  allowCreate?: boolean;
}) {
  const [list, setList] = useState<any>({
    itens: [],
    total: 0,
    pendentes: 0,
    vencidas: 0,
    execucao: 0,
  });
  const [obra, setObra] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false),
    [motivo, setMotivo] = useState(""),
    [signer, setSigner] = useState<any>(null);
  const request = useRef(0),
    detailRequest = useRef(0),
    newId = useRef("");
  const load = useCallback(async () => {
    const n = ++request.current;
    setLoading(true);
    try {
      const data = await rpc("apr_listar", {
        p_obra: obra || null,
        p_status: status || null,
        p_busca: search,
        p_pagina: page,
      });
      if (n === request.current) {
        setList(data);
        setError("");
      }
    } catch (e: any) {
      if (n === request.current) setError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }, [obra, status, search, page]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [load]);
  async function open(id: string) {
    const n = ++detailRequest.current;
    setBusy(true);
    try {
      const data = await rpc("apr_detalhe", { p_id: id });
      if (n === detailRequest.current) {
        setDetail(data);
        setMotivo("");
        setSigner(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (n === detailRequest.current) setBusy(false);
    }
  }
  async function transition(next: string) {
    setBusy(true);
    setError("");
    try {
      await rpc("apr_transicao", {
        p_id: detail.apr.id,
        p_versao: detail.apr.versao,
        p_status: next,
        p_motivo: motivo,
      });
      await open(detail.apr.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(d: AprPayload) {
    setBusy(true);
    try {
      await rpc("apr_salvar", {
        p_id: creating ? newId.current : detail.apr.id,
        p_dados: d,
        p_versao: creating ? null : detail.apr.versao,
      });
      setEditing(false);
      setCreating(false);
      if (detail) await open(detail.apr.id);
      await load();
    } finally {
      setBusy(false);
    }
  }
  const a = detail?.apr;
  const initial = a
    ? {
        ...a.plano,
        obra_id: a.obra_id || "",
        tipo_atividade_id: a.tipo_atividade_id || "",
        local: a.local,
        responsavel: a.responsavel,
        descricao_trabalho: a.descricao_trabalho || "",
        data_hora_inicio: aprLocalDateTime(new Date(a.data_hora_inicio)),
        validade: a.validade ? aprLocalDateTime(new Date(a.validade)) : "",
        observacoes: a.observacoes || "",
        participantes: detail.equipe.map((e: any) => ({
          id: e.colaborador_id,
          origem: "manual",
        })),
        riscos:
          a.plano.riscos ||
          detail.riscos_legados.map((r: any) => ({
            ...r,
            resposta: r.resposta || "S",
            nome: "Risco legado — revisar",
            etapa: "",
            responsavel: "",
            p: 0,
            s: 0,
            pr: 0,
            sr: 0,
            verificado: false,
            evidencia: "",
            medida_controle: r.medida_controle || "",
          })),
      }
    : undefined;
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            APR — Análise Preliminar de Riscos
          </h1>
          <p className="text-muted-foreground">
            Planejamento, revisão, ciência e liberação da atividade.
          </p>
        </div>
        {allowCreate && (
          <Button
            onClick={() => {
              newId.current = crypto.randomUUID();
              setCreating(true);
            }}
          >
            Nova APR
          </Button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="p-3 border border-red-300 rounded text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total filtrado", list.total],
          ["Em preparação / análise", list.pendentes],
          ["Validade vencida", list.vencidas],
          ["Em execução", list.execucao],
        ].map(([label, n]) => (
          <div key={label} className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <strong className="text-2xl">{n}</strong>
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Input
          className="max-w-sm"
          placeholder="Buscar local, atividade, responsável…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Filtrar obra"
          className="border rounded p-2"
          value={obra}
          onChange={(e) => {
            setObra(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas as obras permitidas</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar situação"
          className="border rounded p-2"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas as situações</option>
          {Object.entries(aprStatuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={load}>
          Atualizar
        </Button>
      </div>
      <div className="border rounded-xl overflow-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Início",
                "Atividade / local",
                "Obra",
                "Responsável",
                "Riscos / equipe",
                "Situação",
                "Ações",
              ].map((h) => (
                <th key={h} className="p-3 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.itens.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  {new Date(r.data_hora_inicio).toLocaleString("pt-BR")}
                </td>
                <td className="p-3">
                  {r.descricao_trabalho || r.local}
                  <small className="block">{r.local}</small>
                </td>
                <td className="p-3">{r.obra || "Obra pendente"}</td>
                <td className="p-3">{r.responsavel}</td>
                <td className="p-3">
                  {r.riscos} / {r.envolvidos}
                </td>
                <td className="p-3">
                  {aprStatuses[r.status]}
                  {r.validade &&
                    Date.parse(r.validade) < Date.now() &&
                    !["concluida", "cancelada"].includes(r.status) && (
                      <strong className="block text-red-700">Vencida</strong>
                    )}
                </td>
                <td className="p-3">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => open(r.id)}
                  >
                    Detalhe
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.itens.length && (
          <p className="p-8 text-center">
            {loading ? "Carregando…" : "Nenhuma APR encontrada."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page + 1} · {list.total} registros
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 25 >= list.total || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
      <Dialog
        open={creating || editing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setCreating(false);
            setEditing(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Nova APR" : "Revisar APR"}</DialogTitle>
          </DialogHeader>
          <AprEditor
            obras={obras}
            initial={creating ? undefined : initial}
            onSave={save}
            onCancel={() => {
              setCreating(false);
              setEditing(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail && !editing}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setDetail(null);
            setSigner(null);
            detailRequest.current++;
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto apr-print">
          <DialogHeader>
            <DialogTitle>
              APR {a?.id.slice(0, 8)} · Revisão {a?.revisao} ·{" "}
              {aprStatuses[a?.status]}
            </DialogTitle>
          </DialogHeader>
          {a && (
            <>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <p>
                  <strong>Obra:</strong>{" "}
                  {obras.find((o) => o.id === a.obra_id)?.nome ||
                    a.obra_id ||
                    "Pendente"}
                </p>
                <p>
                  <strong>Responsável:</strong> {a.responsavel}
                </p>
                <p>
                  <strong>Local:</strong> {a.local}
                </p>
                <p>
                  <strong>Atividade:</strong>{" "}
                  {a.descricao_trabalho || "Revisar"}
                </p>
                <p>
                  <strong>Início:</strong>{" "}
                  {new Date(a.data_hora_inicio).toLocaleString("pt-BR")}
                </p>
                <p>
                  <strong>Validade:</strong>{" "}
                  {a.validade
                    ? new Date(a.validade).toLocaleString("pt-BR")
                    : "Pendente"}
                </p>
                <p>
                  <strong>Liberação:</strong>{" "}
                  {a.liberado_em
                    ? new Date(a.liberado_em).toLocaleString("pt-BR")
                    : "Não liberada neste fluxo"}
                </p>
                <p>
                  <strong>Encerramento real:</strong>{" "}
                  {a.data_hora_fim
                    ? new Date(a.data_hora_fim).toLocaleString("pt-BR")
                    : "—"}
                </p>
              </div>
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              {!!detail.pendencias.length && (
                <div className="p-3 rounded bg-amber-50 text-amber-900">
                  <strong>Pendências para liberação / início</strong>
                  <ul className="list-disc pl-5 text-sm">
                    {detail.pendencias.map((p: string) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <h3 className="font-semibold">Riscos e controles</h3>
              {(a.plano.riscos || detail.riscos_legados).map(
                (r: any, i: number) => (
                  <section className="border rounded p-3 text-sm" key={i}>
                    <strong>
                      {r.nome || r.risco_id} — {r.resposta || "S"}
                    </strong>
                    <p>Etapa: {r.etapa || "Pendente"}</p>
                    <p>Controle: {r.medida_controle || "Pendente"}</p>
                    <p>Responsável: {r.responsavel || "Pendente"}</p>
                    <p>
                      Inicial: {r.p && r.s ? r.p * r.s : "—"} / Residual:{" "}
                      {r.pr && r.sr ? r.pr * r.sr : "—"} ·{" "}
                      {r.verificado ? "Verificado" : "Não verificado"}
                    </p>
                    <p>Evidência: {r.evidencia || "—"}</p>
                  </section>
                ),
              )}
              <p>
                <strong>Emergências:</strong> {a.plano.emergencia || "Pendente"}
              </p>
              <p>
                <strong>PT:</strong>{" "}
                {a.plano.exige_pt
                  ? a.plano.pt_id || "Pendente"
                  : "Não indicada pelo elaborador"}
              </p>
              <p>
                <strong>Observações:</strong> {a.observacoes || "—"}
              </p>
              <h3 className="font-semibold">Equipe e ciência individual</h3>
              {detail.equipe.map((e: any) => (
                <div className="border rounded p-3" key={e.colaborador_id}>
                  <div className="flex justify-between gap-2">
                    <span>
                      {e.nome} ·{" "}
                      {e.assinou ? "Ciência registrada" : "Ciência pendente"}
                    </span>
                    {["rascunho", "em_analise"].includes(a.status) &&
                      !e.assinou && (
                        <Button
                          className="no-print"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setSigner(e)}
                        >
                          Coletar assinatura
                        </Button>
                      )}
                  </div>
                  {e.ciencia?.assinatura && (
                    <img
                      className="w-60 bg-white"
                      src={e.ciencia.assinatura}
                      alt={`Assinatura de ${e.nome}`}
                    />
                  )}
                  <small>
                    {e.data_assinatura
                      ? new Date(e.data_assinatura).toLocaleString("pt-BR")
                      : ""}
                  </small>
                </div>
              ))}
              {signer && (
                <section className="border rounded p-4 no-print">
                  <h3 className="font-bold">Ciência de {signer.nome}</h3>
                  <Signature
                    key={signer.colaborador_id}
                    busy={busy}
                    onSign={async (png) => {
                      setBusy(true);
                      try {
                        await rpc("apr_ciencia", {
                          p_id: a.id,
                          p_employee: signer.colaborador_id,
                          p_versao: a.versao,
                          p_assinatura: png,
                        });
                        await open(a.id);
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </section>
              )}
              <section className="no-print space-y-3">
                <Input
                  placeholder="Justificativa da análise, liberação ou alteração…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {(aprTransitions[a.status] || []).map((next) => (
                    <Button
                      key={next}
                      variant="outline"
                      disabled={busy || motivo.trim().length < 5}
                      onClick={() => transition(next)}
                    >
                      {next === "rascunho"
                        ? "Solicitar revisão"
                        : aprStatuses[next]}
                    </Button>
                  ))}
                  {["rascunho", "aberta"].includes(a.status) && (
                    <Button disabled={busy} onClick={() => setEditing(true)}>
                      Editar rascunho
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => window.print()}>
                    Imprimir / PDF
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Liberação exige perfil autorizado da gestão/SMS. Alteração de
                  equipe, atividade, equipamento ou condição de trabalho exige
                  suspensão e revisão.
                </p>
              </section>
              <h3 className="font-semibold">Histórico</h3>
              {detail.historico.map((h: any) => (
                <p className="text-xs border-b pb-2" key={h.id}>
                  {new Date(h.criado_em).toLocaleString("pt-BR")} · {h.evento} ·{" "}
                  {h.motivo || "Registro operacional"} · Autor: {h.autor_id}
                </p>
              ))}
              <style>
                {
                  "@media print {html,body {height:auto!important;overflow:visible!important} body * {visibility:hidden} .apr-print,.apr-print * {visibility:visible} .apr-print {position:absolute!important;inset:0!important;transform:none!important;max-height:none!important;max-width:none!important;width:100%!important;overflow:visible!important;border:0!important;display:block!important} .no-print,.no-print * {display:none!important}}"
                }
              </style>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
