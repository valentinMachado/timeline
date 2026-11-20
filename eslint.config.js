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
    // Scripts of the extension: injected into a page, its own pages, its
    // background script. The DOM and the extension API, which both browsers
    // expose as `chrome`, nothing from Node.
    files: [
      "src/content/**/*.js",
      "src/ui/**/*.js",
      "src/pages/**/*.js",
      "src/background.js",
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    // Pure code shared by every part of the extension: neither the DOM nor
    // Node's own modules, so it runs in a page, a worker and the tests alike.
    // `URL` is the one global they use: every one of those places has it.
    files: ["src/shared/**/*.js", "src/manifest.js"],
    languageOptions: { globals: { URL: "readonly" } },
  },
];
