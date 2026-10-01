#!/usr/bin/env node
// Adapted from danjdewhurst/story-skills (MIT).
// Keeps every place that names the version, the Bun pin, or a skill in step.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parsePinnedBunVersion, repoRoot } from "./bun-pin.js";

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

// Agent Skills spec: https://agentskills.io
const MAX_DESCRIPTION = 1024;
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function expectEqual(failures, label, expected, actual) {
  if (actual !== expected) {
    failures.push(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
  return failures;
}

/** Top-level `key: value` pairs from a SKILL.md frontmatter block. */
export function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) {
    return null;
  }
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) {
      data[pair[1]] = pair[2].trim();
    }
  }
  return data;
}

export function checkVersionModule(failures, packageVersion, source) {
  const match = /export const VERSION = "([^"]+)";/.exec(source);
  if (!match) {
    failures.push("src/version.js is missing export const VERSION");
    return failures;
  }
  return expectEqual(failures, "src/version.js VERSION", packageVersion, match[1]);
}

export function checkSkills(failures, skillsDir) {
  for (const skillName of fs.readdirSync(skillsDir).sort()) {
    const skillDir = path.join(skillsDir, skillName);
    if (!fs.statSync(skillDir).isDirectory()) {
      continue;
    }
    const skillPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      failures.push(`skills/${skillName} is missing SKILL.md`);
      continue;
    }
    const frontmatter = parseFrontmatter(fs.readFileSync(skillPath, "utf8"));
    if (!frontmatter) {
      failures.push(`skills/${skillName}/SKILL.md has no frontmatter`);
      continue;
    }
    expectEqual(failures, `skills/${skillName}/SKILL.md name`, skillName, frontmatter.name);
    if (!NAME_PATTERN.test(skillName)) {
      failures.push(`skills/${skillName} must be lowercase letters, digits, and single hyphens`);
    }
    if (!frontmatter.description) {
      failures.push(`skills/${skillName}/SKILL.md is missing description`);
    } else if (frontmatter.description.length > MAX_DESCRIPTION) {
      failures.push(`skills/${skillName}/SKILL.md description is ${frontmatter.description.length} characters, over ${MAX_DESCRIPTION}`);
    }
  }
  return failures;
}

// The committed fallback bundle only reproduces byte for byte on the pinned
// Bun, so CI must install the same version `packageManager` names, and
// CONTRIBUTING.md must tell contributors the same version.
export function checkBunPin(failures, packageManager, ciWorkflow, contributing) {
  const pinned = parsePinnedBunVersion(packageManager);
  if (!pinned) {
    failures.push(`package.json packageManager must pin an exact Bun version, got ${JSON.stringify(packageManager)}`);
    return failures;
  }
  const versions = [...ciWorkflow.matchAll(/^\s*bun-version:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  if (versions.length === 0) {
    failures.push(".github/workflows/ci.yml is missing bun-version");
  }
  for (const version of new Set(versions)) {
    expectEqual(failures, ".github/workflows/ci.yml bun-version", pinned, version);
  }
  const named = [...contributing.matchAll(/`bun@(\d+\.\d+\.\d+)`/g)].map((m) => m[1]);
  if (named.length === 0) {
    failures.push(`CONTRIBUTING.md must name the pinned Bun version as \`bun@${pinned}\``);
  }
  for (const version of new Set(named)) {
    expectEqual(failures, "CONTRIBUTING.md bun pin", pinned, version);
  }
  return failures;
}

// Before the first release the version is 0.0.0 and only Unreleased exists.
export function checkChangelog(failures, packageVersion, changelog) {
  if (!/^## \[Unreleased\]/m.test(changelog)) {
    failures.push('CHANGELOG.md is missing the "## [Unreleased]" section');
  }
  if (packageVersion === "0.0.0") {
    return failures;
  }
  const escaped = packageVersion.replaceAll(".", "\\.");
  if (!new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m").test(changelog)) {
    failures.push(`CHANGELOG.md is missing a "## [${packageVersion}] - YYYY-MM-DD" section`);
  }
  if (!new RegExp(`^\\[${escaped}\\]: `, "m").test(changelog)) {
    failures.push(`CHANGELOG.md is missing the [${packageVersion}] link reference`);
  }
  return failures;
}

export function collectFailures() {
  const failures = [];
  const pkg = readJson("package.json");

  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const json = readJson(manifest);
    expectEqual(failures, `${manifest} version`, pkg.version, json.version);
    expectEqual(failures, `${manifest} name`, pkg.name, json.name);
  }
  for (const marketplace of [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"]) {
    const names = readJson(marketplace).plugins.map((plugin) => plugin.name);
    expectEqual(failures, `${marketplace} plugins`, pkg.name, names.join(","));
  }
  expectEqual(failures, "skills/half-fixed/scripts/package.json type", "module", readJson("skills/half-fixed/scripts/package.json").type);

  checkVersionModule(failures, pkg.version, read("src/version.js"));
  checkSkills(failures, path.join(repoRoot, "skills"));
  checkBunPin(failures, pkg.packageManager, read(".github/workflows/ci.yml"), read("CONTRIBUTING.md"));
  checkChangelog(failures, pkg.version, read("CHANGELOG.md"));
  return failures;
}

function main() {
  const failures = collectFailures();
  if (failures.length > 0) {
    console.error(`Metadata check failed:\n${failures.map((f) => `- ${f}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log("Metadata is consistent.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
