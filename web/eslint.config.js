import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

// Frontend workspace: Vue SFCs plus plain TS modules. The backend has its
// own config at the repository root.
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "android/**", "test/**"],
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/**/*.ts", "src/**/*.vue"],
  })),
  ...pluginVue.configs["flat/essential"].map(config => ({
    ...config,
    files: ["src/**/*.vue"],
  })),
  {
    files: ["src/**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".vue"] },
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.test.mjs"],
    rules: {
      // Test mocks legitimately shape partially-typed fixtures.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
    },
  },
  {
    files: ["src/components/web-client/ChannelMemberPanel.vue"],
    rules: {
      // vue/valid-v-memo tracks only one v-for level, so it misfires on the
      // member rows (v-memo on the inner v-for element itself — the exact
      // usage the Vue performance guide recommends for large lists).
      "vue/valid-v-memo": "off",
    },
  },
);
