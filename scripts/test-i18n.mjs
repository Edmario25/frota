import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = readFileSync(new URL(`../src/i18n/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: path => load(path.replace('./','')), Intl, Date });
  cache.set(name, exports);
  return exports;
}
const { catalog } = load('catalog');
const { translate, isLanguage, dateFormat, moneyFormat, numberFormat } = load('core');
const tokens = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
for (const [source, translations] of Object.entries(catalog)) {
  assert.equal(translations.length, 2, source);
  for (const translation of translations) {
    assert.ok(translation.trim().length > 0, source);
    assert.deepEqual(tokens(translation), tokens(source), `Placeholders: ${source}`);
  }
}
assert.equal(translate('en','Funcionários'),'Employees');
assert.equal(translate('es','Funcionários'),'Empleados');
assert.equal(translate('pt-BR','Funcionários'),'Funcionários');
assert.equal(translate('en','texto não migrado'),'texto não migrado');
assert.equal(translate('en','{count} veículos',{count:0}),'Vehicles: 0');
assert.equal(translate('en','{count} veículos',{count:'<script>'}),'Vehicles: <script>');
assert.equal(translate('es','__proto__'),'__proto__');
assert.equal(isLanguage('__proto__'),false);
assert.equal(isLanguage('fr'),false);
assert.equal(isLanguage('pt-BR'),true);
assert.equal(numberFormat('pt-BR',1234.5),'1.234,5');
assert.equal(numberFormat('en',1234.5),'1,234.5');
assert.ok(moneyFormat('en',125).includes('125.00'));
assert.ok(moneyFormat('en',125).includes('R$'));
assert.equal(dateFormat('en','2026-09-02',{day:'numeric',month:'long',year:'numeric'}),'September 2, 2026');
assert.equal(dateFormat('es','not-a-date'),'—');
console.log(`OK: ${Object.keys(catalog).length} textos em três idiomas; parâmetros, fallback, datas, números e moeda preservada.`);
