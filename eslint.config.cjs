const { defineConfig, globalIgnores } = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const parser = require("svelte-eslint-parser");
const globals = require("globals");
const js = require("@eslint/js");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaVersion: 2020,
      parserOptions: {},

      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    extends: compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:svelte/recommended",
      "prettier"
    ),

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
  },
  globalIgnores(["**/*.cjs", "**/node_modules", "**/build", "**/.svelte-kit"]),
  {
    files: ["**/*.svelte"],

    languageOptions: {
      parser: parser,

      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },
  },
]);
