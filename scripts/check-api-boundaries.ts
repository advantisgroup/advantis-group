import { Glob } from "bun";

const directAnthropicImports: string[] = [];
const clientCreations: string[] = [];

for await (const file of new Glob("apps/api/src/**/*.ts").scan(".")) {
  const source = await Bun.file(file).text();
  const normalizedPath = file.replaceAll("\\", "/");
  if (
    source.includes('from "@anthropic-ai/sdk"') &&
    normalizedPath !== "apps/api/src/lib/anthropic.ts"
  ) {
    directAnthropicImports.push(normalizedPath);
  }
  if (source.includes("new Anthropic(")) clientCreations.push(normalizedPath);
}

const failures = [
  ...directAnthropicImports.map((file) => `${file}: import the shared AnthropicClient instead`),
  ...(clientCreations.length === 1 && clientCreations[0] === "apps/api/src/lib/anthropic.ts"
    ? []
    : [
        `Anthropic must have one construction point; found: ${clientCreations.join(", ") || "none"}`,
      ]),
];

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("API provider boundaries verified");
