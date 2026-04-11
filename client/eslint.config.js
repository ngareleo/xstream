import { baseConfig } from "../eslint.config.js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  ...baseConfig,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // React hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // no-floating-promises requires type info (parserOptions.project)
      "@typescript-eslint/no-floating-promises": "error",
      // Cross-module imports must use the ~ alias, not relative parent paths.
      // Same-directory imports (./X) are still allowed for colocated files.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message: "Use the ~ alias for cross-module imports (e.g. ~/components/videoCard/VideoCard.js).",
            },
          ],
        },
      ],
    },
  },
  {
    // Story files use anonymous decorator callbacks and complex Storybook
    // type patterns — relax module boundary type requirements there
    files: ["**/*.stories.tsx", "**/*.stories.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  }
);
