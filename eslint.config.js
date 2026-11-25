import js from "@eslint/js";
import compat from "eslint-plugin-compat";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", ".venv/**", "launcher/src/icons/lucide.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["launcher/src/**/*.{ts,tsx}"],
    plugins: { compat },
    languageOptions: { globals: { ...globals.browser } },
    settings: { browsers: ["chrome >= 63"], polyfills: ["Promise"] },
    rules: { "compat/compat": "error" },
  },
  {
    files: ["launcher/service/**/*.js"],
    languageOptions: { ecmaVersion: 5, sourceType: "script", globals: { ...globals.node, tizen: "readonly" } },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-var": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
  { files: ["tools/**/*.mjs"], languageOptions: { globals: { ...globals.node } } },
];
