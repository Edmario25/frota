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

  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(`Senha do banco (${USUARIO}@${HOST}): `);
    // Sem eco: a senha não aparece na tela nem em gravação de sessão.
    const aoDigitar = () => process.stdout.write("");
    process.stdin.on("data", aoDigitar);
    rl.question("", resposta => {
      process.stdin.off("data", aoDigitar);
      process.stdout.write("\n");
      rl.close();
      resolve(resposta.trim());
    });
    rl._writeToOutput = () => {};
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
