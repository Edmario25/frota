import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCost, accumulatedCosts } from './costAnalysis.ts';

test('moeda brasileira e edição canônica preservam centavos', () => {
  for (const input of ['1.500,50', '1500,50', '1500.50', 'R$ 1.500,50']) assert.equal(parseCost(input), 1500.5);
  assert.equal(parseCost('1.500'), 1500);
  assert.equal(parseCost('0'), 0);
  for (const input of ['', '-10', 'texto', '1,2,3', 'Infinity', '12abc']) assert.ok(Number.isNaN(parseCost(input)));
});
test('acumulado mantém saldo entre meses e inclui meses sem lançamentos', () => {
  const result = accumulatedCosts([
    { mes: '2025-12', categoria_nome: 'Materiais', valor_acumulado: 100 },
    { mes: '2026-02', categoria_nome: 'Pessoal', valor_acumulado: 50 },
    { mes: '2026-03', categoria_nome: 'Materiais', valor_acumulado: 180 },
  ]);
  assert.deepEqual(result, [
    { mes: '2025-12', Materiais: 100, Pessoal: 0 },
    { mes: '2026-01', Materiais: 100, Pessoal: 0 },
    { mes: '2026-02', Materiais: 100, Pessoal: 50 },
    { mes: '2026-03', Materiais: 180, Pessoal: 50 },
  ]);
  assert.deepEqual(accumulatedCosts([]), []);
});
