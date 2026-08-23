import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

Object.assign(process.env, loadEnv("test", process.cwd(), ""));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "rls-isolation.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
});
