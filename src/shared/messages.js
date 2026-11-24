/**
 * The extension's messages read the way `chrome.i18n.getMessage` reads them,
 * for where that API does not exist: the installable site, which bundles the
 * same `_locales/<language>/messages.json` files.
 *
 * A message names its placeholders as `$name$`; a placeholder's `content`
 * says which substitution it takes, `$1` for the first; `$$` is a dollar.
 */

/**
 * @typedef {object} MessageEntry
 * @property {string} message the text, with `$name$` placeholders
 * @property {Object<string, { content: string }>} [placeholders] by name,
 *   lower case
 */

/**
 * A message with its substitutions put in, as `chrome.i18n.getMessage`
 * returns it.
 *
 * @param {Object<string, MessageEntry>} messages one language's file
 * @param {string} key
 * @param {string | string[]} [substitutions]
 * @returns {string} the empty string for a key the file lacks, as the
 *   extension API does
 */
export function formatMessage(messages, key, substitutions = []) {
  const entry = messages[key];
  if (!entry) return "";
  const values = [substitutions].flat();
  const placeholders = entry.placeholders ?? {};
  // A placeholder's content is expanded before the `$1`s it holds.
  const named = entry.message.replace(
    /\$(\w+)\$/g,
    (whole, name) => placeholders[name.toLowerCase()]?.content ?? whole,
  );
  return named.replace(/\$(\$|[1-9])/g, (_, what) =>
    what === "$" ? "$" : (values[what - 1] ?? ""),
  );
}

/**
 * The language to speak among those there are messages for: the first of
 * the reader's preferred languages that is one of them, by its primary tag
 * (`fr-CA` is `fr`); failing any, the fallback.
 *
 * @param {readonly string[]} preferred the reader's, `navigator.languages`
 * @param {readonly string[]} available
 * @param {string} fallback one of `available`
 * @returns {string}
 */
export function pickLanguage(preferred, available, fallback) {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split("-")[0];
    if (available.includes(primary)) return primary;
  }
  return fallback;
}

/**
 * A manifest with its `__MSG_key__` strings put in one language, as a
 * browser does for an extension's manifest; the installable site's
 * manifest is written the same way and filled in at build time.
 *
 * @template T
 * @param {T} value a manifest, or any part of it
 * @param {Object<string, MessageEntry>} messages one language's file
 * @returns {T} a copy
 * @throws {RangeError} on a key the file lacks
 */
export function localize(value, messages) {
  if (typeof value === "string") {
    return value.replace(/__MSG_(\w+)__/g, (_, key) => {
      if (!messages[key]) throw new RangeError(`No message ${key}`);
      return formatMessage(messages, key);
    });
  }
  if (Array.isArray(value)) return value.map((v) => localize(v, messages));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, localize(v, messages)]),
    );
  }
  return value;
}
