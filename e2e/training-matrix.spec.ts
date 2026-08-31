import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/__matrix-test',r=>r.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/training-matrix-browser-fixture.tsx"></script></body></html>`}));
 await page.route('**/rest/v1/rpc/sms_matriz_dados',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({data:'2026-08-30',pode_configurar:true,catalogo:[],cargos:[],regras:[],equipe:[{id:'1',nome:'José Silva',cargo:'Motorista',obra_id:'a',obra:'Obra A',requisitos:[]},{id:'2',nome:'Maria Santos',cargo:'Operadora',obra_id:'a',obra:'Obra A',requisitos:[{id:'t',nome:'Integração',status:'a_vencer',realizacao:'2026-08-20',vencimento:'2026-09-10',historico:[]}]}]})}));
 await page.goto('/__matrix-test');
});
test('sem avaliação, validade e busca coerentes',async({page})=>{
 await expect(page.getByText('Não avaliado — defina requisitos')).toBeVisible();
 await expect(page.getByText('100% · 1/1 requisitos atendidos')).toBeVisible();
 await page.getByPlaceholder('Buscar funcionário ou cargo…').fill('jose');
 await expect(page.getByText('Maria Santos')).toHaveCount(0);
 await expect(page.getByText('José Silva')).toBeVisible();
 await expect(page.getByRole('button',{name:'Exportar seleção CSV'})).toBeEnabled();
});
test('falha não mantém indicadores antigos',async({page})=>{
 await expect(page.getByText('José Silva')).toBeVisible();
 await page.route('**/rest/v1/rpc/sms_matriz_dados',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Erro de consulta'})}));
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Erro de consulta');
 await expect(page.getByText('José Silva')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Exportar seleção CSV'})).toBeDisabled();
});
test('celular sem transbordamento',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await expect(page.getByText('José Silva')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:info.outputPath('matrix-mobile.png'),fullPage:true});
});
