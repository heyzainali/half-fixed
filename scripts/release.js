#!/usr/bin/env node
// Adapted from danjdewhurst/story-skills (MIT).
// `bun run release <patch|minor|major|X.Y.Z> [--dry-run]` bumps every version
// file, moves the changelog's Unreleased entries under the new version,
// rebuilds the fallback, commits, tags, pushes, and creates the GitHub
// release. The tag push runs .github/workflows/publish.yml, which publishes
// to npm through trusted publishing.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { missingBunMessage } from "./bun-missing.js";
import { CHANGELOG_FILE, promoteUnreleased, unreleasedEntries } from "./changelog.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_FILES = ["package.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json"];
const VERSION_MODULE = "src/version.js";
const FALLBACK_FILE = "skills/half-fixed/scripts/half-fixed.js";
const RELEASE_BRANCH = "main";
export const PREFLIGHT = ["check:metadata", "test:coverage", "check:node-help"];

// Semver forbids leading zeros: npm would publish 0.11.01 as 0.11.1 while the
// tag, manifests, and `half-fixed --version` kept 0.11.01.
const PLAIN_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const USAGE = "Usage: bun run release <patch|minor|major|MAJOR.MINOR.PATCH> [--dry-run]";

export function isAbsentGitHubRelease(error) {
  return /release not found/i.test(`${error.stderr ?? ""}\n${error.message ?? ""}`);
}

// `npm view name@version` exits non-zero with E404 when the package or that
// version has never been published; anything else (auth, network) is a real error.
export function isAbsentNpmVersion(error) {
  return /\bE404\b/.test(`${error.stderr ?? ""}\n${error.message ?? ""}`);
}

// --atomic makes the remote accept both refs or neither, so a rejected main
// push can never leave a published tag pointing at a commit that is not on main.
export function releasePushArgs(tag) {
  return ["push", "--atomic", "origin", RELEASE_BRANCH, tag];
}

// Exactly one bump and at most --dry-run. Anything else is refused before any
// check runs, so a mistyped `--dryrun` can never fall through to a real release.
export function parseReleaseArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith("-"));
  const positionals = argv.filter((arg) => !arg.startsWith("-"));
  const unknown = flags.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Unknown option ${unknown.join(" ")}. ${USAGE}`);
  }
  if (positionals.length !== 1) {
    throw new Error(`Expected one version bump. ${USAGE}`);
  }
  return { bump: positionals[0], dryRun: flags.includes("--dry-run") };
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

export function bumpVersion(current, bump) {
  const match = PLAIN_VERSION.exec(current);
  if (!match) {
    throw new Error(`Current version "${current}" is not a plain MAJOR.MINOR.PATCH version.`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (!PLAIN_VERSION.test(bump)) {
        throw new Error(`Expected patch, minor, major, or MAJOR.MINOR.PATCH without leading zeros, got "${bump}".`);
      }
      if (compareVersions(bump, current) <= 0) {
        throw new Error(`Version ${bump} is not greater than the current version ${current}.`);
      }
      return bump;
  }
}

export function replaceVersion(json, nextVersion) {
  const pattern = /^(\s*"version":\s*")([^"]*)(")/m;
  if (!pattern.test(json)) {
    throw new Error('No top-level "version" field found.');
  }
  return json.replace(pattern, `$1${nextVersion}$3`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.inherit ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"]
  });
}

function git(...args) {
  return run("git", args).trim();
}

function fail(message) {
  console.error(`Release aborted: ${message}`);
  process.exit(1);
}

function runBun(args, options = {}) {
  try {
    return run("bun", args, options);
  } catch (error) {
    const missing = missingBunMessage(error);
    if (!missing) {
      throw error;
    }
    return fail(missing);
  }
}

function checkNpm(name, nextVersion) {
  let published = "";
  try {
    published = run("npm", ["view", `${name}@${nextVersion}`, "version"]).trim();
  } catch (error) {
    if (!isAbsentNpmVersion(error)) {
      fail(`could not check npm for ${name}@${nextVersion}: ${error.stderr || error.message}`);
    }
  }
  if (published !== "") {
    fail(`${name}@${nextVersion} is already published on npm.`);
  }
}

function preflight(nextVersion, tag, name) {
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== RELEASE_BRANCH) {
    fail(`releases are cut from ${RELEASE_BRANCH}.`);
  }
  if (git("status", "--porcelain") !== "") {
    fail("working tree is not clean. Commit or stash your changes first.");
  }
  git("fetch", "origin", RELEASE_BRANCH, "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", `origin/${RELEASE_BRANCH}`)) {
    fail(`local ${RELEASE_BRANCH} does not match origin/${RELEASE_BRANCH}. Pull or push first.`);
  }
  if (unreleasedEntries(fs.readFileSync(path.join(repoRoot, CHANGELOG_FILE), "utf8")).length === 0) {
    fail(`${CHANGELOG_FILE} has no entries under "## [Unreleased]". Add the user-visible changes first.`);
  }
  if (git("tag", "--list", tag) !== "") {
    fail(`tag ${tag} already exists.`);
  }
  try {
    run("gh", ["auth", "status"]);
  } catch {
    fail("gh is not installed or not logged in. Run `gh auth login`.");
  }
  try {
    run("gh", ["release", "view", tag]);
    fail(`GitHub release ${tag} already exists.`);
  } catch (error) {
    if (!isAbsentGitHubRelease(error)) {
      fail(`could not check GitHub release ${tag}: ${error.stderr || error.message}`);
    }
  }
  checkNpm(name, nextVersion);

  for (const script of PREFLIGHT) {
    console.log(`\n> bun run ${script}`);
    runBun(["run", script], { inherit: true });
  }
  console.log(`\nPreflight passed for ${nextVersion}.`);
}

export function updateVersionFiles(root, nextVersion) {
  for (const relativePath of VERSION_FILES) {
    const filePath = path.join(root, relativePath);
    fs.writeFileSync(filePath, replaceVersion(fs.readFileSync(filePath, "utf8"), nextVersion));
  }
  const modulePath = path.join(root, VERSION_MODULE);
  const moduleSource = fs.readFileSync(modulePath, "utf8");
  const versionPattern = /^(export const VERSION = ")[^"]*(";)/m;
  if (!versionPattern.test(moduleSource)) {
    throw new Error(`No VERSION export found in ${VERSION_MODULE}.`);
  }
  fs.writeFileSync(modulePath, moduleSource.replace(versionPattern, `$1${nextVersion}$2`));
  return [...VERSION_FILES, VERSION_MODULE];
}

function main(argv) {
  let bump;
  let dryRun;
  try {
    ({ bump, dryRun } = parseReleaseArgs(argv));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  let nextVersion;
  try {
    nextVersion = bumpVersion(packageJson.version, bump);
  } catch (error) {
    fail(error.message);
  }
  const tag = `v${nextVersion}`;
  console.log(`Releasing ${packageJson.version} -> ${nextVersion} (${tag})`);

  preflight(nextVersion, tag, packageJson.name);
  if (dryRun) {
    console.log(`Dry run: would bump ${[...VERSION_FILES, VERSION_MODULE].join(", ")}, move the ${CHANGELOG_FILE} Unreleased entries under ${nextVersion}, rebuild the fallback, commit, tag ${tag}, push, and create the GitHub release. The tag push publishes ${packageJson.name}@${nextVersion} to npm from GitHub Actions.`);
    return;
  }

  // The changelog goes first: it is the one rewrite that can refuse.
  const date = new Date().toISOString().slice(0, 10);
  const changelogPath = path.join(repoRoot, CHANGELOG_FILE);
  fs.writeFileSync(changelogPath, promoteUnreleased(fs.readFileSync(changelogPath, "utf8"), packageJson.version, nextVersion, date));
  const updated = updateVersionFiles(repoRoot, nextVersion);
  // The bundled fallback inlines src/version.js, so rebuild it with the bump.
  runBun(["run", "build:fallback"], { inherit: true });
  runBun(["run", "check:metadata"], { inherit: true });

  git("add", ...updated, CHANGELOG_FILE, FALLBACK_FILE);
  git("commit", "-m", `chore: release ${nextVersion}`);
  git("tag", "-a", tag, "-m", tag);
  git(...releasePushArgs(tag));
  console.log(`Pushed ${RELEASE_BRANCH} and ${tag}`);

  const releaseUrl = run("gh", ["release", "create", tag, "--title", tag, "--generate-notes", "--verify-tag"]).trim();
  console.log(`Created GitHub release: ${releaseUrl}`);
  console.log(`The Publish workflow is publishing ${packageJson.name}@${nextVersion} to npm: https://github.com/zain534102/half-fixed/actions/workflows/publish.yml`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
