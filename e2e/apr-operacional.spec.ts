import { test, expect } from "@playwright/test";
const id = "00000000-0000-0000-0000-000000000010",
  obra = "00000000-0000-0000-0000-000000000002";
const apr = {
  id,
  obra_id: obra,
  status: "em_analise",
  versao: 1,
  revisao: 1,
  local: "Frente A",
  responsavel: "Responsável",
  descricao_trabalho: "Inspeção de campo",
  data_hora_inicio: "2026-08-30T10:00:00Z",
  validade: "2026-08-30T18:00:00Z",
  plano: { riscos: [], emergencia: "Contato da brigada" },
};
test.beforeEach(async ({ page }) => {
  page.on('pageerror',error=>console.log('APR browser:',error.message));
  await page.route("**/__apr-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/apr-browser-fixture.tsx"></script></body></html>`,
    }),
  );
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const name = route.request().url().split("/").pop();
    let data: unknown = {};
    if (name === "apr_listar")
      data = {
        itens: [{ ...apr, obra: "Obra teste", riscos: 1, envolvidos: 1 }],
        total: 1,
        pendentes: 1,
        vencidas: 0,
        execucao: 0,
      };
    if (name === "apr_catalogos")
      data = { tipos: [], riscos: [], treinamentos: [], pts: [] };
    if (name === "dds_equipe") data = [];
    if (name === "apr_detalhe")
      data = {
        apr,
        equipe: [],
        pendencias: ["Ciência pendente"],
        riscos_legados: [],
        historico: [],
      };
    if (name === "apr_transicao")
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Liberação bloqueada: ciência pendente",
        }),
      });
    if (name === "apr_salvar") data = id;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/__apr-test");
});
test("listagem, pendências e erro de liberação não alteram status", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "APR — Análise Preliminar de Riscos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Detalhe", exact: true }).click();
  await expect(
    page.getByText("Ciência pendente", { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Justificativa da análise, liberação ou alteração…")
    .fill("Conferência da atividade");
  await page.getByRole("button", { name: "Liberada", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Liberação bloqueada",
  );
  await expect(
    page.getByRole("dialog").getByRole("heading").first(),
  ).toContainText("Em análise");
});
test("novo rascunho é gravado em uma chamada e mantém horários ISO", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Nova APR", exact: true }).click();
  await page
    .getByLabel("Local / frente de serviço *", { exact: true })
    .fill("Frente B");
  await page
    .getByLabel("Responsável pela atividade *", { exact: true })
    .fill("Responsável teste");
  const req = page.waitForRequest((r) => r.url().endsWith("/rpc/apr_salvar"));
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  const data = (await req).postDataJSON();
  expect(data.p_dados.obra_id).toBe(obra);
  expect(data.p_dados.data_hora_inicio).toMatch(/Z$/);
  expect(data.p_dados.participantes).toEqual([]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("formulário utilizável em tela móvel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Nova APR", exact: true }).click();
  await expect(
    page.getByLabel("Local / frente de serviço *", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({path:testInfo.outputPath('apr-mobile.png'),fullPage:true});
});
