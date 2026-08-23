import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dev-dist/**",
      "**/node_modules/**",
      "**/android/**",
      "**/Aplicativos/**",
      "fleet-scale-nexus-main/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // O projeto legado ainda possui integrações não cobertas pelos tipos
      // gerados do Supabase. Mantemos a dívida visível sem bloquear correções
      // independentes; novos usos devem evitar `any`.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
