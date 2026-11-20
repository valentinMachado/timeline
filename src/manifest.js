/**
 * The extension's manifest, written once and specialised per browser.
 *
 * Chrome and Firefox read the same Manifest V3 keys except for a few that one
 * of them requires and the other warns about; those live in `TARGETS` rather
 * than in two hand-kept manifest files that would drift apart.
 *
 * Every script the manifest names is a path inside the built extension; its
 * source is the same path under `src/` (see `sourceOf`), which is how the
 * build finds its entry points without a second list. An extension page
 * (`PAGES`) loads the script of the same name: `pages/x.html` runs
 * `pages/x.js`.
 */

/** The background script, which opens the reader's timeline. */
const BACKGROUND = "background.js";

/** The reader's own timeline: opened by the toolbar button and the banner. */
export const MY_TIMELINE_PAGE = "pages/mytimeline.html";

/**
 * The message a content script sends the background script to open
 * {@link MY_TIMELINE_PAGE}: a page cannot open an extension page itself.
 */
export const OPEN_MY_TIMELINE = Object.freeze({ open: "myTimeline" });

/** The extension's own pages, copied as is; each loads its `.js` twin. */
export const PAGES = Object.freeze([MY_TIMELINE_PAGE]);

/** The browsers the extension is built for, with what only that one needs. */
export const TARGETS = {
  chrome: {
    background: { service_worker: BACKGROUND },
  },
  firefox: {
    // Firefox runs MV3 background scripts as an event page, not a worker.
    background: { scripts: [BACKGROUND] },
    browser_specific_settings: {
      gecko: {
        id: "timeline@valentinmachado.github.io",
        // 140 is the first version that reads data_collection_permissions.
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
};

/**
 * Builds the manifest for one browser.
 *
 * @param {keyof typeof TARGETS} target The browser to build for.
 * @param {string} version The extension's version, `package.json`'s.
 * @returns {object} The manifest, ready to be written as JSON.
 * @throws {RangeError} When `target` is not a key of `TARGETS`.
 */
export function manifestFor(target, version) {
  if (!Object.hasOwn(TARGETS, target)) {
    throw new RangeError(`Unknown browser target: ${target}`);
  }
  return {
    manifest_version: 3,
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    version,
    default_locale: "en",
    // The reader's timeline is kept on the device; photos make it heavy.
    permissions: ["storage", "unlimitedStorage"],
    action: { default_title: "__MSG_myTimelineOpen__" },
    content_scripts: [
      {
        // Every language and the mobile site (fr.m.wikipedia.org) alike.
        matches: ["https://*.wikipedia.org/wiki/*"],
        js: ["content/wikipedia.js"],
        run_at: "document_idle",
      },
    ],
    ...TARGETS[target],
  };
}

/**
 * Lists the scripts a manifest loads, as paths inside the built extension.
 *
 * @param {object} manifest A manifest from `manifestFor`.
 * @returns {string[]} Each script once, in manifest order.
 */
export function scriptsOf(manifest) {
  const scripts = [
    ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js),
    ...(manifest.background?.scripts ?? []),
    ...[manifest.background?.service_worker ?? []].flat(),
    ...PAGES.map(scriptOfPage),
  ];
  return [...new Set(scripts)];
}

/**
 * @param {string} page an extension page, as a path inside the extension
 * @returns {string} the script it loads
 */
export function scriptOfPage(page) {
  return page.replace(/\.html$/, ".js");
}

/**
 * The source file a built script comes from.
 *
 * @param {string} builtPath A path inside the built extension.
 * @returns {string} The same path under `src/`.
 */
export function sourceOf(builtPath) {
  return `src/${builtPath}`;
}
