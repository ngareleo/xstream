import { baseConfig } from "../eslint.config.js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // no-floating-promises requires type info (parserOptions.project)
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    // Test files use ! for post-expect narrowing — acceptable since the test
    // fails before the assertion is used if the value is null/undefined.
    // Pattern uses `**/*.test.ts` (not `src/**/*.test.ts`) so it matches both
    // when ESLint is invoked from `server/` (cwd-relative) and from the repo
    // root via lint-staged (where the file path is `server/src/...`).
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // validateSchema.ts is a standalone CLI script invoked directly by bun.
    // It has no OTel context and exits immediately, so console output is correct here.
    files: ["src/graphql/validateSchema.ts"],
    rules: {
      "no-console": "off",
    },
  }
);
