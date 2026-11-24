/**
 * The installable site (a PWA), the extension's third build target beside
 * Chrome and Firefox: what `scripts/build.js` writes into `dist/web/`, and
 * the web app manifest that makes it installable and puts it in the phone's
 * share sheet.
 *
 * Its scripts and files keep their path from `src/web/` to `dist/web/`, as
 * the extension's do from `src/`. Every path is relative, so the site works
 * wherever it is served (`…github.io/timeline/`, a local server).
 */

/** The page's script, bundled from `src/web/`. */
export const WEB_SCRIPT = "app.js";

/**
 * The service worker, bundled from `src/web/` once the files it keeps are
 * written, since their hash is its version.
 */
export const WEB_WORKER = "sw.js";

/** The files copied as they are from `src/web/`. */
export const WEB_FILES = Object.freeze([
  "index.html",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
]);

/**
 * The web app manifest, its strings as messages, which the build puts in
 * one language per file (`webManifestFile`).
 *
 * `share_target` is how the site receives an article: in Chrome, « Share »
 * on a Wikipedia page lists the installed site, which opens on
 * `./?title=…&text=…&url=…`.
 */
export const WEB_MANIFEST = Object.freeze({
  id: "./",
  name: "__MSG_extensionName__",
  short_name: "__MSG_webShortName__",
  description: "__MSG_extensionDescription__",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#3366cc",
  icons: [
    { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  share_target: {
    action: "./",
    method: "GET",
    params: { title: "title", text: "text", url: "url" },
  },
});

/**
 * @param {string} language a folder of `_locales/`
 * @returns {string} the path of the manifest in that language
 */
export function webManifestFile(language) {
  return `manifest.${language}.webmanifest`;
}

/**
 * What the service worker keeps so that the site opens without a network:
 * every file the build writes but the worker itself, and the site's root,
 * which is how it is opened.
 *
 * @param {readonly string[]} languages those there is a manifest for
 * @returns {string[]}
 */
export function shellOf(languages) {
  return ["./", ...WEB_FILES, WEB_SCRIPT, ...languages.map(webManifestFile)];
}
