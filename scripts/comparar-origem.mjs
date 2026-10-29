#!/usr/bin/env node
// Compara as cópias do app com o site (ver ORIGEM.json).
//
//   node scripts/comparar-origem.mjs --checar
//       Sem o site. Confere que todo arquivo de src/ fora de src/app/ está
//       registrado no ORIGEM.json (cópia do site ou peça nova do redesenho) e
//       que todo registro existe.
//       Roda no CI de todo push.
//
//   node scripts/comparar-origem.mjs --site ../segundavenda [--ref origin/test] [--juntar] [--relatorio saida.md]
//       Com um clone do site (só leitura: o script nunca escreve lá). Lista o
//       que mudou no site desde a cópia. Com --juntar, traz as mudanças para as
//       cópias em 3 vias (base = site no commit registrado, nosso = app, deles =
//       site no --ref) e atualiza o ORIGEM.json; o que conflitar fica de fora,
//       para juntar à mão. Derivados (src/app/) só são listados.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const RAIZ = new URL("..", import.meta.url).pathname;
const ARQ_ORIGEM = join(RAIZ, "ORIGEM.json");
const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i === -1 ? null : args[i + 1];
};
const origem = JSON.parse(readFileSync(ARQ_ORIGEM, "utf8"));

if (args.includes("--checar")) process.exit(checar());
const SITE = opcao("--site");
if (!SITE) {
  console.error("Uso: --checar | --site <clone do site> [--ref origin/test] [--juntar] [--relatorio saida.md]");
  process.exit(2);
}
process.exit(comparar(SITE, opcao("--ref") ?? "origin/test", args.includes("--juntar"), opcao("--relatorio")));

function checar() {
  const problemas = [];
  const arquivos = listar(join(RAIZ, "src")).map((a) => relative(RAIZ, a));
  for (const a of arquivos) {
    if (a.startsWith("src/app/")) continue;
    if (!origem.copias[a] && !origem.novos?.[a]) problemas.push(`${a}: está fora de src/app/ mas não está no ORIGEM.json (copias ou novos)`);
  }
  for (const a of [...Object.keys(origem.copias), ...Object.keys(origem.novos ?? {}), ...Object.keys(origem.derivados)]) {
    if (!existsSync(join(RAIZ, a))) problemas.push(`${a}: está no ORIGEM.json mas não existe`);
  }
  for (const a of Object.keys(origem.derivados)) {
    if (!a.startsWith("src/app/")) problemas.push(`${a}: derivado tem de morar em src/app/`);
  }
  if (problemas.length) {
    console.error("ORIGEM.json fora de ordem:\n- " + problemas.join("\n- "));
    console.error("\nArquivo novo do app vai em src/app/. Cópia do site entra pelo ORIGEM.json (ver LEIA-ME).");
    return 1;
  }
  console.log(
    `ORIGEM.json em ordem: ${Object.keys(origem.copias).length} cópias, ${Object.keys(origem.novos ?? {}).length} novos, ${Object.keys(origem.derivados).length} derivados.`,
  );
  return 0;
}

function comparar(site, ref, juntar, relatorio) {
  const git = (...a) => execFileSync("git", ["-C", site, ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
  const blobNo = (r, p) => {
    try {
      return git("rev-parse", `${r}:${p}`).trim();
    } catch {
      return null; // não existe nesse commit
    }
  };
  const alvo = git("rev-parse", ref).trim();
  const tmp = mkdtempSync(join(tmpdir(), "origem-"));
  const linhas = [`# Mudanças no site desde a cópia`, ``, `Site em \`${ref}\` = \`${alvo.slice(0, 8)}\`.`, ``];
  const juntados = [];
  const conflitos = [];
  const mudaram = [];
  const sumiram = [];

  for (const [arquivo, c] of Object.entries(origem.copias)) {
    const novo = blobNo(alvo, c.origem);
    if (novo === c.blob) continue;
    if (!novo) {
      sumiram.push(arquivo);
      continue;
    }
    if (!juntar) {
      mudaram.push(arquivo);
      continue;
    }
    const base = join(tmp, "base");
    const deles = join(tmp, "deles");
    const nosso = join(tmp, "nosso");
    writeFileSync(base, execFileSync("git", ["-C", site, "cat-file", "blob", c.blob]));
    writeFileSync(deles, execFileSync("git", ["-C", site, "cat-file", "blob", novo]));
    writeFileSync(nosso, readFileSync(join(RAIZ, arquivo)));
    try {
      execFileSync("git", ["merge-file", nosso, base, deles]);
      writeFileSync(join(RAIZ, arquivo), readFileSync(nosso));
      origem.copias[arquivo] = { ...c, commit: alvo, blob: novo };
      juntados.push(arquivo);
    } catch {
      conflitos.push(arquivo);
    }
  }

  // Peça nova do app num caminho do site: se o site criar um arquivo ali, os
  // dois passam a disputar o mesmo nome.
  const colisoes = Object.keys(origem.novos ?? {}).filter((a) => blobNo(alvo, a));

  const derivadosMudados = [];
  for (const [arquivo, d] of Object.entries(origem.derivados)) {
    const mudadas = d.origens.filter((o) => blobNo(alvo, o.caminho) !== o.blob).map((o) => o.caminho);
    if (mudadas.length) derivadosMudados.push({ arquivo, commit: d.commit, mudadas });
  }

  const secao = (titulo, itens, fmt = (x) => `- \`${x}\``) => {
    if (!itens.length) return;
    linhas.push(`## ${titulo}`, ``, ...itens.map(fmt), ``);
  };
  secao("Juntadas sozinhas (conferir e testar)", juntados);
  secao("Conflito: juntar à mão", conflitos);
  secao("Mudaram no site (rode com --juntar para trazer)", mudaram);
  secao("Sumiram do site (o app ainda usa a cópia)", sumiram);
  secao("O site criou um arquivo no caminho de uma peça nova do app (renomear a do app)", colisoes);
  secao("Derivados: portar a regra à mão", derivadosMudados, (d) => {
    const diff = git("diff", "--stat", d.commit, alvo, "--", ...d.mudadas).trim().split("\n").pop();
    return `- \`${d.arquivo}\` ← ${d.mudadas.map((m) => `\`${m}\``).join(", ")} (${diff}; \`git diff ${d.commit.slice(0, 8)} ${alvo.slice(0, 8)} -- ${d.mudadas.join(" ")}\`)`;
  });
  const total = juntados.length + conflitos.length + mudaram.length + sumiram.length + colisoes.length + derivadosMudados.length;
  if (!total) linhas.push("Nada mudou nos arquivos que o app copiou.");

  if (juntados.length) writeFileSync(ARQ_ORIGEM, JSON.stringify(origem, null, 2) + "\n");
  const texto = linhas.join("\n") + "\n";
  if (relatorio) writeFileSync(relatorio, texto);
  console.log(texto);
  return 0;
}

function listar(pasta) {
  return readdirSync(pasta).flatMap((n) => {
    const p = join(pasta, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
}
