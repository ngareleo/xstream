import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import jsonc from "eslint-plugin-jsonc";

/**
 * Base ESLint config shared by all workspaces.
 * Each workspace extends this via their own eslint.config.js.
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/__generated__/**",
      "**/relay/__generated__/**",
    ],
  },

  // ── TypeScript / JavaScript ──────────────────────────────────────────────────
  tseslint.configs.recommended,
  {
    plugins: {
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // Enforce explicit return types on module boundaries
      "@typescript-eslint/explicit-module-boundary-types": "error",
      // Flag unused import statements (auto-fixable with --fix)
      "unused-imports/no-unused-imports": "error",
      // Allow unused vars/args prefixed with _ (defer to unused-imports for import lines)
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // Prefer type imports for pure type usage
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // No floating promises
      "@typescript-eslint/no-floating-promises": "error",
      // Forbid non-null assertions (!) — use optional chaining or explicit guards instead
      "@typescript-eslint/no-non-null-assertion": "error",
      // Organised imports: sorted, grouped (external → internal → relative)
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      // Forbid direct console calls — use getOtelLogger()/getClientLogger() instead
      // so all log output is routed through the OTel pipeline (Seq + console mirror).
      "no-console": "error",
    },
  },

  // ── JSON files ───────────────────────────────────────────────────────────────
  // jsonc flat config registers its own parser (jsonc-eslint-parser) automatically.
  // Prettier handles pretty-printing; jsonc catches structural issues ESLint can enforce.
  // eslint-config-prettier is appended last to suppress any jsonc formatting rules
  // that conflict with Prettier's output.
  ...jsonc.configs["flat/recommended-with-json"],
  {
    files: ["**/*.json"],
    rules: {
      // No duplicate keys in any JSON file
      "jsonc/no-dupe-keys": "error",
    },
  },

  prettier
);

export default baseConfig;
