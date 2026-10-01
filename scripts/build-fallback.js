#!/usr/bin/env node
// Adapted from danjdewhurst/story-skills (MIT).
// Builds the Node-compatible fallback CLI that copied skill installs run.
// Wraps `bun build` so the pinned Bun version is enforced in one place; see
// scripts/bun-pin.js for why the pin matters.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, requirePinnedBun } from "./bun-pin.js";

export const FALLBACK_PATH = path.join(repoRoot, "skills", "half-fixed", "scripts", "half-fixed.js");

export function buildBundle(outFile, run = spawnSync) {
  return run("bun", ["build", "./bin/half-fixed.js", "--target=node", `--outfile=${outFile}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function main() {
  requirePinnedBun();

  const build = buildBundle(FALLBACK_PATH);
  if (build.status !== 0) {
    process.stderr.write(build.stderr || build.stdout || "");
    process.exit(build.status ?? 1);
  }

  console.log(`Built ${path.relative(repoRoot, FALLBACK_PATH)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
