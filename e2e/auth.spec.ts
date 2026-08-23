import { expect, test } from "../playwright-fixture";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/rest/v1/system_settings**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
});

test("uma rota gerencial exige autenticação", async ({ page }) => {
  await page.goto("/frota");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta!" })).toBeVisible();
});

test("a tela de login apresenta os controles essenciais", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByPlaceholder("Seuemail@exemplo.com")).toBeVisible();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
});

test("não envia o login quando os campos estão vazios", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Preencha todos os campos", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
});

test("permite exibir e ocultar a senha", async ({ page }) => {
  await page.goto("/auth");
  const password = page.locator("#password");
  const toggle = password.locator("xpath=following-sibling::button");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "password");
});
