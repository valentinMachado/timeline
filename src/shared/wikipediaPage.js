/**
 * What a Wikipedia page is, read from the classes MediaWiki puts on `<body>`.
 *
 * The content script runs in an isolated world and cannot reach `mw.config`,
 * but every skin (Vector, Vector 2022, Minerva on mobile, MonoBook, Timeless)
 * writes the namespace and the action as body classes, which it can read.
 */

/**
 * Whether the page is an article being read: the main namespace (`ns-0`),
 * viewed rather than edited or compared (`action-view`).
 *
 * @param {string} bodyClassName The `className` of the page's `<body>`.
 * @returns {boolean}
 */
export function isArticleView(bodyClassName) {
  const classes = new Set(bodyClassName.split(/\s+/));
  return classes.has("ns-0") && classes.has("action-view");
}

/**
 * The language of a Wikipedia, from its host name: `fr` for
 * `fr.wikipedia.org` and its mobile site `fr.m.wikipedia.org`.
 *
 * @param {string} hostname
 * @returns {string | null} null for a host that is not a Wikipedia
 */
export function pageLanguage(hostname) {
  return /^([a-z-]+)\.(?:m\.)?wikipedia\.org$/.exec(hostname)?.[1] ?? null;
}

/**
 * Namespaces a link may point into that are not articles, lower case, in
 * every language the extension reads (their canonical English names work on
 * every Wikipedia).
 */
const OTHER_NAMESPACES = new Set([
  "aide",
  "book",
  "catégorie",
  "category",
  "discussion",
  "draft",
  "fichier",
  "file",
  "help",
  "image",
  "media",
  "mediawiki",
  "modèle",
  "module",
  "portail",
  "portal",
  "projet",
  "référence",
  "spécial",
  "special",
  "talk",
  "template",
  "timedtext",
  "user",
  "utilisateur",
  "utilisatrice",
  "wikipedia",
  "wikipédia",
  "wp",
]);

/**
 * The title of the article a link leads to, or null when it leads elsewhere:
 * a file, a category, a help page, a missing page (`/w/index.php?…
 * redlink=1`), another site.
 *
 * @param {string} href an absolute URL, as `HTMLAnchorElement.href` gives it
 * @returns {string | null} the title, decoded, spaces for underscores
 */
export function articleTitle(href) {
  const match =
    /^https:\/\/[a-z-]+\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/.exec(href);
  if (!match) return null;
  let title;
  try {
    title = decodeURIComponent(match[1]).replace(/_/g, " ");
  } catch {
    return null;
  }
  const namespace = /^([^:]+):/.exec(title)?.[1].trim().toLowerCase();
  if (namespace && OTHER_NAMESPACES.has(namespace)) return null;
  return title;
}

/**
 * Sections at the end of an article that list sources and further reading
 * rather than tell its story, by the anchor of their heading. Their dates
 * are publication years, not events.
 */
const BACK_MATTER = new Set([
  "Notes",
  "Références",
  "Notes_et_références",
  "Bibliographie",
  "Sources",
  "Voir_aussi",
  "Articles_connexes",
  "Liens_externes",
  "References",
  "Citations",
  "Bibliography",
  "Further_reading",
  "See_also",
  "External_links",
  "Footnotes",
  "Works_cited",
]);

/**
 * @param {string} anchor the id of a section's heading
 * @returns {boolean} whether the section is back matter: sources, links
 */
export function isBackMatter(anchor) {
  return BACK_MATTER.has(anchor);
}

/**
 * Where the REST API sums up the article a link leads to: its title, a short
 * description, its lead picture. The API is asked on the desktop host of
 * the article's Wikipedia, which is the page's own origin for most links and
 * answers other origins too.
 *
 * @param {string} href an absolute URL
 * @returns {string | null} the summary's URL, null when the link does not
 *   lead to an article
 */
export function summaryUrl(href) {
  const title = articleTitle(href);
  if (title === null) return null;
  const language = /^https:\/\/([a-z-]+)\./.exec(href)[1];
  const path = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://${language}.wikipedia.org/api/rest_v1/page/summary/${path}`;
}

/**
 * The characters MediaWiki leaves as they are in an article's path
 * (`wfUrlencode`), so that an address built here is the one its own links
 * give, and a link of the article to itself is recognised.
 */
const PATH_KEPT = /%(?:3B|40|24|21|2A|2C|2F|3A)/g;

/**
 * The address of an article on the desktop site of its Wikipedia, written
 * as MediaWiki writes its links.
 *
 * @param {string} language
 * @param {string} title spaces or underscores alike
 * @returns {string}
 */
export function articleUrl(language, title) {
  const path = encodeURIComponent(title.replace(/ /g, "_")).replace(
    PATH_KEPT,
    decodeURIComponent,
  );
  return `https://${language}.wikipedia.org/wiki/${path}`;
}

/**
 * The article an address leads to, wherever it is in a text: a browser
 * shares a page as its address, alone or after its title.
 *
 * @param {string} text
 * @returns {{ language: string, title: string, fragment: string } | null}
 *   the section it points at in `fragment`, decoded, empty for none; null
 *   when the text holds no article's address
 */
export function articleIn(text) {
  const match = /https:\/\/[a-z-]+\.(?:m\.)?wikipedia\.org\/wiki\/\S+/.exec(
    text,
  );
  const title = match && articleTitle(match[0]);
  if (!title) return null;
  const url = new URL(match[0]);
  let fragment;
  try {
    fragment = decodeURIComponent(url.hash.slice(1));
  } catch {
    fragment = "";
  }
  return { language: pageLanguage(url.hostname), title, fragment };
}

/**
 * Where the Action API gives an article's text as the site's own HTML
 * (`action=parse`), which the extension reads unchanged; open to every
 * origin (`origin=*`, no cookies), redirects followed.
 *
 * @param {string} language
 * @param {string} title
 * @returns {string}
 */
export function parseUrl(language, title) {
  const query = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "text|displaytitle",
    redirects: "1",
    disableeditsection: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  return `https://${language}.wikipedia.org/w/api.php?${query}`;
}

/**
 * Where the authors of an article are listed: its history.
 *
 * @param {string} language
 * @param {string} title
 * @returns {string}
 */
export function historyUrl(language, title) {
  const query = new URLSearchParams({
    title: title.replace(/ /g, "_"),
    action: "history",
  });
  return `https://${language}.wikipedia.org/w/index.php?${query}`;
}
