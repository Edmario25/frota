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
// Fleet forms keep database values intact while translating interface messages.
const { siteStatusLabel } = load('siteStatus');
assert.equal(siteStatusLabel('em_andamento', source => translate('en', source)), 'In progress');
assert.equal(siteStatusLabel('concluida', source => translate('es', source)), 'Finalizada');
assert.equal(siteStatusLabel('custom-status', source => translate('en', source)), 'custom-status');
assert.equal(siteStatusLabel('__proto__', source => translate('en', source)), '__proto__');
assert.equal(translate('en', '+{distance} km rodados', { distance: '1,234' }), '+1,234 km traveled');
assert.equal(translate('es', '{percent}% do limite', { percent: '75' }), '75% del límite');
assert.equal(translate('en', 'Selecione o fornecedor responsável pela locação'), 'Select the rental supplier');
assert.equal(translate('es', 'Placa é obrigatória'), 'La matrícula es obligatoria');
for (const file of ['components/frota/VehicleFormModal.tsx', 'components/veiculos-pesados/HeavyVehicleFormModal.tsx', 'components/frota/TraccarSyncPanel.tsx']) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function check(node) {
    if (ts.isJsxText(node) && node.text.trim()) {
      const neutralText = new Set(['SUV', 'Sedan', '-', '•', '—', 'km', 'L', 'km/L']);
      assert.ok(neutralText.has(node.text.trim()), `Untranslated fleet text in ${file}: ${node.text.trim()}`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't'
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      assert.ok(Object.hasOwn(catalog, node.arguments[0].text), `Missing fleet translation: ${node.arguments[0].text}`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['min', 'max'].includes(node.expression.name.text) && node.arguments[1] && ts.isStringLiteral(node.arguments[1])) {
      assert.ok(Object.hasOwn(catalog, node.arguments[1].text), `Missing schema translation: ${node.arguments[1].text}`);
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'message' && ts.isStringLiteral(node.initializer)) {
      assert.ok(Object.hasOwn(catalog, node.initializer.text), `Missing validation translation: ${node.initializer.text}`);
    }
    ts.forEachChild(node, check);
  }
  check(ast);
}
console.log(`OK: ${Object.keys(catalog).length} textos em três idiomas; parâmetros, fallback, datas, números e moeda preservada.`);
