/**
 * Regenera src/integrations/supabase/types.ts a partir do banco.
 *
 * Existe por dois motivos:
 *
 *   1. O comando do Supabase CLI é de terminal, não de SQL. Colado no editor
 *      do Supabase ele devolve "syntax error at or near npx".
 *   2. A connection string carrega a senha do banco. Digitada direto no
 *      terminal, ela fica no histórico do shell e em qualquer captura de tela.
 *      Aqui ela é lida sem eco, usada e descartada.
 *
 * Uso:  node scripts/gerar-types.mjs
 *
 * Também aceita a senha por variável de ambiente, para rodar sem interação:
 *   SUPABASE_DB_PASSWORD=...  node scripts/gerar-types.mjs
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync, copyFileSync, existsSync } from "node:fs";

const HOST   = process.env.SUPABASE_DB_HOST ?? "dadosfrota.apicesystem.shop";
const PORTA  = process.env.SUPABASE_DB_PORT ?? "5432";
const BANCO  = process.env.SUPABASE_DB_NAME ?? "postgres";
const USUARIO= process.env.SUPABASE_DB_USER ?? "postgres";
const DESTINO= "src/integrations/supabase/types.ts";

function perguntarSenha() {
  const pelaVariavel = process.env.SUPABASE_DB_PASSWORD;
  if (pelaVariavel) return Promise.resolve(pelaVariavel);

  // Sob "npm run" o stdin do processo filho costuma não ser um TTY: o prompt
  // não aparece e o script fica esperando uma tecla que ninguém vê como digitar.
  // Era exatamente o que parecia um travamento.
  if (!process.stdin.isTTY) {
    console.error(
      "Este script precisa de um terminal interativo.\n\n" +
      "Rode direto, sem o npm:\n" +
      "  node scripts/gerar-types.mjs\n\n" +
      "Ou passe a senha pelo ambiente:\n" +
      "  $env:SUPABASE_DB_PASSWORD = \"...\" ; npm run types:gen",
    );
    process.exit(1);
  }

  // Leitura em modo cru: cada tecla é tratada à mão, nada é ecoado na tela.
  return new Promise(resolve => {
    process.stdout.write(`Senha do banco (${USUARIO}@${HOST}): `);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let senha = "";
    const aoTeclar = tecla => {
      if (tecla === "\r" || tecla === "\n" || tecla === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", aoTeclar);
        process.stdout.write("\n");
        resolve(senha.trim());
        return;
      }
      if (tecla === "\u0003") {                      // Ctrl+C
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (tecla === "\u007f" || tecla === "\b") {    // Backspace
        senha = senha.slice(0, -1);
        return;
      }
      senha += tecla;
    };
    stdin.on("data", aoTeclar);
  });
}

const senha = await perguntarSenha();
if (!senha) {
  console.error("Nenhuma senha informada. Nada foi alterado.");
  process.exit(1);
}

if (existsSync(DESTINO)) {
  copyFileSync(DESTINO, `${DESTINO}.bak`);
  console.log(`Cópia do arquivo atual em ${DESTINO}.bak`);
}

const url = `postgresql://${USUARIO}:${encodeURIComponent(senha)}@${HOST}:${PORTA}/${BANCO}`;

console.log("Gerando tipos a partir do banco...");
const proc = spawn("npx", ["supabase", "gen", "types", "typescript", "--db-url", url], {
  shell: process.platform === "win32",
});

let saida = "", erro = "";
proc.stdout.on("data", d => { saida += d; });
proc.stderr.on("data", d => { erro += d; });

proc.on("close", codigo => {
  // A senha só existiu em memória: não vai para o histórico do shell nem para
  // o arquivo gerado.
  if (codigo !== 0 || !saida.includes("export type Database")) {
    console.error("\nNão foi possível gerar os tipos.");
    console.error(erro.replace(senha, "***").trim() || `código de saída ${codigo}`);
    console.error("\nO arquivo atual NÃO foi alterado.");
    process.exit(1);
  }
  writeFileSync(DESTINO, saida, "utf8");
  const linhas = saida.split("\n").length;
  console.log(`\nPronto: ${DESTINO} regenerado (${linhas} linhas).`);
  console.log("Agora rode:  npm run typecheck");
});
