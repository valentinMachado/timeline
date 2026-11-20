/**
 * Content script for Wikipedia articles: reads the dates of the article and
 * injects the banner the timeline will be drawn in, above the article's text.
 * For now the banner says how many dates it read.
 *
 * The banner lives in a shadow root so that Wikipedia's styles do not reach
 * it and its own do not leak into the page. Its colours are Wikipedia's own
 * design tokens, which inherit through the shadow boundary, so it follows the
 * reader's light or dark theme in every skin that defines them.
 */

import { LANGUAGES, extractEvents } from "../shared/dateExtraction.js";
import {
  articleTitle,
  isArticleView,
  isBackMatter,
  pageLanguage,
} from "../shared/wikipediaPage.js";

/** The id of the banner's host element, to never inject it twice. */
const HOST_ID = "timeline-extension-banner";

/**
 * What holds no event of the article: notes, navigation boxes, infoboxes and
 * tables (not read yet), warnings at the top of the article, galleries.
 */
const SKIPPED_BLOCKS = [
  "table",
  "figure",
  ".reflist",
  ".references",
  ".mw-references-wrap",
  ".navbox",
  ".infobox",
  ".hatnote",
  ".bandeau",
  ".metadata",
  ".gallery",
  ".thumb",
  ".toc",
  ".noprint",
  ".mw-editsection",
].join(", ");

/** Inside a block, what is not part of its text: note calls, sub-lists. */
const SKIPPED_INLINE = [
  "sup.reference",
  ".mw-editsection",
  "style",
  "script",
  "ul",
  "ol",
  ".noprint",
].join(", ");

const STYLE = `
  :host {
    all: initial;
    display: block;
    margin: 0.5em 0 1em;
  }
  section {
    font-family: sans-serif;
    font-size: 0.875rem;
    color: var(--color-base, #202122);
    background: var(--background-color-neutral-subtle, #f8f9fa);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 2px;
    padding: 0.75em 1em;
    min-height: 4em;
  }
  h2 {
    all: unset;
    display: block;
    font-weight: bold;
    margin-bottom: 0.25em;
  }
  p {
    margin: 0;
    color: var(--color-subtle, #54595d);
  }
`;

/**
 * The text of a paragraph or list item, and the article links in it, with
 * their offsets into that text. A nested list is left out: its items are
 * blocks of their own.
 *
 * @param {Element} element
 * @returns {{ text: string, links: { start: number, end: number, href: string }[] }}
 */
function readBlock(element) {
  let text = "";
  const links = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.data;
      } else if (child instanceof Element && !child.matches(SKIPPED_INLINE)) {
        const start = text.length;
        visit(child);
        if (child instanceof HTMLAnchorElement && articleTitle(child.href)) {
          links.push({ start, end: text.length, href: child.href });
        }
      }
    }
  };
  visit(element);
  return { text, links };
}

/**
 * The anchor of a section heading, in the markup of 2024 onwards
 * (`<h2 id>`) and before it (`<h2><span class="mw-headline" id>`).
 *
 * @param {Element} heading
 * @returns {string | null}
 */
function anchorOf(heading) {
  return heading.id || heading.querySelector(".mw-headline")?.id || null;
}

/**
 * Every paragraph and list item of the article's story, in order, each with
 * the section it is in. Back-matter sections (notes, bibliography) are
 * left out up to the next top-level section.
 *
 * @param {Element} content the article's text, `.mw-parser-output`
 * @returns {import("../shared/dateExtraction.js").Block[]}
 */
function readBlocks(content) {
  const blocks = [];
  let section = null;
  let backMatter = false;
  for (const element of content.querySelectorAll("h2, h3, h4, h5, h6, p, li")) {
    if (element.closest(SKIPPED_BLOCKS)) continue;
    if (/^H\d$/.test(element.tagName)) {
      section = anchorOf(element);
      if (element.tagName === "H2") backMatter = isBackMatter(section ?? "");
      continue;
    }
    if (backMatter) continue;
    const block = readBlock(element);
    if (block.text.trim()) blocks.push({ ...block, section });
  }
  return blocks;
}

/**
 * Builds the banner's host element, its shadow root filled.
 *
 * @param {number} eventCount how many dates were read from the page
 * @returns {HTMLElement}
 */
function createBanner(eventCount) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const section = document.createElement("section");
  section.setAttribute("aria-label", chrome.i18n.getMessage("bannerTitle"));
  const title = document.createElement("h2");
  title.textContent = chrome.i18n.getMessage("bannerTitle");
  const summary = document.createElement("p");
  summary.textContent = eventCount
    ? chrome.i18n.getMessage("bannerCount", [String(eventCount)])
    : chrome.i18n.getMessage("bannerEmpty");
  section.append(title, summary);

  root.append(style, section);
  return host;
}

/**
 * Reads the article's dates and injects the banner above its text, once, on
 * articles of a Wikipedia whose language the extension reads.
 */
function injectBanner() {
  if (!isArticleView(document.body.className)) return;
  if (document.getElementById(HOST_ID)) return;
  const language = pageLanguage(location.hostname);
  if (!LANGUAGES.includes(language)) return;
  // #mw-content-text holds the article's text in every skin.
  const content = document.getElementById("mw-content-text");
  if (!content) return;

  const options = {
    language,
    pageUrl: location.origin + location.pathname,
    now: new Date().getFullYear(),
  };
  const story = content.querySelector(".mw-parser-output") ?? content;
  const events = readBlocks(story).flatMap((block) =>
    extractEvents(block, options),
  );
  content.before(createBanner(events.length));
}

injectBanner();
