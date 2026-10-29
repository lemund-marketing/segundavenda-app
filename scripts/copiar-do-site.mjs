#!/usr/bin/env node
// Copia arquivos do site para o app, no mesmo caminho, e registra no ORIGEM.json.
//
//   node scripts/copiar-do-site.mjs --site ../segundavenda [--ref origin/test] caminho...
//       Copia cada caminho como está no site (--ref, padrão origin/test).
//
//   ... --ramo <branch> caminho...
//       Leva junto as mudanças que um branch do site fez no arquivo (3 vias:
//       base = onde o branch saiu do --ref, nosso = branch, deles = --ref). Foi
//       assim que o redesenho de celular do branch antigo entrou nas cópias.
//       Conflito: o arquivo não é copiado e o script sai com erro.
//
//   ... --ramo <branch> --novo caminho...
//       Arquivo que só existe no branch (peça nova do redesenho, que o site não
//       tem): copia do branch no mesmo caminho e registra em `novos`. Fica no
//       caminho do branch porque cópias do site importam ele por lá.
//
//   node scripts/copiar-do-site.mjs --site ../segundavenda --derivado src/app/telas/X.tsx origem...
//       Registra um arquivo do app (src/app/) escrito a partir de arquivos do
//       site: a comparação semanal avisa quando essas origens mudam.
//
// Arquivo que já é cópia registrada é pulado (para trazer a versão nova do
// site, use comparar-origem.mjs --juntar). Nunca escreve no site.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const RAIZ = new URL("..", import.meta.url).pathname;
const ARQ_ORIGEM = join(RAIZ, "ORIGEM.json");
const args = process.argv.slice(2);
const tirar = (nome) => {
  const i = args.indexOf(nome);
  if (i === -1) return null;
  const [, v] = args.splice(i, 2);
  return v;
};
const SITE = tirar("--site");
const REF = tirar("--ref") ?? "origin/test";
const RAMO = tirar("--ramo");
const DERIVADO = tirar("--derivado");
const NOVO = args.includes("--novo") ? (args.splice(args.indexOf("--novo"), 1), true) : false;
const caminhos = args;
if (!SITE || !caminhos.length) {
  console.error("Uso: --site <clone do site> [--ref origin/test] [--ramo <branch>] caminho... | --derivado src/app/X origem...");
  process.exit(2);
}

const git = (...a) => execFileSync("git", ["-C", SITE, ...a], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
const texto = (...a) => git(...a).toString("utf8").trim();
const mostrar = (ref, p) => {
  try {
    return git("show", `${ref}:${p}`);
  } catch {
    return null;
  }
};
const base = texto("rev-parse", REF);
const origem = JSON.parse(readFileSync(ARQ_ORIGEM, "utf8"));
const ordenar = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

if (DERIVADO) {
  if (!DERIVADO.startsWith("src/app/")) throw new Error("derivado mora em src/app/");
  origem.derivados[DERIVADO] = {
    commit: base,
    origens: caminhos.map((c) => {
      if (!mostrar(base, c)) throw new Error(`${c} não existe no site em ${REF}`);
      return { caminho: c, blob: texto("rev-parse", `${base}:${c}`) };
    }),
  };
  origem.derivados = ordenar(origem.derivados);
  writeFileSync(ARQ_ORIGEM, JSON.stringify(origem, null, 2) + "\n");
  console.log(`derivado registrado: ${DERIVADO} ← ${caminhos.join(", ")}`);
  process.exit(0);
}

if (NOVO) {
  if (!RAMO) throw new Error("--novo precisa de --ramo");
  origem.novos ??= {};
  const commit = texto("rev-parse", RAMO);
  let falhouNovo = false;
  for (const c of caminhos) {
    if (origem.novos[c] || origem.copias[c]) {
      console.log(`já registrado: ${c}`);
      continue;
    }
    if (mostrar(base, c)) {
      console.error(`${c} existe no site: copie como cópia, não como novo`);
      falhouNovo = true;
      continue;
    }
    const dado = mostrar(commit, c);
    if (!dado) {
      console.error(`${c} não existe no branch ${RAMO}`);
      falhouNovo = true;
      continue;
    }
    const destino = join(RAIZ, c);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, dado);
    origem.novos[c] = { ramo: RAMO, commit };
    console.log(`novo: ${c}`);
  }
  origem.novos = ordenar(origem.novos);
  writeFileSync(ARQ_ORIGEM, JSON.stringify(origem, null, 2) + "\n");
  process.exit(falhouNovo ? 1 : 0);
}

const mb = RAMO ? texto("merge-base", REF, RAMO) : null;
const tmp = mkdtempSync(join(tmpdir(), "copiar-"));
let falhou = false;
for (const c of caminhos) {
  if (origem.copias[c]) {
    console.log(`já é cópia: ${c}`);
    continue;
  }
  if (c.startsWith("src/app/")) throw new Error(`src/app/ é só do app: ${c}`);
  let dado = mostrar(base, c);
  if (!dado) {
    console.error(`não existe no site em ${REF}: ${c}`);
    falhou = true;
    continue;
  }
  let comRamo = false;
  if (RAMO) {
    const doRamo = mostrar(RAMO, c);
    const antes = mostrar(mb, c);
    if (doRamo && antes && !doRamo.equals(antes)) {
      const [fb, fn, fd] = ["base", "nosso", "deles"].map((n) => join(tmp, n));
      writeFileSync(fb, antes);
      writeFileSync(fn, doRamo);
      writeFileSync(fd, dado);
      try {
        dado = execFileSync("git", ["merge-file", "-p", fn, fb, fd], { maxBuffer: 64 << 20 });
        comRamo = true;
      } catch {
        console.error(`conflito ao juntar o branch em ${c}: copie à mão`);
        falhou = true;
        continue;
      }
    }
  }
  const destino = join(RAIZ, c);
  if (existsSync(destino)) {
    console.error(`já existe no app sem registro: ${c}`);
    falhou = true;
    continue;
  }
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, dado);
  origem.copias[c] = { origem: c, commit: base, blob: texto("rev-parse", `${base}:${c}`) };
  console.log(`copiado${comRamo ? " (com o branch)" : ""}: ${c}`);
}
origem.copias = ordenar(origem.copias);
writeFileSync(ARQ_ORIGEM, JSON.stringify(origem, null, 2) + "\n");
process.exit(falhou ? 1 : 0);
