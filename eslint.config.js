import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "dist/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    // Pure code shared by every part of the extension: neither the DOM nor
    // Node's own modules, so it runs in a page, a worker and the tests alike.
    files: ["src/shared/**/*.js"],
    languageOptions: { globals: {} },
  },
];
