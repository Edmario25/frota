import {test} from 'node:test';import assert from 'node:assert/strict';
import {matrixPercent,matrixMetrics,filterMatrix,matrixCsv} from './trainingMatrix.ts';
const r={id:'1',nome:'José',cargo:'Motorista',obra_id:'a',obra:'Obra A',requisitos:[]};
const t=(status,vencimento=null)=>({id:status,nome:status,status,vencimento,realizacao:null,historico:[]});
test('sem requisitos não equivale a 100%',()=>assert.equal(matrixPercent(r),null));
test('a vencer atende e percentual é ponderado',()=>{const rows=[{...r,requisitos:[t('a_vencer')]},{...r,id:'2',requisitos:[t('valido'),t('vencido'),t('nao_realizado')]}];assert.equal(matrixPercent(rows[0]),100);assert.equal(matrixMetrics(rows).percent,50);});
test('filtros e exportação usam os mesmos vínculos',()=>{const rows=[r,{...r,id:'2',nome:'Outra pessoa',requisitos:[t('valido')]}];const filtered=filterMatrix(rows,'jose','','','','2026-08-30');assert.equal(filtered.length,1);assert.equal(matrixCsv(filtered,'2026-08-30').length,1);});
test('vencimentos excluem certificados já vencidos',()=>{const rows=[{...r,requisitos:[t('vencido','2026-08-29')]},{...r,id:'2',requisitos:[t('a_vencer','2026-09-10')]}];assert.equal(filterMatrix(rows,'','','','30','2026-08-30')[0].id,'2');});
test('exportação neutraliza fórmula',()=>assert.equal(matrixCsv([{...r,nome:'=1+1'}],'2026-08-30')[0][2],"'=1+1"));
