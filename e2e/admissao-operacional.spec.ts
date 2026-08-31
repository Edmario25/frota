import { test, expect } from "@playwright/test";
const admission = {
  id: "adm-1",
  obra_id: "obra-1",
  versao: 1,
  ciclo: 1,
  status: "em_andamento",
  data_admissao: "2026-08-30",
  requisitos: [
    { id: "doc", nome: "Identificação", area: "rh", status: "pendente" },
  ],
  treinamentos_exigidos: [],
  epis_exigidos: [],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/__admissao-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/admissao-browser-fixture.tsx"></script></body></html>`,
    }),
  );
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const name = route.request().url().split("/").pop();
    let data: any = {};
    if (name === "adm_listar")
      data = {
        itens: [
          {
            ...admission,
            nome: "Funcionário teste",
            obra: "Obra teste",
            pendencias: ["Documento pendente"],
          },
        ],
        total: 1,
        mes: 1,
        liberados: 0,
        atrasados: 0,
      };
    if (name === "adm_catalogos")
      data = { equipe: [], epis: [], treinamentos: [], perfis: [] };
    if (name === "adm_detalhe")
      data = {
        admissao: admission,
        pode_rh: true,
        pendencias: ["Documento pendente"],
        arquivos: [],
        historico: [],
        treinamentos: [],
      };
    if (name === "adm_acao")
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Liberação bloqueada: documento pendente",
        }),
      });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/__admissao-test");
});
test("pendência e recusa do banco permanecem visíveis", async ({ page }) => {
  await page.getByRole("button", { name: "Detalhe", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Documento pendente", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByPlaceholder("Justificativa da conferência, liberação ou reabertura…")
    .fill("Conferência solicitada");
  await dialog
    .getByRole("button", { name: "Liberar para obra", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Liberação bloqueada");
  await expect(
    dialog.getByRole("button", { name: "Salvar alterações" }),
  ).toBeDisabled();
});
test("formulário acessível em tela de celular", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Detalhe", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("admissao-mobile.png") });
});
