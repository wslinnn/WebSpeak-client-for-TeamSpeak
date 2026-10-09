import tseslint from "typescript-eslint";

// Backend and maintenance scripts. The web workspace has its own config.
export default tseslint.config(
  {
    ignores: ["dist/**", "vendor/**", "web/**", "data/**"],
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/**/*.ts", "scripts/**/*.mjs"],
  })),
  {
    files: ["src/**/*.ts", "scripts/**/*.mjs"],
    rules: {
      // Test files legitimately redeclare fixtures per test; the codebase
      // otherwise keeps declarations unique.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
    },
  },
);
