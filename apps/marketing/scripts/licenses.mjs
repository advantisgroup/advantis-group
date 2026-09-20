// Writes public/licenses.json: every production dependency and everything
// those depend on. license-checker only sees the app's own node_modules, and
// in this monorepo almost everything is hoisted to the root, so it comes back
// nearly empty. This walks the tree the way node resolves it instead.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readPkg = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

function findPackage(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return "UNKNOWN";
}

function authorOf(pkg) {
  const author = pkg.author ?? pkg.contributors?.[0];
  if (!author) return {};
  if (typeof author === "object") {
    return { publisher: author.name, email: author.email, url: author.url };
  }
  const match = /^([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\(([^)]*)\))?$/.exec(author);
  return { publisher: match?.[1] || undefined, email: match?.[2], url: match?.[3] };
}

function repositoryOf(pkg) {
  const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (!repo) return undefined;
  return repo
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git$/, "");
}

const found = new Map();
const seen = new Set();

function visit(dir, isRoot = false) {
  if (seen.has(dir)) return;
  seen.add(dir);

  const pkg = readPkg(dir);
  if (!isRoot && !pkg.private) {
    const { publisher, email, url } = authorOf(pkg);
    found.set(`${pkg.name}@${pkg.version}`, {
      licenses: licenseOf(pkg),
      repository: repositoryOf(pkg),
      publisher,
      email,
      url,
    });
  }

  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(deps)) {
    const depDir = findPackage(name, dir);
    // optional deps for other platforms aren't installed, that's fine
    if (depDir) visit(depDir);
  }
}

visit(appDir, true);

const sorted = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(join(appDir, "public"), { recursive: true });
writeFileSync(join(appDir, "public/licenses.json"), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`wrote ${found.size} packages to public/licenses.json`);
