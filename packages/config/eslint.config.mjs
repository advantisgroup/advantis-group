import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

/**
 * Shared ESLint flat config for Advantis Next.js apps.
 *
 * Usage in an app's `eslint.config.mjs`:
 *   import { createEslintConfig } from "@advantis/config/eslint";
 *   export default createEslintConfig(import.meta.dirname);
 */
export function createEslintConfig(tsconfigRootDir) {
  return [
    {
      ignores: [
        "dist",
        "node_modules",
        ".next",
        "out",
        ".cache",
        "public",
        "*.config.js",
        "*.config.ts",
        "src/components/ui/**",
      ],
    },
    js.configs.recommended,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        ecmaVersion: 2022,
        parser: tsparser,
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.es2022,
        },
        parserOptions: {
          project: "./tsconfig.json",
          tsconfigRootDir,
        },
      },
      plugins: {
        "@typescript-eslint": tseslint,
        "react-hooks": reactHooks,
        "react-refresh": reactRefresh,
        import: importPlugin,
        "jsx-a11y": jsxA11y,
      },
      rules: {
        ...tseslint.configs.recommended.rules,
        ...tseslint.configs["recommended-type-checked"].rules,
        ...reactHooks.configs.recommended.rules,
        "react-refresh/only-export-components": [
          "warn",
          { allowConstantExport: true },
        ],
        "@typescript-eslint/no-unused-vars": [
          "warn",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/consistent-type-imports": [
          "warn",
          { prefer: "type-imports", fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],
        "import/order": [
          "warn",
          {
            groups: [
              "builtin",
              "external",
              "internal",
              ["parent", "sibling"],
              "index",
              "object",
              "type",
            ],
            pathGroups: [
              { pattern: "react", group: "external", position: "before" },
              { pattern: "next/**", group: "external", position: "before" },
              { pattern: "@/**", group: "internal" },
            ],
            pathGroupsExcludedImportTypes: ["react", "next"],
            "newlines-between": "always",
            alphabetize: { order: "asc", caseInsensitive: true },
          },
        ],
        "import/no-duplicates": "warn",
        "no-console": ["warn", { allow: ["warn", "error"] }],
        "prefer-const": "warn",
        "no-var": "error",
      },
      settings: {
        "import/resolver": {
          typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
          node: true,
        },
      },
    },
  ];
}

export default createEslintConfig(process.cwd());
