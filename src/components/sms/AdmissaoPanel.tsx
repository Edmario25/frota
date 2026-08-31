import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  aplicarPerfilAdmissao,
  dataLocalAdmissao,
  normalizarFormAdmissao,
  progressoAdmissao,
  RequisitoAdmissao,
  validarArquivoAdmissao,
} from "@/lib/admissao";

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const labels: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em preparação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export function AdmissaoPanel({
  obras,
}: {
  obras: { id: string; nome: string }[];
}) {
  const [list, setList] = useState<any>({
      itens: [],
      total: 0,
      mes: 0,
      liberados: 0,
      atrasados: 0,
    }),
    [obra, setObra] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null),
    [form, setForm] = useState<any>(null),
    [catalog, setCatalog] = useState<any>({
      equipe: [],
      epis: [],
      treinamentos: [],
      perfis: [],
    }),
    [motivo, setMotivo] = useState("");
  const [creating, setCreating] = useState(false),
    [newObra, setNewObra] = useState(""),
    [employee, setEmployee] = useState(""),
    [date, setDate] = useState(dataLocalAdmissao()),
    [empSearch, setEmpSearch] = useState(""),
    [area, setArea] = useState<"rh" | "sms">("rh");
  const [requirementName, setRequirementName] = useState("");
  const listRequest = useRef(0),
    detailRequest = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const n = ++listRequest.current;
    setLoading(true);
    try {
      const data = await rpc("adm_listar", {
        p_obra: obra || null,
        p_status: status || null,
        p_busca: search,
        p_pagina: page,
      });
      if (n === listRequest.current) setList(data);
    } catch (e: any) {
      if (n === listRequest.current) setError(e.message);
    } finally {
      if (n === listRequest.current) setLoading(false);
    }
  }, [obra, status, search, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => {
      clearTimeout(t);
      listRequest.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!creating || !newObra) return;
    let active = true;
    setCatalog({ equipe: [], epis: [], treinamentos: [], perfis: [] });
    setEmployee("");
    rpc("adm_catalogos", { p_obra: newObra })
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [creating, newObra]);
  async function open(id: string) {
    const n = ++detailRequest.current;
    setBusy(true);
    setError("");
    try {
      const data = await rpc("adm_detalhe", { p_id: id });
      const refs = data.admissao.obra_id
        ? await rpc("adm_catalogos", { p_obra: data.admissao.obra_id })
        : { equipe: [], epis: [], treinamentos: [], perfis: [] };
      if (n === detailRequest.current) {
        setDetail(data);
        setForm(normalizarFormAdmissao(data.admissao));
        setCatalog(refs);
        setArea(data.pode_rh ? "rh" : "sms");
        setMotivo("");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (n === detailRequest.current) setBusy(false);
    }
  }
  const a = detail?.admissao,
    editable = a && ["pendente", "em_andamento"].includes(a.status),
    dirty =
      !!a && JSON.stringify(form) !== JSON.stringify(normalizarFormAdmissao(a));
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("adm_salvar", {
        p_id: a.id,
        p_versao: a.versao,
        p_dados: form,
      });
      await open(a.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await rpc("adm_acao", {
        p_id: a.id,
        p_versao: a.versao,
        p_acao: action,
        p_motivo: motivo,
      });
      await open(a.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const ext = validarArquivoAdmissao(file);
      const f = await rpc("adm_arquivo_preparar", {
        p_id: a.id,
        p_nome: file.name,
        p_area: area,
        p_ext: ext,
      });
      const { error } = await supabase.storage
        .from("admissao-documentos")
        .upload(f.caminho, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      await rpc("adm_arquivo_confirmar", { p_arquivo: f.id });
      await open(a.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function viewFile(f: any) {
    // Reserve the tab during the user gesture; mobile browsers block async popups.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Permita abrir uma nova aba para visualizar o documento.");
      return;
    }
    tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.storage
        .from("admissao-documentos")
        .createSignedUrl(f.caminho, 60);
      if (error) throw error;
      tab.location.replace(data.signedUrl);
    } catch (e: any) {
      tab.close();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const changeRequirement = (id: string, patch: Partial<RequisitoAdmissao>) =>
    setForm((p: any) => ({
      ...p,
      requisitos: p.requisitos.map((r: any) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    }));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Integração e Liberação para Obra
          </h1>
          <p className="text-muted-foreground">
            Documentação, integração SMS e conferência para mobilização. O
            contrato de admissão permanece no RH.
          </p>
        </div>
        <Button
          onClick={() => {
            setNewObra(obra || obras[0]?.id || "");
            setCreating(true);
            setError("");
          }}
        >
          Novo processo
        </Button>
      </div>
      {error && (
        <p role="alert" className="bg-red-50 border rounded p-3 text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Total filtrado", list.total],
          ["Iniciados neste mês", list.mes],
          ["Liberados sem pendências atuais", list.liberados],
          ["Processos atrasados", list.atrasados],
        ].map(([label, value]) => (
          <div key={label} className="border rounded-xl bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <strong className="text-2xl">{value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          value={search}
          placeholder="Buscar funcionário, obra ou responsável…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          className="border rounded p-2"
          aria-label="Filtrar obra"
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
          className="border rounded p-2"
          aria-label="Filtrar situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas as situações</option>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={load} disabled={loading}>
          Atualizar
        </Button>
      </div>
      <div className="border rounded-xl bg-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Funcionário / obra",
                "Início / ciclo",
                "Responsável / prazo",
                "Pendência principal",
                "Situação",
                "Ações",
              ].map((h) => (
                <th className="text-left p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.itens.map((r: any) => (
              <tr className="border-t" key={r.id}>
                <td className="p-3 font-medium">
                  {r.nome}
                  <small className="block text-muted-foreground">
                    {r.obra || "Obra não vinculada"} ·{" "}
                    {r.perfil || "Perfil não definido"}
                  </small>
                </td>
                <td className="p-3">
                  {r.data_admissao}
                  <small className="block">Ciclo {r.ciclo}</small>
                </td>
                <td className="p-3">
                  {r.responsavel_processo || "Não atribuído"}
                  <small className="block">{r.prazo || "Prazo pendente"}</small>
                </td>
                <td className="p-3 max-w-xs">
                  {r.pendencias[0] || "Sem pendências"}
                  {r.pendencias.length > 1 && (
                    <small className="block">
                      +{r.pendencias.length - 1} pendências
                    </small>
                  )}
                </td>
                <td className="p-3">
                  {r.status === "concluida"
                    ? r.liberado_em
                      ? r.pendencias.length
                        ? "Revisão necessária"
                        : "Liberado para obra"
                      : "Conclusão legada — revisar"
                    : labels[r.status]}
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
          <p className="text-center p-8">
            {loading ? "Carregando…" : "Nenhum processo encontrado."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          disabled={!page || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page + 1} · {list.total} processos
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
        open={creating}
        onOpenChange={(v) => {
          if (!busy) setCreating(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo processo de integração</DialogTitle>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <label>
            Obra
            <select
              className="w-full border rounded p-2"
              value={newObra}
              onChange={(e) => setNewObra(e.target.value)}
            >
              <option value="">Selecione</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <Input
            placeholder="Buscar funcionário da obra…"
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
          />
          <label>
            Funcionário
            <select
              className="w-full border rounded p-2"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">Selecione</option>
              {catalog.equipe
                .filter((e: any) =>
                  e.nome.toLowerCase().includes(empSearch.toLowerCase()),
                )
                .map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Início da integração na obra
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="text-xs">
            Se o vínculo já criou um processo, ele será aberto sem duplicação.
          </p>
          <Button
            disabled={busy || !employee || !date || !newObra}
            onClick={async () => {
              setBusy(true);
              try {
                const id = await rpc("adm_criar", {
                  p_employee: employee,
                  p_obra: newObra,
                  p_data: date,
                });
                setCreating(false);
                await open(id);
                await load();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Abrir processo
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (
            !v &&
            !busy &&
            (!dirty || window.confirm("Descartar alterações não salvas?"))
          ) {
            setDetail(null);
            setForm(null);
            detailRequest.current++;
          }
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-w-4xl max-h-[92vh] overflow-y-auto adm-print [&>*]:min-w-0 [&_fieldset]:min-w-0 [&_label]:min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_input]:max-w-full">
          <DialogHeader>
            <DialogTitle>
              Integração ·{" "}
              {list.itens.find((r: any) => r.id === a?.id)?.nome ||
                a?.colaborador_id}{" "}
              · Ciclo {a?.ciclo}
            </DialogTitle>
          </DialogHeader>
          {a && form && (
            <>
              <p className="text-sm">
                {obras.find((o) => o.id === a.obra_id)?.nome || "Obra pendente"}{" "}
                · Início {a.data_admissao} · {labels[a.status]} ·{" "}
                {a.liberado_em
                  ? `Liberação registrada em ${new Date(a.liberado_em).toLocaleString("pt-BR")}`
                  : "Sem liberação validada neste fluxo"}
              </p>
              {error && (
                <p role="alert" className="border rounded p-3 text-red-700">
                  {error}
                </p>
              )}
              <section className="bg-amber-50 text-amber-900 rounded p-3">
                <strong>Pendências atuais</strong>
                {detail.pendencias.length ? (
                  <ul className="list-disc pl-5 text-sm">
                    {detail.pendencias.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Nenhuma pendência identificada nas verificações do processo.
                  </p>
                )}
              </section>
              <fieldset disabled={busy || !editable} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label>
                    Perfil / função para integração
                    <Input
                      value={form.perfil}
                      onChange={(e) =>
                        setForm({ ...form, perfil: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Responsável pelo processo
                    <Input
                      disabled={!detail.pode_rh}
                      value={form.responsavel_processo}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          responsavel_processo: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Prazo de conclusão
                    <Input
                      disabled={!detail.pode_rh}
                      type="date"
                      value={form.prazo}
                      onChange={(e) =>
                        setForm({ ...form, prazo: e.target.value })
                      }
                    />
                  </label>
                </div>
                {detail.pode_rh && (
                  <label className="block no-print">
                    Aplicar modelo de requisitos da obra
                    <select
                      className="w-full border rounded p-2"
                      value=""
                      onChange={(e) => {
                        const perfil = catalog.perfis.find(
                          (p: any) => p.id === e.target.value,
                        );
                        if (perfil)
                          setForm(aplicarPerfilAdmissao(form, perfil));
                      }}
                    >
                      <option value="">
                        Selecionar perfil — não transfere validações
                      </option>
                      {catalog.perfis.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <h3 className="font-semibold">
                  Documentos · {progressoAdmissao(form.requisitos)}% dos
                  aplicáveis validados
                </h3>
                {form.requisitos.map((r: RequisitoAdmissao) => (
                  <section key={r.id} className="border rounded p-3 space-y-2">
                    <strong>{r.nome}</strong>
                    <small className="ml-2 uppercase">{r.area}</small>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <label>
                        Situação
                        <select
                          className="w-full border rounded p-2"
                          disabled={r.area === "rh" && !detail.pode_rh}
                          value={r.status}
                          onChange={(e) =>
                            changeRequirement(r.id, {
                              status: e.target
                                .value as RequisitoAdmissao["status"],
                            })
                          }
                        >
                          {[
                            ["pendente", "Pendente"],
                            ["recebido", "Recebido — conferir"],
                            ["validado", "Validado"],
                            ["recusado", "Recusado"],
                            ["na", "Não aplicável"],
                          ].map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Anexo privado
                        <select
                          className="w-full border rounded p-2"
                          disabled={r.area === "rh" && !detail.pode_rh}
                          value={r.arquivo_id || ""}
                          onChange={(e) =>
                            changeRequirement(r.id, {
                              arquivo_id: e.target.value,
                            })
                          }
                        >
                          <option value="">Selecionar evidência</option>
                          {detail.arquivos
                            .filter((f: any) => !f.legado && f.area === r.area)
                            .map((f: any) => (
                              <option key={f.id} value={f.id}>
                                {f.nome}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    {["na", "recusado"].includes(r.status) && (
                      <label className="block">
                        Justificativa obrigatória
                        <Textarea
                          disabled={r.area === "rh" && !detail.pode_rh}
                          value={r.justificativa || ""}
                          onChange={(e) =>
                            changeRequirement(r.id, {
                              justificativa: e.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    {r.validado_em && (
                      <small>
                        Última conferência:{" "}
                        {new Date(r.validado_em).toLocaleString("pt-BR")} ·{" "}
                        {r.validado_por}
                      </small>
                    )}
                  </section>
                ))}
                <div className="flex gap-2 flex-wrap no-print">
                  <Input
                    className="flex-1"
                    placeholder="Nome de requisito adicional…"
                    value={requirementName}
                    onChange={(e) => setRequirementName(e.target.value)}
                  />
                  <select
                    aria-label="Área do documento"
                    value={area}
                    className="border rounded p-2"
                    onChange={(e) => setArea(e.target.value as "rh" | "sms")}
                  >
                    {detail.pode_rh && (
                      <option value="rh">RH / administrativo</option>
                    )}
                    <option value="sms">SMS</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!requirementName.trim()}
                    onClick={() => {
                      setForm({
                        ...form,
                        requisitos: [
                          ...form.requisitos,
                          {
                            id: crypto.randomUUID(),
                            nome: requirementName.trim(),
                            area,
                            status: "pendente",
                          },
                        ],
                      });
                      setRequirementName("");
                    }}
                  >
                    Adicionar requisito
                  </Button>
                </div>
                <h3 className="font-semibold">
                  Treinamentos exigidos pela função / atividade
                </h3>
                <div className="max-h-44 overflow-auto border rounded">
                  {catalog.treinamentos.map((t: any) => (
                    <label key={t.id} className="flex gap-2 p-2">
                      <input
                        type="checkbox"
                        disabled={t.obrigatorio}
                        checked={
                          t.obrigatorio ||
                          form.treinamentos_exigidos.includes(t.id)
                        }
                        onChange={(e) =>
                          setForm({
                            ...form,
                            treinamentos_exigidos: e.target.checked
                              ? [...form.treinamentos_exigidos, t.id]
                              : form.treinamentos_exigidos.filter(
                                  (id: string) => id !== t.id,
                                ),
                          })
                        }
                      />
                      {t.nome}
                      {t.obrigatorio ? " (obrigatório geral)" : ""}
                    </label>
                  ))}
                </div>
                <label className="block">
                  Registro da integração SMS na obra
                  <select
                    className="w-full border rounded p-2"
                    value={form.integracao_id}
                    onChange={(e) =>
                      setForm({ ...form, integracao_id: e.target.value })
                    }
                  >
                    <option value="">Selecionar treinamento realizado</option>
                    {detail.treinamentos.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} · {t.data} · {t.instrutor || "Sem instrutor"} ·{" "}
                        {t.status}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs">
                  Cadastre a integração em Treinamentos, com instrutor e
                  comprovante. ASO e validade são conferidos na Saúde
                  Ocupacional, sem copiar dados médicos para este formulário.
                </p>
                <h3 className="font-semibold">EPIs necessários</h3>
                <div className="max-h-44 overflow-auto border rounded">
                  {catalog.epis.map((e: any) => (
                    <label key={e.id} className="flex gap-2 p-2">
                      <input
                        type="checkbox"
                        checked={form.epis_exigidos.includes(e.id)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            epis_exigidos: event.target.checked
                              ? [...form.epis_exigidos, e.id]
                              : form.epis_exigidos.filter(
                                  (id: string) => id !== e.id,
                                ),
                          })
                        }
                      />
                      {e.nome}
                    </label>
                  ))}
                </div>
                <p className="text-xs">
                  A liberação consulta entregas não devolvidas, com quantidade e
                  assinatura no módulo de EPIs.
                </p>
                {!form.epis_exigidos.length && (
                  <label className="block">
                    Justificativa de EPIs não aplicáveis
                    <Textarea
                      value={form.epis_na_justificativa}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          epis_na_justificativa: e.target.value,
                        })
                      }
                    />
                  </label>
                )}
                <label className="block">
                  Observações
                  <Textarea
                    value={form.observacoes}
                    onChange={(e) =>
                      setForm({ ...form, observacoes: e.target.value })
                    }
                  />
                </label>
              </fieldset>
              <section className="space-y-2">
                <h3 className="font-semibold">Anexos protegidos</h3>
                <p className="text-xs">
                  Documentos RH ficam restritos aos gestores autorizados. Novos
                  arquivos usam acesso temporário; anexos legados precisam de
                  migração.
                </p>
                {detail.arquivos.map((f: any) => (
                  <div
                    key={f.id}
                    className="border rounded p-2 flex justify-between items-center gap-2"
                  >
                    <span>
                      {f.nome} · {f.area}
                      {f.legado ? " · Legado público: migrar" : ""}
                    </span>
                    {!f.legado && (
                      <Button
                        className="no-print"
                        variant="outline"
                        disabled={busy}
                        onClick={() => viewFile(f)}
                      >
                        Abrir por 60 s
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <div className="no-print space-y-2">
                    <p className="text-xs">
                      O próximo arquivo será classificado como{" "}
                      {area.toUpperCase()}. Salve as alterações antes de anexar.
                    </p>
                    <input
                      ref={fileInput}
                      aria-label="Anexar documento privado"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      disabled={busy || dirty}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                      }}
                    />
                  </div>
                )}
              </section>
              <div className="no-print space-y-3 border-t pt-3">
                {dirty && (
                  <p className="text-amber-700 text-sm">
                    Alterações não salvas. Salvar invalida as conferências
                    anteriores.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <Button disabled={busy || !dirty} onClick={save}>
                      Salvar alterações
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() => open(a.id)}
                  >
                    Revalidar pendências
                  </Button>
                  <Button
                    variant="outline"
                    disabled={dirty}
                    onClick={() => window.print()}
                  >
                    Imprimir / PDF
                  </Button>
                  {editable && detail.pode_rh && (
                    <Button
                      variant="outline"
                      disabled={dirty || busy || !form.perfil.trim()}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await rpc("adm_salvar_perfil", {
                            p_id: a.id,
                            p_nome: form.perfil,
                          });
                          await open(a.id);
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Salvar como modelo da obra
                    </Button>
                  )}
                </div>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Justificativa da conferência, liberação ou reabertura…"
                />
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <>
                      {detail.pode_rh && (
                        <Button
                          variant="outline"
                          disabled={busy || dirty || motivo.trim().length < 5}
                          onClick={() => act("conferir_rh")}
                        >
                          Conferir RH
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={busy || dirty || motivo.trim().length < 5}
                        onClick={() => act("conferir_sms")}
                      >
                        Conferir SMS
                      </Button>
                      {detail.pode_rh && (
                        <Button
                          disabled={busy || dirty || motivo.trim().length < 5}
                          onClick={() => act("liberar")}
                        >
                          Liberar para obra
                        </Button>
                      )}
                    </>
                  )}
                  {a.status === "concluida" && detail.pode_rh && (
                    <Button
                      variant="outline"
                      disabled={busy || motivo.trim().length < 5}
                      onClick={() => act("reabrir")}
                    >
                      Reabrir para revisão
                    </Button>
                  )}
                  {a.status !== "cancelada" && detail.pode_rh && (
                    <Button
                      variant="outline"
                      disabled={busy || dirty || motivo.trim().length < 5}
                      onClick={() => act("cancelar")}
                    >
                      Cancelar processo
                    </Button>
                  )}
                </div>
              </div>
              <h3 className="font-semibold">Histórico de conferências</h3>
              {detail.historico.map((h: any) => (
                <p className="text-xs border-b pb-2" key={h.id}>
                  {new Date(h.data).toLocaleString("pt-BR")} · {h.evento} ·{" "}
                  {h.motivo || "Atualização registrada"} · {h.autor}
                </p>
              ))}
              <p className="text-xs">
                A liberação registra a conferência deste processo. Não substitui
                APR/PT nem dispensa reavaliação após vencimentos ou mudanças de
                condição.
              </p>
              <style>
                {
                  "@media print {html,body {overflow:visible!important;height:auto!important} body *{visibility:hidden} .adm-print,.adm-print *{visibility:visible} .adm-print{position:absolute!important;inset:0!important;transform:none!important;max-height:none!important;max-width:none!important;overflow:visible!important;width:100%!important;display:block!important} .no-print,.no-print *{display:none!important} .adm-print fieldset{break-inside:auto}}"
                }
              </style>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
