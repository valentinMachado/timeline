/**
 * The extension's messages, from `chrome.i18n`. Code that draws anything
 * imports this module as `#i18n`, never this path: `package.json` maps that
 * name to this file in the extension and to `src/web/i18n.js` in the
 * installable site, which has no `chrome.i18n`. Both export the same two
 * functions.
 */

/**
 * A user-visible message in the reader's language. Always called with a
 * literal key: `test/locales.test.js` finds the keys in use by that call.
 *
 * @param {string} key a key of `_locales/<language>/messages.json`
 * @param {string | string[]} [substitutions] for its `$1`, `$2`…
 * @returns {string}
 */
export function message(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

/**
 * @returns {string} the language of the browser's interface, as `en-US`
 */
export function uiLanguage() {
  return chrome.i18n.getUILanguage();
}
