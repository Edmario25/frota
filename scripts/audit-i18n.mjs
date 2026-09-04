import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src");
const extensions = /\.(tsx?|jsx?)$/;
const portuguese = /[ãõáéíóúâêôçÃÕÁÉÍÓÚÂÊÔÇ]/g;
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name !== "i18n") walk(path);
    }
    else if (extensions.test(name)) files.push(path);
  }
}
walk(root);
const results = files.map(path => {
  const source = readFileSync(path, "utf8");
  return {
    file: relative(process.cwd(), path).replaceAll("\\", "/"),
    occurrences: (source.match(portuguese) ?? []).length,
    integrated: /useI18n|<T(?:\s|>)/.test(source),
  };
}).filter(item => item.occurrences > 0).sort((a, b) => b.occurrences - a.occurrences);

const pending = results.filter(item => !item.integrated);
console.log(`Arquivos com texto em português: ${results.length}`);
console.log(`Integrados à camada de idiomas: ${results.length - pending.length}`);
console.log(`Pendentes de integração: ${pending.length}`);
for (const item of pending.slice(0, 40)) console.log(`${String(item.occurrences).padStart(4)}  ${item.file}`);
if (process.argv.includes("--strict") && pending.length) process.exitCode = 1;
