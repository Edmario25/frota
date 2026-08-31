import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aprLocalDateTime,
  aprScore,
  aprSyncPayload,
  aprDraftError,
  aprTransitions,
} from "./apr.ts";
test("calendário local preserva horário na virada de dia", () =>
  assert.equal(
    aprLocalDateTime(new Date(2026, 7, 30, 23, 59)),
    "2026-08-30T23:59",
  ));
test("matriz rejeita avaliações incompletas e fora de escala", () => {
  assert.equal(aprScore(0, 5), null);
  assert.equal(aprScore(2.5, 3), null);
  assert.equal(aprScore(6, 1), null);
  assert.equal(aprScore(3, 5), 15);
});
test("reenvio v2 preserva conteúdo e não inclui status nem versão de protocolo", () => {
  const d = { apr_version: 2, obra_id: "obra", riscos: [], participantes: [] };
  assert.deepEqual(aprSyncPayload(d, "obra"), aprSyncPayload(d, "obra"));
  assert.equal(aprSyncPayload(d, "obra").apr_version, undefined);
});
test("legado não inventa assinaturas nem elimina risco respondido Não", () => {
  const d = aprSyncPayload(
    {
      data: "2026-08-30",
      validade: "2026-08-31",
      riscos_selecionados: [{ risco_id: "1", resposta: "N" }],
    },
    "obra",
  );
  assert.deepEqual(d.participantes, []);
  assert.equal(d.riscos[0].verificado, false);
  assert.equal(d.riscos[0].eliminado, undefined);
  assert.equal(d.data_hora_fim, undefined);
  assert.match(d.validade, /23:59:00-03:00/);
});
test("rascunho valida datas e duplicidades", () => {
  const d = {
    obra_id: "obra",
    local: "local",
    responsavel: "nome",
    data_hora_inicio: "2026-08-30T10:00:00Z",
    validade: "2026-08-30T12:00:00Z",
    riscos: [],
    participantes: [],
  };
  assert.equal(aprDraftError(d), "");
  assert.match(
    aprDraftError({ ...d, validade: d.data_hora_inicio }),
    /posterior/,
  );
  assert.match(
    aprDraftError({ ...d, participantes: [{ id: "1" }, { id: "1" }] }),
    /duplicados/,
  );
});
test("não há salto de rascunho para execução ou reabertura de encerrado", () => {
  assert.equal(aprTransitions.rascunho.includes("em_execucao"), false);
  assert.equal(aprTransitions.concluida, undefined);
  assert.deepEqual(aprTransitions.suspensa, ["rascunho", "cancelada"]);
});
