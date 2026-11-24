/**
 * The installable site: the timeline of a Wikipedia article where the
 * extension cannot run, Chrome on Android first.
 *
 * The site is one page. With no query it asks for an article; it opens one
 * from `?url=` (a link followed inside the site, or a page shared to the
 * installed site, `share_target` in `manifest.js`), from `?text=` (a share
 * that put the address in the text), or from `?q=` and `?lang=` (the form:
 * an address or a title). The article's text is fetched from the Action API
 * as the site's own HTML and shown under the same banner as on Wikipedia
 * (`articleTimeline.js`), credited under its licence.
 */

import { message, uiLanguage } from "#i18n";
import { LANGUAGES } from "../shared/dateExtraction.js";
import {
  articleIn,
  articleTitle,
  articleUrl,
  historyUrl,
  pageLanguage,
  parseUrl,
} from "../shared/wikipediaPage.js";
import { showArticleTimeline } from "../ui/articleTimeline.js";
import { webManifestFile } from "./manifest.js";

/** The licence of Wikipedia's text, and where it is written. */
const LICENCE = {
  name: "CC BY-SA 4.0",
  url: (language) =>
    `https://creativecommons.org/licenses/by-sa/4.0/deed.${language}`,
};

/** The parts of a query that may name an article, in the order tried. */
const QUERY_KEYS = ["url", "text", "q"];

/**
 * @typedef {object} Article
 * @property {string} language
 * @property {string} title
 * @property {string} fragment the section to open at, empty for the top
 */

/**
 * @param {string} tag
 * @param {object} [properties] set on the element
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
function make(tag, properties = {}, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

/** @returns {string} the language the site speaks, `en` or `fr` */
function siteLanguage() {
  return uiLanguage().split("-")[0];
}

/**
 * The article a query asks for: an address wherever it is, failing one the
 * title typed in the form, on the Wikipedia picked beside it.
 *
 * @param {URLSearchParams} query
 * @returns {Article | null | undefined} undefined when the query asks for
 *   nothing; null when what it asks for is not an article
 */
function articleOf(query) {
  const asked = QUERY_KEYS.map((key) => query.get(key)?.trim() ?? "");
  if (!asked.some(Boolean)) return undefined;
  for (const text of asked) {
    const article = articleIn(text);
    if (article) return article;
  }
  const typed = query.get("q")?.trim();
  if (!typed || /^\w+:\/\//.test(typed)) return null;
  const language = query.get("lang") ?? siteLanguage();
  return { language, title: typed, fragment: "" };
}

/**
 * @param {string} href an article of a Wikipedia the site reads
 * @returns {string} the site's page that shows it
 */
function siteUrlOf(href) {
  return `./?${new URLSearchParams({ url: href })}`;
}

/**
 * The bar at the top: the site's name, back to its first page, and the
 * form that opens an article by its address or its title.
 *
 * @param {Article | null | undefined} article the one shown, to prefill
 *   the form's language
 * @returns {{ bar: HTMLElement, input: HTMLInputElement }}
 */
function createBar(article) {
  const names = new Intl.DisplayNames([uiLanguage()], { type: "language" });
  const input = make("input", {
    type: "search",
    name: "q",
    required: true,
    placeholder: message("webArticleLabel"),
    enterKeyHint: "go",
  });
  input.setAttribute("aria-label", message("webArticleLabel"));
  const language = make(
    "select",
    { name: "lang" },
    ...LANGUAGES.map((code) => make("option", { value: code }, names.of(code))),
  );
  language.value = article?.language ?? siteLanguage();
  language.setAttribute("aria-label", message("webLanguageLabel"));
  const form = make(
    "form",
    { action: "./", method: "get", role: "search" },
    input,
    language,
    make("button", { type: "submit" }, message("webOpen")),
  );
  const home = make(
    "a",
    { className: "home", href: "./" },
    message("webShortName"),
  );
  return { bar: make("header", { className: "bar" }, home, form), input };
}

/**
 * @param {string} text
 * @param {boolean} [error]
 * @returns {HTMLElement}
 */
function notice(text, error = false) {
  const element = make("p", { className: "notice" }, text);
  element.classList.toggle("error", error);
  if (error) element.setAttribute("role", "alert");
  return element;
}

/**
 * Wikipedia's HTML made safe to show here and to read as on Wikipedia:
 * nothing that runs, links made absolute (the extension reads where a link
 * leads from its `href`), every address on Wikipedia's origin.
 *
 * @param {string} html `action=parse`'s text
 * @param {string} base the article's address
 * @returns {Element} its `.mw-parser-output`
 */
function adopt(html, base) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed
    .querySelectorAll("script, iframe, object, embed")
    .forEach((element) => element.remove());
  for (const element of parsed.body.querySelectorAll("*")) {
    for (const { name } of [...element.attributes]) {
      if (name.startsWith("on")) element.removeAttribute(name);
    }
  }
  for (const link of parsed.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (href.startsWith("#")) continue;
    const url = new URL(href, base);
    if (/^https?:$/.test(url.protocol)) link.href = url.href;
    else link.removeAttribute("href");
  }
  for (const image of parsed.querySelectorAll("img[src]")) {
    image.src = new URL(image.getAttribute("src"), base).href;
  }
  const story = parsed.body.firstElementChild ?? parsed.body;
  return document.adoptNode(story);
}

/**
 * Asks Wikipedia for an article's text.
 *
 * @param {Article} article
 * @returns {Promise<{ title: string, displayTitle: string, html: string }
 *   | null>} its title once redirects are followed; null when there is no
 *   such article
 * @throws {Error} when Wikipedia could not be reached
 */
async function fetchArticle({ language, title }) {
  const response = await fetch(parseUrl(language, title));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) {
    if (body.error.code === "missingtitle") return null;
    throw new Error(body.error.info ?? body.error.code);
  }
  const { parse } = body;
  const displayTitle =
    new DOMParser().parseFromString(parse.displaytitle, "text/html").body
      .textContent || parse.title;
  return { title: parse.title, displayTitle, html: parse.text };
}

/**
 * The credit Wikipedia's licence asks for: the article, its authors (its
 * history) and the licence, each a link.
 *
 * @param {string} language
 * @param {string} title
 * @param {string} pageUrl
 * @returns {HTMLElement}
 */
function licenceOf(language, title, pageUrl) {
  const links = [
    make("a", { href: pageUrl }, title),
    make("a", { href: historyUrl(language, title) }, message("webAuthors")),
    make(
      "a",
      { href: LICENCE.url(siteLanguage()), rel: "license" },
      LICENCE.name,
    ),
  ];
  // Each link stands in the sentence where its substitution is: a
  // character of the private use area, which no message holds.
  const marks = links.map((_, index) => String.fromCharCode(0xe000 + index));
  const parts = message("webLicence", marks)
    .split(/([-])/)
    .map((part) => links[marks.indexOf(part)] ?? part);
  return make("footer", { className: "licence" }, ...parts);
}

/**
 * Follows a link to another article of a Wikipedia the site reads inside
 * the site, the banner's ↗ included, whose link is in its shadow root.
 *
 * @param {MouseEvent} event
 */
function stayInSite(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  const link = event
    .composedPath()
    .find((target) => target instanceof HTMLAnchorElement && target.href);
  if (!link || !articleTitle(link.href)) return;
  if (!LANGUAGES.includes(pageLanguage(new URL(link.href).hostname))) return;
  event.preventDefault();
  location.assign(siteUrlOf(link.href));
}

/**
 * Shows an article under its timeline, or says why it cannot.
 *
 * @param {HTMLElement} main
 * @param {Article | null} article
 */
async function showArticle(main, article) {
  if (!article || !LANGUAGES.includes(article.language)) {
    main.replaceChildren(notice(message("webNotArticle"), true));
    return;
  }
  main.replaceChildren(notice(message("webLoading")));
  let fetched;
  try {
    fetched = await fetchArticle(article);
  } catch {
    main.replaceChildren(notice(message("webFailed"), true));
    return;
  }
  if (!fetched) {
    main.replaceChildren(notice(message("webMissing"), true));
    return;
  }
  const { language, fragment } = article;
  const { title, displayTitle, html } = fetched;
  const pageUrl = articleUrl(language, title);
  document.title = `${displayTitle} — ${message("webShortName")}`;
  const content = make("div", { lang: language });
  content.append(adopt(html, pageUrl));
  main.replaceChildren(
    make("h1", { lang: language }, displayTitle),
    make(
      "p",
      { className: "source" },
      make("a", { href: pageUrl }, message("webReadOnWikipedia")),
    ),
    content,
    licenceOf(language, displayTitle, pageUrl),
  );
  showArticleTimeline(content, { language, pageUrl, title });
  if (fragment) document.getElementById(fragment)?.scrollIntoView();
}

/** Builds the page for what its query asks. */
function start() {
  document.documentElement.lang = siteLanguage();
  document.title = message("webShortName");
  document
    .querySelector('link[rel="manifest"]')
    ?.setAttribute("href", webManifestFile(siteLanguage()));
  navigator.serviceWorker
    ?.register("sw.js")
    // The site works without it, only not offline.
    .catch((error) => console.warn("No service worker:", error));

  const article = articleOf(new URLSearchParams(location.search));
  const { bar, input } = createBar(article);
  const main = make("main");
  document.body.prepend(bar, main);
  document.addEventListener("click", stayInSite);
  if (article === undefined) {
    main.append(notice(message("webIntro")));
    input.focus();
    return;
  }
  showArticle(main, article);
}

start();
