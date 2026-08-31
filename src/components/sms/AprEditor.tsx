import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { smsDb } from "@/lib/sms-offline-db";
import {
  AprPayload,
  AprRisk,
  aprDraftError,
  aprLocalDateTime,
  aprScore,
} from "@/lib/apr";
import { DdsEmployee, DdsParticipants } from "./DdsParticipants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Catalog = {
  tipos: { id: string; nome: string }[];
  riscos: { id: string; nome: string; descricao?: string }[];
  treinamentos: { id: string; nome: string; obrigatorio: boolean }[];
  pts: { id: string; atividade: string; aprovado_por?: string }[];
};
const emptyCatalog: Catalog = {
  tipos: [],
  riscos: [],
  treinamentos: [],
  pts: [],
};
export function AprEditor({
  obras,
  initial,
  responsavel = "",
  onSave,
  onCancel,
}: {
  obras: { id: string; nome: string }[];
  initial?: Partial<AprPayload>;
  responsavel?: string;
  onSave: (d: AprPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<AprPayload>({
    obra_id: obras[0]?.id || "",
    tipo_atividade_id: "",
    local: "",
    responsavel,
    descricao_trabalho: "",
    data_hora_inicio: aprLocalDateTime(),
    validade: "",
    observacoes: "",
    emergencia: "",
    exige_pt: false,
    pt_id: "",
    riscos: [],
    participantes: [],
    treinamentos: [],
    ...initial,
  });
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog),
    [equipe, setEquipe] = useState<DdsEmployee[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const field = <K extends keyof AprPayload>(k: K, v: AprPayload[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setCatalog(emptyCatalog);
    setEquipe([]);
    setError("");
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const key = `apr-refs:${session?.user.id}:${d.obra_id}`;
        if (!navigator.onLine) {
          const cached = await smsDb.getRef<{
            catalog: Catalog;
            equipe: DdsEmployee[];
          }>(key);
          if (!cached)
            throw new Error(
              "Conecte-se para carregar a equipe e o catálogo desta obra.",
            );
          if (active) {
            setCatalog(cached.catalog);
            setEquipe(cached.equipe);
          }
          return;
        }
        const [a, b] = await Promise.all([
          (supabase as any).rpc("apr_catalogos", { p_obra: d.obra_id }),
          (supabase as any).rpc("dds_equipe", { p_obra: d.obra_id }),
        ]);
        if (a.error || b.error) throw a.error || b.error;
        await smsDb.setRef(key, { catalog: a.data, equipe: b.data });
        if (active) {
          setCatalog(a.data);
          setEquipe(b.data);
        }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [d.obra_id]);
  const risk = (id: string, patch: Partial<AprRisk>) =>
    field(
      "riscos",
      d.riscos.map((r) => (r.risco_id === id ? { ...r, ...patch } : r)),
    );
  async function save() {
    const message = aprDraftError(d);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...d,
        data_hora_inicio: new Date(d.data_hora_inicio).toISOString(),
        validade: d.validade ? new Date(d.validade).toISOString() : "",
      });
    } catch (e: any) {
      setError(e.message || "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">
        Este formulário salva um rascunho. A atividade só pode iniciar após
        análise, ciência da equipe e liberação online. Toda edição invalida as
        ciências anteriores.
      </p>
      {error && (
        <p role="alert" className="text-red-700 border rounded p-3">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            Obra *
            <select
              className="w-full border rounded p-2"
              value={d.obra_id}
              onChange={(e) =>
                setD((p) => ({
                  ...p,
                  obra_id: e.target.value,
                  participantes: [],
                  pt_id: "",
                }))
              }
            >
              <option value="">Selecione a obra</option>
              {obras.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de atividade
            <select
              className="w-full border rounded p-2"
              value={d.tipo_atividade_id}
              onChange={(e) => field("tipo_atividade_id", e.target.value)}
            >
              <option value="">Selecione</option>
              {catalog.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Local / frente de serviço *
            <Input
              value={d.local}
              onChange={(e) => field("local", e.target.value)}
            />
          </label>
          <label>
            Responsável pela atividade *
            <Input
              value={d.responsavel}
              onChange={(e) => field("responsavel", e.target.value)}
            />
          </label>
          <label>
            Início previsto *
            <Input
              type="datetime-local"
              value={d.data_hora_inicio}
              onChange={(e) => field("data_hora_inicio", e.target.value)}
            />
          </label>
          <label>
            Validade até
            <Input
              type="datetime-local"
              value={d.validade}
              onChange={(e) => field("validade", e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          Descrição do trabalho
          <Textarea
            value={d.descricao_trabalho}
            onChange={(e) => field("descricao_trabalho", e.target.value)}
          />
        </label>
        <h3 className="font-semibold">Etapas, riscos e medidas de controle</h3>
        <p className="text-xs text-muted-foreground">
          Catálogo geral: selecione os riscos da atividade. S = identificado; N
          = não identificado; N/A = não aplicável. Nenhuma resposta elimina
          automaticamente um risco.
        </p>
        <Input
          placeholder="Buscar risco no catálogo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-40 overflow-auto border rounded">
          {catalog.riscos
            .filter((r) => r.nome.toLowerCase().includes(search.toLowerCase()))
            .map((r) => (
              <label key={r.id} className="flex gap-2 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.riscos.some((x) => x.risco_id === r.id)}
                  onChange={(e) =>
                    field(
                      "riscos",
                      e.target.checked
                        ? [
                            ...d.riscos,
                            {
                              risco_id: r.id,
                              nome: r.nome,
                              resposta: "S",
                              etapa: "",
                              medida_controle: "",
                              responsavel: "",
                              p: 0,
                              s: 0,
                              pr: 0,
                              sr: 0,
                              verificado: false,
                              evidencia: "",
                            },
                          ]
                        : d.riscos.filter((x) => x.risco_id !== r.id),
                    )
                  }
                />
                {r.nome}
              </label>
            ))}
        </div>
        <p className="text-xs">
          Matriz operacional 5×5: probabilidade de 1 (rara) a 5 (quase certa);
          severidade de 1 (leve) a 5 (catastrófica). Residual ≥ 15 bloqueia
          liberação. Os critérios devem ser validados pelo responsável SMS.
        </p>
        {d.riscos.map((r) => (
          <section key={r.risco_id} className="border rounded-xl p-4 space-y-3">
            <div className="flex justify-between gap-2">
              <strong>
                {r.nome ||
                  catalog.riscos.find((x) => x.id === r.risco_id)?.nome ||
                  r.risco_id}
              </strong>
              <select
                aria-label="Aplicabilidade"
                value={r.resposta}
                onChange={(e) =>
                  risk(r.risco_id, {
                    resposta: e.target.value as AprRisk["resposta"],
                  })
                }
              >
                {["S", "N", "NA"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            {r.resposta === "S" && (
              <>
                <label className="block">
                  Etapa / tarefa
                  <Input
                    value={r.etapa}
                    onChange={(e) =>
                      risk(r.risco_id, { etapa: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  Medidas de controle
                  <Textarea
                    value={r.medida_controle}
                    onChange={(e) =>
                      risk(r.risco_id, { medida_controle: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  Responsável pelo controle
                  <Input
                    value={r.responsavel}
                    onChange={(e) =>
                      risk(r.risco_id, { responsavel: e.target.value })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["p", "s", "pr", "sr"] as const).map((k) => (
                    <label key={k} className="text-xs">
                      {
                        {
                          p: "Prob. inicial",
                          s: "Sev. inicial",
                          pr: "Prob. residual",
                          sr: "Sev. residual",
                        }[k]
                      }
                      <select
                        className="w-full border rounded p-2"
                        value={r[k]}
                        onChange={(e) =>
                          risk(r.risco_id, { [k]: Number(e.target.value) })
                        }
                      >
                        <option value="0">Avaliar</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="text-sm">
                  Inicial: {aprScore(r.p, r.s) ?? "—"} / Residual:{" "}
                  {aprScore(r.pr, r.sr) ?? "—"}
                </p>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={r.verificado}
                    onChange={(e) =>
                      risk(r.risco_id, { verificado: e.target.checked })
                    }
                  />
                  Controle verificado em campo
                </label>
                <label className="block">
                  Evidência / referência da verificação
                  <Textarea
                    value={r.evidencia}
                    onChange={(e) =>
                      risk(r.risco_id, { evidencia: e.target.value })
                    }
                  />
                </label>
              </>
            )}
          </section>
        ))}
        <h3 className="font-semibold">Equipe da obra</h3>
        {loading ? (
          <p>Carregando equipe…</p>
        ) : (
          <DdsParticipants
            disabled={busy}
            equipe={equipe}
            value={d.participantes}
            onChange={(v) => field("participantes", v)}
          />
        )}
        <h3 className="font-semibold">
          Treinamentos exigidos para esta atividade
        </h3>
        <div className="max-h-40 overflow-auto">
          {catalog.treinamentos.map((t) => (
            <label className="flex gap-2 p-2" key={t.id}>
              <input
                type="checkbox"
                disabled={t.obrigatorio}
                checked={t.obrigatorio || d.treinamentos.includes(t.id)}
                onChange={(e) =>
                  field(
                    "treinamentos",
                    e.target.checked
                      ? [...d.treinamentos, t.id]
                      : d.treinamentos.filter((id) => id !== t.id),
                  )
                }
              />
              {t.nome}
              {t.obrigatorio ? " (obrigatório geral)" : ""}
            </label>
          ))}
        </div>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={d.exige_pt}
            onChange={(e) => field("exige_pt", e.target.checked)}
          />
          Esta atividade exige Permissão de Trabalho
        </label>
        {d.exige_pt && (
          <label className="block">
            PT da mesma obra
            <select
              className="w-full border rounded p-2"
              value={d.pt_id}
              onChange={(e) => field("pt_id", e.target.value)}
            >
              <option value="">Selecionar PT</option>
              {catalog.pts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.atividade} — {p.id.slice(0, 8)}{" "}
                  {p.aprovado_por ? "(aprovada)" : "(pendente)"}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          Resposta a emergências, contato e ponto de encontro
          <Textarea
            value={d.emergencia}
            onChange={(e) => field("emergencia", e.target.value)}
          />
        </label>
        <label className="block">
          Condições especiais / observações
          <Textarea
            value={d.observacoes}
            onChange={(e) => field("observacoes", e.target.value)}
          />
        </label>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Voltar
        </Button>
        <Button disabled={busy || loading} onClick={save}>
          {busy ? "Salvando…" : "Salvar rascunho"}
        </Button>
      </div>
    </div>
  );
}
