// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/*.generated.*",
      "packages/db/prisma/migrations/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The brief forbids unjustified `any`; flag it, allow a one-line justification via eslint-disable.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // No empty catch — resilience standard (§7).
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/fixtures/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
