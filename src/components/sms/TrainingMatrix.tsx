import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/exportCsv";
import {
  filterMatrix,
  matrixCsv,
  matrixMetrics,
  matrixPercent,
  isValidTraining,
  trainingLabels,
  MatrixRow,
} from "@/lib/trainingMatrix";
type Option = { id: string; nome: string };
type Rule = {
  id: string;
  obra_id: string;
  cargo_id: string | null;
  treinamento_id: string;
  ativo: boolean;
  motivo: string;
};
type Data = {
  data: string;
  equipe: MatrixRow[];
  pode_configurar: boolean;
  catalogo: (Option & { obrigatorio: boolean })[];
  cargos: Option[];
  regras: Rule[];
};
const dateLabel = (s: string | null) =>
  s ? s.split("-").reverse().join("/") : "—";
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export function TrainingMatrix({ obras }: { obras: Option[] }) {
  const [data, setData] = useState<Data | null>(null),
    [obra, setObra] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [cargo, setCargo] = useState(""),
    [days, setDays] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [ruleCargo, setRuleCargo] = useState(""),
    [training, setTraining] = useState(""),
    [reason, setReason] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const n = ++request.current;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const d = await rpc("sms_matriz_dados", { p_obra: obra || null });
      if (n === request.current) setData(d);
    } catch (e) {
      if (n === request.current)
        setError(
          e instanceof Error ? e.message : "Falha ao consultar a matriz",
        );
    } finally {
      if (n === request.current) setLoading(false);
    }
  }, [obra]);
  useEffect(() => {
    load();
    return () => {
      request.current++;
    };
  }, [load]);
  useEffect(() => {
    setPage(0);
  }, [obra, search, status, cargo, days]);
  const rows = filterMatrix(
      data?.equipe || [],
      search,
      status,
      cargo,
      days,
      data?.data || "",
    ),
    metrics = matrixMetrics(rows);
  async function saveRule(c: string, t: string, active: boolean) {
    setBusy(true);
    setError("");
    try {
      await rpc("sms_matriz_regra", {
        p_obra: obra,
        p_cargo: c || null,
        p_treinamento: t,
        p_ativo: active,
        p_motivo: reason,
      });
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }
  const selectClass =
    "border rounded-md bg-background p-2 max-w-full min-w-0 text-sm";
  return (
    <div className="space-y-5 max-w-screen-xl mx-auto">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Matriz de Treinamentos e Pendências
          </h1>
          <p className="text-sm text-muted-foreground">
            Equipe ativa e requisitos aplicáveis por obra. Capacitação não
            substitui liberação de trabalho.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading || busy} onClick={load}>
            Atualizar
          </Button>
          <Button
            variant="outline"
            disabled={!data || loading || !rows.length}
            onClick={() =>
              downloadCsv(
                [
                  "Data de referência",
                  "Obra",
                  "Funcionário",
                  "Cargo",
                  "Requisito",
                  "Situação",
                  "Realização",
                  "Vencimento",
                  "Conformidade",
                ],
                matrixCsv(rows, data!.data),
                `matriz_treinamentos_${data!.data}`,
              )
            }
          >
            Exportar seleção CSV
          </Button>
          <Button asChild>
            <Link to="/sms/treinamentos">Registrar treinamento</Link>
          </Button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 text-red-800 rounded p-3"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Buscar funcionário ou cargo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Obra"
          className={selectClass}
          value={obra}
          onChange={(e) => {
            setObra(e.target.value);
            setCargo("");
            setTraining("");
            setRuleCargo("");
          }}
        >
          <option value="">Todas as obras autorizadas</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Cargo"
          className={selectClass}
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
        >
          <option value="">Todos os cargos</option>
          {Array.from(new Set(data?.equipe.map((r) => r.cargo).filter(Boolean)))
            .sort()
            .map((c) => (
              <option key={c!} value={c!}>
                {c}
              </option>
            ))}
        </select>
        <select
          aria-label="Situação"
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todas as situações</option>
          <option value="nao_avaliado">Não avaliado</option>
          {Object.entries(trainingLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Vencimentos"
          className={selectClass}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="">Todos os vencimentos</option>
          {[30, 60, 90].map((n) => (
            <option key={n} value={n}>
              Válidos vencendo em até {n} dias
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p role="status">Carregando equipe e requisitos…</p>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                [
                  "Funcionários / vínculos",
                  `${metrics.pessoas} / ${metrics.vinculos}`,
                ],
                [
                  "Requisitos atendidos",
                  metrics.percent === null
                    ? "Não avaliado"
                    : `${metrics.percent}% · ${metrics.valid}/${metrics.required}`,
                ],
                ["Vínculos com pendências", metrics.pending],
                ["Sem requisitos definidos", metrics.notEvaluated],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold mt-2">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Referência: {dateLabel(data.data)} (Brasília). Percentual
              ponderado pelos requisitos do recorte; “a vencer” ainda atende.
              Sem requisitos: não avaliado, fora do percentual. Filtros
              selecionam vínculos; seus requisitos completos são exibidos e
              exportados.
            </p>
            {data.pode_configurar && (
              <details className="border rounded-xl p-4">
                <summary className="cursor-pointer font-semibold">
                  Configurar requisitos por obra e cargo
                </summary>
                <p className="text-sm my-3">
                  Regras gerais do catálogo e da integração continuam exigidas.
                  Desativar uma regra aqui não remove outras exigências.
                  Requisitos de atividades específicas permanecem na APR.
                </p>
                {!obra ? (
                  <p>Selecione uma obra no filtro acima.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <select
                        aria-label="Cargo da regra"
                        className={selectClass}
                        value={ruleCargo}
                        onChange={(e) => setRuleCargo(e.target.value)}
                      >
                        <option value="">Toda a equipe da obra</option>
                        {data.cargos.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Treinamento exigido"
                        className={selectClass}
                        value={training}
                        onChange={(e) => setTraining(e.target.value)}
                      >
                        <option value="">Selecione treinamento</option>
                        {data.catalogo.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.nome}
                            {c.obrigatorio ? " · Geral obrigatório" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      placeholder="Justificativa da alteração de requisito…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      disabled={busy || !training || reason.trim().length < 5}
                      onClick={() => saveRule(ruleCargo, training, true)}
                    >
                      Exigir treinamento
                    </Button>
                    {data.regras.map((r) => (
                      <div
                        className="border-t py-2 flex flex-wrap gap-2 items-center"
                        key={r.id}
                      >
                        <span className="flex-1 text-sm">
                          {data.catalogo.find((c) => c.id === r.treinamento_id)
                            ?.nome || r.treinamento_id}{" "}
                          ·{" "}
                          {data.cargos.find((c) => c.id === r.cargo_id)?.nome ||
                            "Toda a equipe"}{" "}
                          · {r.ativo ? "Ativa" : "Inativa"}
                          <small className="block text-muted-foreground">
                            Última justificativa: {r.motivo}
                          </small>
                        </span>
                        <Button
                          variant="outline"
                          disabled={busy || reason.trim().length < 5}
                          onClick={() =>
                            saveRule(
                              r.cargo_id || "",
                              r.treinamento_id,
                              !r.ativo,
                            )
                          }
                        >
                          {r.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )}
            {!rows.length ? (
              <p className="border rounded-xl p-8 text-center">
                Nenhum vínculo ativo corresponde aos filtros.
              </p>
            ) : (
              rows.slice(page * 25, page * 25 + 25).map((r) => (
                <details
                  key={r.id + "|" + r.obra_id}
                  className="border rounded-xl bg-card p-4"
                >
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{r.nome}</span>
                    <span className="block text-sm text-muted-foreground">
                      {r.obra} · {r.cargo || "Cargo não definido"}
                    </span>
                    <span className="block mt-1 text-sm">
                      {matrixPercent(r) === null
                        ? "Não avaliado — defina requisitos"
                        : `${matrixPercent(r)}% · ${r.requisitos.filter(isValidTraining).length}/${r.requisitos.length} requisitos atendidos`}
                      {r.requisitos.some((t) => !isValidTraining(t))
                        ? " · Pendências de capacitação"
                        : ""}
                    </span>
                  </summary>
                  <div className="mt-4 space-y-2">
                    {r.requisitos.map((t) => (
                      <div key={t.id} className="border rounded-lg p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong className="text-sm">{t.nome}</strong>
                          <span
                            className={`text-xs rounded px-2 py-1 ${isValidTraining(t) ? (t.status === "a_vencer" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800") : "bg-red-50 text-red-800"}`}
                          >
                            {trainingLabels[t.status]}
                          </span>
                        </div>
                        <p className="text-xs mt-2">
                          Realização: {dateLabel(t.realizacao)} · Vencimento:{" "}
                          {dateLabel(t.vencimento)}
                        </p>
                        {t.historico.length > 0 && (
                          <details className="mt-2 text-xs">
                            <summary>
                              Histórico de registros ({t.historico.length})
                            </summary>
                            {t.historico.map((h) => (
                              <p key={h.id} className="mt-2">
                                Realizado em {dateLabel(h.realizacao)} · vence{" "}
                                {dateLabel(h.vencimento)} · status gravado:{" "}
                                {h.status_registrado}
                              </p>
                            ))}
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))
            )}
            <div className="flex justify-end gap-3 items-center">
              <Button
                variant="outline"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">
                Página {page + 1} · {rows.length} vínculos
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
