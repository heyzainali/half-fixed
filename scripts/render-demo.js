#!/usr/bin/env node
// Renders docs/demo/scan.svg, the animated terminal at the top of the README.
// It runs the real CLI against prism-php/prism at the commit before
// prism-php/prism#1038, so the output in the demo is genuine and repeatable:
//
//   git clone https://github.com/prism-php/prism.git /tmp/prism
//   git -C /tmp/prism checkout 5d6cc65b80b19cf3f22744703ac0c727b68cdca8
//   node scripts/render-demo.js /tmp/prism
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repoRoot, "docs", "demo", "scan.svg");
const PRISM_REV = "5d6cc65b80b19cf3f22744703ac0c727b68cdca8";
const ARGS = ["scan", "--group", "ToolMap"];
const COMMENT = "# Groq, Mistral, xAI and Z still had the bug: fixed in prism-php/prism#1038";

const COLS = 100;
const FONT = 14;
const CHAR = FONT * 0.6;
const LINE = 20;
const PAD = 18;
const BAR = 34;
const LOOP = 14;

const COLORS = { bg: "#0d1117", bar: "#161b22", border: "#30363d", fg: "#c9d1d9", dim: "#8b949e", 31: "#ff7b72", 32: "#7ee787", 33: "#e3b341", prompt: "#79c0ff", comment: "#d2a8ff" };

async function captureScan(cwd) {
  let text = "";
  const stdout = { isTTY: true, write: (chunk) => { text += chunk; return true; } };
  await runCli(ARGS, { cwd, stdout, stderr: stdout, env: {} });
  return text.replace(/\n+$/, "").split("\n");
}

/** Splits a line with SGR escapes into styled runs. */
export function ansiRuns(line) {
  const runs = [];
  let style = {};
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const code = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!code) {
      if (part) runs.push({ text: part, ...style });
      continue;
    }
    for (const n of code[1].split(";").map(Number)) {
      if (n === 0) style = {};
      else if (n === 1) style = { ...style, bold: true };
      else if (n === 2) style = { ...style, dim: true };
      else if (COLORS[n]) style = { ...style, color: n };
    }
  }
  return runs;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(output) {
  const keyframes = [];
  const appearAnimation = (seconds) => {
    const id = `k${keyframes.length}`;
    const pct = ((seconds / LOOP) * 100).toFixed(2);
    keyframes.push(`@keyframes ${id}{0%,${pct}%{opacity:0}${(Number(pct) + 0.01).toFixed(2)}%,97%{opacity:1}100%{opacity:0}}`);
    return `${id} ${LOOP}s linear infinite`;
  };
  const appearAt = (seconds) => `style="animation:${appearAnimation(seconds)}"`;
  const typed = (text, start, perChar) =>
    [...text].map((ch, i) => `<tspan ${appearAt(start + i * perChar)}>${escape(ch)}</tspan>`).join("");
  const prompt = `<tspan fill="${COLORS.prompt}">~/prism</tspan><tspan fill="${COLORS[32]}"> $ </tspan>`;

  const rows = [];
  const command = `npx half-fixed ${ARGS.join(" ")}`;
  rows.push(`<text>${prompt}${typed(command, 0.5, 0.045)}</text>`);

  const outputStart = 0.5 + command.length * 0.045 + 0.35;
  output.forEach((line, i) => {
    const spans = ansiRuns(line)
      .map((run) => {
        const fill = run.color ? COLORS[run.color] : run.dim ? COLORS.dim : COLORS.fg;
        return `<tspan fill="${fill}"${run.bold ? ' font-weight="700"' : ""}>${escape(run.text)}</tspan>`;
      })
      .join("");
    rows.push(`<text ${appearAt(outputStart + i * 0.035)}>${spans}</text>`);
  });

  const finalPrompt = outputStart + output.length * 0.035 + 4.2;
  const commentStart = finalPrompt + 0.4;
  const cursorAt = commentStart + COMMENT.length * 0.03;
  rows.push(
    `<text><tspan ${appearAt(finalPrompt)}>${prompt}</tspan><tspan fill="${COLORS.comment}">${typed(COMMENT, commentStart, 0.03)}</tspan><tspan style="animation:${appearAnimation(cursorAt)},blink 1s steps(1) infinite">▋</tspan></text>`
  );

  const width = Math.ceil(PAD * 2 + COLS * CHAR);
  const height = BAR + PAD * 2 + rows.length * LINE;
  const lines = rows.map((row, i) => row.replace("<text", `<text x="${PAD}" y="${BAR + PAD + (i + 0.75) * LINE}"`)).join("\n    ");
  const dots = ["#ff5f56", "#ffbd2e", "#27c93f"].map((c, i) => `<circle cx="${PAD + i * 18}" cy="${BAR / 2}" r="5.5" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">half-fixed scan on prism-php/prism</title>
  <desc id="desc">Running npx half-fixed scan --group ToolMap on prism-php/prism lists hf-5505660: a fix made to the DeepSeek and OpenRouter tool maps in commit 9447c71 that the Groq, Mistral, xAI and Z tool maps never received. That gap is fixed in prism-php/prism#1038.</desc>
  <style>
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:${FONT}px;fill:${COLORS.fg};white-space:pre;font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0}
    ${keyframes.join("\n    ")}
    @keyframes blink{0%{fill-opacity:1}50%{fill-opacity:0}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important;opacity:1!important}}
  </style>
  <clipPath id="window"><rect width="${width}" height="${height}" rx="10"/></clipPath>
  <clipPath id="screen"><rect x="0" y="${BAR}" width="${width}" height="${height - BAR}"/></clipPath>
  <g clip-path="url(#window)">
    <rect width="${width}" height="${height}" fill="${COLORS.bg}"/>
    <rect width="${width}" height="${BAR}" fill="${COLORS.bar}"/>
  </g>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${COLORS.border}"/>
  ${dots}
  <text x="${width / 2}" y="${BAR / 2 + 4.5}" text-anchor="middle" fill="${COLORS.dim}" font-size="12">~/prism</text>
  <g clip-path="url(#screen)" xml:space="preserve">
    ${lines}
  </g>
</svg>
`;
}

async function main() {
  const prism = process.argv[2];
  if (!prism) {
    console.error("Usage: node scripts/render-demo.js <path to a prism-php/prism checkout>");
    process.exit(2);
  }
  const head = execFileSync("git", ["-C", prism, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== PRISM_REV) {
    console.error(`Check out ${PRISM_REV} in ${prism} first (it is at ${head}).`);
    process.exit(2);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, render(await captureScan(prism)));
  console.log(`Wrote ${path.relative(repoRoot, OUT)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
