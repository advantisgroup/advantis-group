import { execSync } from "node:child_process";

const appDir = process.argv[2];

if (!appDir) {
  console.log("Missing app directory argument. Building.");
  process.exit(1);
}

const ignoredDirs = ["scripts/", "docs/", ".github/"];

const alwaysBuildDirs = ["packages/"];

const alwaysBuildFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "bun.lock",
  "turbo.json",
  "tsconfig.json",
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function isInside(file, dir) {
  return file === dir.replace(/\/$/, "") || file.startsWith(dir);
}

function isIgnored(file) {
  return ignoredDirs.some(dir => isInside(file, dir));
}

function isAlwaysBuild(file) {
  return (
    alwaysBuildDirs.some(dir => isInside(file, dir)) ||
    alwaysBuildFiles.includes(file)
  );
}

function isRelevantToApp(file) {
  return isInside(file, `${appDir.replace(/\/$/, "")}/`);
}

let changedFiles = [];

try {
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA || "HEAD^";
  const head = process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";

  changedFiles = run(`git diff --name-only ${base} ${head}`)
    .split("\n")
    .filter(Boolean);
} catch {
  console.log("Could not detect changed files. Building.");
  process.exit(1);
}

console.log("Changed files:");
console.log(changedFiles.map(file => `- ${file}`).join("\n"));

if (changedFiles.length === 0) {
  console.log("No changed files detected. Building.");
  process.exit(1);
}

const shouldBuild = changedFiles.some(file => {
  if (isIgnored(file)) return false;
  if (isAlwaysBuild(file)) return true;
  if (isRelevantToApp(file)) return true;

  return false;
});

if (shouldBuild) {
  console.log(`Relevant changes detected for ${appDir}. Building.`);
  process.exit(1);
}

console.log(`No relevant changes for ${appDir}. Skipping build.`);
process.exit(0);
