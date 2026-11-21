import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist/", "artifacts/"]),
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2025, globals: globals.nodeBuiltin },
    rules: {
      curly: ["error", "all"],
      eqeqeq: "error",
      "no-throw-literal": "error",
      "prefer-const": "error",
    },
  },
]);
