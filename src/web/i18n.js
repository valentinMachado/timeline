/**
 * The installable site's messages: the extension's own `messages.json`,
 * bundled, in the first of the reader's languages there is a file for.
 * Imported as `#i18n`, like `src/ui/i18n.js` in the extension, whose two
 * functions it mirrors.
 */

import en from "../_locales/en/messages.json";
import fr from "../_locales/fr/messages.json";
import { formatMessage, pickLanguage } from "../shared/messages.js";

/** Every language there are messages for. */
const MESSAGES = { en, fr };

/** The extension's `default_locale`. */
const FALLBACK = "en";

/** The language the site speaks, settled once. */
const LANGUAGE = pickLanguage(
  navigator.languages ?? [navigator.language],
  Object.keys(MESSAGES),
  FALLBACK,
);

/**
 * A user-visible message in the reader's language, as `chrome.i18n` would
 * give it.
 *
 * @param {string} key
 * @param {string | string[]} [substitutions]
 * @returns {string}
 */
export function message(key, substitutions) {
  return (
    formatMessage(MESSAGES[LANGUAGE], key, substitutions) ||
    formatMessage(MESSAGES[FALLBACK], key, substitutions)
  );
}

/**
 * The language dates and numbers are written in: the browser's own when it
 * is the one the messages are in (`fr-CA` keeps its region), else that of
 * the messages, so that a month name never comes in a third language.
 *
 * @returns {string}
 */
export function uiLanguage() {
  const own = navigator.language ?? FALLBACK;
  return own.toLowerCase().split("-")[0] === LANGUAGE ? own : LANGUAGE;
}
