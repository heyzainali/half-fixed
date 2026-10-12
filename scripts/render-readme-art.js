#!/usr/bin/env node
// Renders the README hero, the stats strip, the "why" report, and the "How it works" diagram in light and dark
// variants under assets/readme/. The README picks one with <picture> and
// prefers-color-scheme. Both depict the real prism-php/prism finding that
// became prism-php/prism#1038.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(repoRoot, "assets", "readme");

const THEMES = {
  light: { fg: "#1f2328", muted: "#59636e", faint: "#d1d9e0", surface: "#f6f8fa", fixed: "#1a7f37", old: "#bc4c00" },
  dark: { fg: "#e6edf3", muted: "#9198a1", faint: "#3d444d", surface: "#151b23", fixed: "#3fb950", old: "#f0883e" }
};

const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace`;
const SANS = `-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif`;

function hero(t) {
  const size = 18;
  const gap = 8;
  const width = 560;
  const rowWidth = 10 * size + 9 * gap;
  const left = (width - rowWidth) / 2;
  const squares = Array.from({ length: 10 }, (_, i) => {
    const x = left + i * (size + gap);
    if (i < 2) return `<rect x="${x}" y="104" width="${size}" height="${size}" rx="4" fill="${t.fixed}"/>`;
    if (i < 6) return `<rect x="${x + 1}" y="105" width="${size - 2}" height="${size - 2}" rx="3.5" fill="none" stroke="${t.old}" stroke-width="2"/>`;
    return `<rect x="${x + 1}" y="105" width="${size - 2}" height="${size - 2}" rx="3.5" fill="none" stroke="${t.faint}" stroke-width="2"/>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="160" viewBox="0 0 ${width} 160" role="img" aria-labelledby="title">
  <title id="title">half-fixed: fixed in 2 of 10, still old in 4</title>
  <text x="${width / 2}" y="72" text-anchor="middle" font-family='${MONO}' font-size="60" font-weight="700" fill="${t.fg}">half<tspan fill="${t.old}">-</tspan>fixed</text>
  ${squares}
  <text x="${width / 2}" y="150" text-anchor="middle" font-family='${MONO}' font-size="13" fill="${t.muted}"><tspan fill="${t.fixed}">fixed in 2 of 10</tspan>, <tspan fill="${t.old}">still old in 4</tspan></text>
</svg>
`;
}

const STATS = ["3 upstream bugs found", "5,000 commits in 69 s", "0 dependencies", "runs offline", "MIT"];

function stats(t) {
  const charWidth = 13 * 0.6;
  const square = 10;
  const pad = 14;
  const itemGap = 26;
  const widths = STATS.map((label) => square + 8 + label.length * charWidth);
  const width = Math.ceil(widths.reduce((a, b) => a + b, 0) + itemGap * (STATS.length - 1) + pad * 2);
  let x = pad;
  const items = STATS.map((label, i) => {
    const item = `<rect x="${x}" y="13" width="${square}" height="${square}" rx="2.5" fill="${t.fixed}"/><text x="${x + square + 8}" y="22.5" font-family='${MONO}' font-size="13" fill="${t.fg}">${label}</text>`;
    x += widths[i] + itemGap;
    return item;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="36" viewBox="0 0 ${width} 36" role="img" aria-labelledby="title">
  <title id="title">${STATS.join(", ")}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="35" rx="8" fill="${t.surface}" stroke="${t.faint}"/>
  ${items}
</svg>
`;
}

export const REASONS = [
  {
    title: "learns from your own fixes",
    why: "every fix in your history is a test case for the code next to it",
    proof: ["proof", "Prism's 9447c71 fixed 2 of 10 tool maps; half-fixed found the 4 that kept the bug"]
  },
  {
    title: "finds real bugs",
    why: "its findings became pull requests in two well-known projects",
    proof: ["proof", "prism-php/prism#1038, BerriAI/litellm#44925, BerriAI/litellm#44936"]
  },
  {
    title: "fast and offline",
    why: "runs git and nothing else: no model, no network, no telemetry",
    proof: ["proof", "5,000 LiteLLM commits in 69 s"]
  },
  {
    title: "evidence, not autofix",
    why: "your agent checks each finding against the original fix before it touches code",
    proof: ["proof", "66 LiteLLM findings checked: 13 real gaps, 52 deliberate or handled, 1 unsure"]
  },
  {
    title: "works with your agent",
    why: "Claude Code and Codex plugins, Agent Skills for any agent, and a standalone CLI",
    proof: ["try", "npx skills add heyzainali/half-fixed"]
  },
  {
    title: "catches it in review",
    why: "--base flags a branch that fixes two siblings and forgets the third",
    proof: ["proof", "flagged DeepSeek and OpenAI on the branch behind prism-php/prism#1038"]
  }
];

const reasonId = (title) => `hf-${createHash("sha1").update(title).digest("hex").slice(0, 7)}`;

function report(t) {
  const width = 876;
  const line = 20;
  const pad = 22;
  const lines = [
    `<tspan font-weight="700" fill="${t.old}">${REASONS.length} reasons found</tspan><tspan fill="${t.muted}"> (3 upstream bugs, 0 dependencies, at HEAD)</tspan>`,
    "",
    `<tspan font-weight="700">half-fixed/*</tspan>`
  ];
  for (const reason of REASONS) {
    lines.push(
      `  <tspan font-weight="700">${reasonId(reason.title)}</tspan>  <tspan font-weight="700" fill="${t.old}">high</tspan>  <tspan font-weight="700">${escapeXml(reason.title)}</tspan>`,
      `    <tspan fill="${t.muted}">why    </tspan>${escapeXml(reason.why)}`,
      `    <tspan fill="${t.muted}">${reason.proof[0].padEnd(7)}</tspan><tspan fill="${t.fixed}">${escapeXml(reason.proof[1])}</tspan>`
    );
  }
  lines.push("", `<tspan fill="${t.muted}">Run it on your repository: </tspan><tspan font-weight="700">npx half-fixed scan</tspan>`);
  const height = pad * 2 + lines.length * line;
  const text = lines
    .map((content, i) => `<text x="${pad}" y="${pad + (i + 0.75) * line}" xml:space="preserve">${content}</text>`)
    .join("\n  ");
  const summary = REASONS.map((r) => `${r.title}: ${r.why} (${r.proof[0]}: ${r.proof[1]})`).join(". ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Why half-fixed, as a scan report</title>
  <desc id="desc">${escapeXml(summary)}.</desc>
  <style>text{font-family:${MONO.replace(/"/g, "'")};font-size:13px;fill:${t.fg};white-space:pre;font-variant-ligatures:none}</style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${t.surface}" stroke="${t.faint}"/>
  ${text}
</svg>
`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function diagram(t) {
  const width = 880;
  const height = 320;
  const rows = [
    ["DeepSeek", "fixed"],
    ["OpenRouter", "fixed"],
    ["Groq", "still old"],
    ["Mistral", "still old"],
    ["XAI", "still old"],
    ["Z", "still old"]
  ];
  const rowX = 330;
  const rowW = 210;
  const rowH = 30;
  const rowY = (i) => 58 + i * 38;
  const fix = { x: 20, y: 120, w: 230, h: 92 };
  const finding = { x: 630, y: 128, w: 230, h: 122 };
  const fixOut = { x: fix.x + fix.w, y: fix.y + fix.h / 2 };
  const findingIn = { x: finding.x, y: finding.y + finding.h / 2 };

  const label = (x, text) =>
    `<text x="${x}" y="30" text-anchor="middle" font-family='${SANS}' font-size="12" font-weight="600" letter-spacing="1.5" fill="${t.muted}">${text}</text>`;
  const curve = (from, to) => {
    const mid = (from.x + to.x) / 2;
    return `M${from.x} ${from.y}C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`;
  };

  const links = rows
    .map(([, state], i) => {
      const to = { x: rowX, y: rowY(i) + rowH / 2 };
      const color = state === "fixed" ? t.fixed : t.old;
      const dash = state === "fixed" ? "" : ` stroke-dasharray="5 5"`;
      const toFinding =
        state === "fixed" ? "" : `<path d="${curve({ x: rowX + rowW, y: to.y }, findingIn)}" fill="none" stroke="${t.old}" stroke-width="1.5" opacity="0.7"/>`;
      return `<path d="${curve(fixOut, to)}" fill="none" stroke="${color}" stroke-width="2"${dash}/>${toFinding}`;
    })
    .join("\n  ");

  const siblings = rows
    .map(([name, state], i) => {
      const y = rowY(i);
      const color = state === "fixed" ? t.fixed : t.old;
      const dot =
        state === "fixed"
          ? `<circle cx="${rowX + 16}" cy="${y + rowH / 2}" r="5" fill="${color}"/>`
          : `<circle cx="${rowX + 16}" cy="${y + rowH / 2}" r="4.5" fill="none" stroke="${color}" stroke-width="2"/>`;
      return `<rect x="${rowX}" y="${y}" width="${rowW}" height="${rowH}" rx="7" fill="${t.surface}" stroke="${t.faint}"/>${dot}<text x="${rowX + 30}" y="${y + 19.5}" font-family='${MONO}' font-size="13" fill="${t.fg}">${name}</text><text x="${rowX + rowW - 12}" y="${y + 19.5}" text-anchor="end" font-family='${SANS}' font-size="12" fill="${color}">${state}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">How half-fixed finds a gap</title>
  <desc id="desc">Commit 9447c71 fixed the DeepSeek and OpenRouter tool maps in prism-php/prism. Groq, Mistral, xAI and Z still had the old code, so half-fixed reports finding hf-5505660: fixed in 2 of 10, still old in 4. That gap is fixed in prism-php/prism#1038.</desc>
  ${label(fix.x + fix.w / 2, "THE FIX")}
  ${label(rowX + rowW / 2, "ITS SIBLINGS")}
  ${label(finding.x + finding.w / 2, "THE FINDING")}
  ${links}
  <rect x="${fix.x}" y="${fix.y}" width="${fix.w}" height="${fix.h}" rx="10" fill="${t.surface}" stroke="${t.faint}"/>
  <text x="${fix.x + 18}" y="${fix.y + 32}" font-family='${MONO}' font-size="16" font-weight="700" fill="${t.fg}">9447c71</text>
  <text x="${fix.x + 18}" y="${fix.y + 56}" font-family='${MONO}' font-size="12" fill="${t.muted}">fix(DeepSeek|OpenRouter)</text>
  <text x="${fix.x + 18}" y="${fix.y + 75}" font-family='${SANS}' font-size="12" fill="${t.muted}">tools without parameters</text>
  ${siblings}
  <text x="${rowX + rowW / 2}" y="${rowY(rows.length) + 14}" text-anchor="middle" font-family='${SANS}' font-size="12" fill="${t.muted}">4 more siblings differ too much to compare</text>
  <rect x="${finding.x}" y="${finding.y}" width="${finding.w}" height="${finding.h}" rx="10" fill="${t.surface}" stroke="${t.old}" stroke-width="1.5"/>
  <text x="${finding.x + 18}" y="${finding.y + 32}" font-family='${MONO}' font-size="16" font-weight="700" fill="${t.old}">hf-5505660</text>
  <text x="${finding.x + finding.w - 18}" y="${finding.y + 32}" text-anchor="end" font-family='${MONO}' font-size="12" font-weight="700" fill="${t.fg}">high</text>
  <text x="${finding.x + 18}" y="${finding.y + 58}" font-family='${MONO}' font-size="12" fill="${t.fixed}">fixed in 2 of 10</text>
  <text x="${finding.x + 18}" y="${finding.y + 78}" font-family='${MONO}' font-size="12" fill="${t.old}">still old in 4</text>
  <text x="${finding.x + 18}" y="${finding.y + 104}" font-family='${SANS}' font-size="12" fill="${t.muted}">Fixed in prism-php/prism#1038</text>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(path.join(OUT_DIR, `hero-${name}.svg`), hero(theme));
  writeFileSync(path.join(OUT_DIR, `how-it-works-${name}.svg`), diagram(theme));
  writeFileSync(path.join(OUT_DIR, `stats-${name}.svg`), stats(theme));
  writeFileSync(path.join(OUT_DIR, `report-${name}.svg`), report(theme));
}
console.log(`Wrote the hero, stats strip, report, and diagram to ${path.relative(repoRoot, OUT_DIR)}.`);
