import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function flatten(value: JsonValue, prefix = ""): Map<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return new Map([[prefix, Array.isArray(value) ? "array" : typeof value]]);
  }

  return Object.entries(value).reduce((keys, [key, child]) => {
    for (const [childKey, type] of flatten(child, prefix ? `${prefix}.${key}` : key)) {
      keys.set(childKey, type);
    }
    return keys;
  }, new Map<string, string>());
}

async function messageFiles(locale: string): Promise<string[]> {
  return readdir(path.join("apps/intranet/src/i18n/messages", locale));
}

async function readMessages(locale: string, file: string): Promise<Map<string, string>> {
  const source = await readFile(path.join("apps/intranet/src/i18n/messages", locale, file), "utf8");
  return flatten(JSON.parse(source) as JsonValue);
}

const [english, german] = await Promise.all([messageFiles("en"), messageFiles("de")]);
const failures: string[] = [];

for (const file of new Set([...english, ...german])) {
  if (!english.includes(file) || !german.includes(file)) {
    failures.push(`${file}: missing ${english.includes(file) ? "German" : "English"} namespace`);
    continue;
  }

  const [en, de] = await Promise.all([readMessages("en", file), readMessages("de", file)]);
  for (const key of new Set([...en.keys(), ...de.keys()])) {
    if (!en.has(key) || !de.has(key)) {
      failures.push(`${file}:${key}: missing ${en.has(key) ? "German" : "English"} key`);
    } else if (en.get(key) !== de.get(key)) {
      failures.push(`${file}:${key}: value type differs between locales`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`i18n contract verified across ${english.length} namespaces`);
