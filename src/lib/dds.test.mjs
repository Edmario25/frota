import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ddsLocalDate, identifyDdsBadge, ddsSyncPayload } from './dds.ts';
const id = 'af123456-1234-1234-1234-123456789abc';
const equipe = [{ id, nome: 'Pessoa da obra' }];

test('crachá identifica somente funcionário na equipe informada', () => {
  assert.equal(identifyDdsBadge(' ' + id.toUpperCase(), equipe)?.id, id);
  assert.equal(identifyDdsBadge(id, []), undefined);
  assert.equal(identifyDdsBadge('https://qualquer.site/' + id, equipe), undefined);
  assert.equal(identifyDdsBadge('Pessoa da obra', equipe), undefined);
});
test('data usa calendário local, inclusive no fim do mês', () => {
  assert.equal(ddsLocalDate(new Date(2026, 7, 31, 23, 59)), '2026-08-31');
});
test('legado textual não fabrica presenças nem conclui automaticamente', () => {
  const payload = ddsSyncPayload({ participantes_nomes: '12 trabalhadores' }, 'obra', []);
  assert.deepEqual(payload.participantes, []);
  assert.equal(payload.concluir, false);
  assert.equal(payload.participantes_nomes, '12 trabalhadores');
});
test('reenvio mantém dados determinísticos e participantes identificados', () => {
  const data = { participantes: [{ id, origem: 'qr' }], concluir: true, data: '2026-08-29', duracao_min: 15 };
  const a = ddsSyncPayload(data, 'obra', ['https://example.com/foto.jpg']);
  assert.deepEqual(a, ddsSyncPayload(data, 'obra', ['https://example.com/foto.jpg']));
  assert.deepEqual(a.participantes, data.participantes);
  assert.equal(a.concluir, true);
});
