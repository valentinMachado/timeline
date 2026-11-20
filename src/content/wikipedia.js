/**
 * Content script for Wikipedia articles: reads the dates of the article and
 * injects, above the article's text, a banner that draws them as a timeline
 * (`timelineView.js`).
 *
 * The banner lives in a shadow root so that Wikipedia's styles do not reach
 * it and its own do not leak into the page. Its colours are Wikipedia's own
 * design tokens, which inherit through the shadow boundary, so it follows the
 * reader's light or dark theme in every skin that defines them.
 */

import { LANGUAGES, extractEvents } from "../shared/dateExtraction.js";
import { hasOwnLink, spanOf, weightOf } from "../shared/timelineLayout.js";
import {
  articleTitle,
  isArticleView,
  isBackMatter,
  pageLanguage,
  summaryUrl,
} from "../shared/wikipediaPage.js";
import { TIMELINE_STYLE, TimelineView } from "./timelineView.js";

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

/** Where an article's own pictures are: its figures and its infobox. */
const PICTURES = [
  "figure",
  ".thumb",
  ".infobox",
  ".infobox_v2",
  ".infobox_v3",
].join(", ");

/** Narrower pictures are icons and flags, not illustrations. */
const PICTURE_MIN_WIDTH = 80;

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
  header {
    display: flex;
    align-items: baseline;
    gap: 1em;
  }
  h2 {
    all: unset;
    display: block;
    font-weight: bold;
  }
  p {
    flex: 1;
    margin: 0;
    color: var(--color-subtle, #54595d);
  }
  ${TIMELINE_STYLE}
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
 * @typedef {object} Section
 * @property {string} title its heading; the article's title for the lead
 * @property {string | null} image the URL of its first picture
 */

/**
 * Every paragraph and list item of the article's story, in order, each with
 * the section it is in; and each section's title and first picture.
 * Back-matter sections (notes, bibliography) are left out up to the next
 * top-level section.
 *
 * @param {Element} content the article's text, `.mw-parser-output`
 * @param {string} title the article's title, which names the lead
 * @returns {{
 *   blocks: import("../shared/dateExtraction.js").Block[],
 *   sections: Map<string | null, Section>,
 * }} the sections by anchor, the lead's null
 */
function readArticle(content, title) {
  const blocks = [];
  const sections = new Map([[null, { title, image: null }]]);
  let section = null;
  let backMatter = false;
  const query = "h2, h3, h4, h5, h6, p, li, img";
  for (const element of content.querySelectorAll(query)) {
    if (element instanceof HTMLImageElement) {
      const current = sections.get(section);
      const wide = Number(element.getAttribute("width")) >= PICTURE_MIN_WIDTH;
      if (!current.image && wide && element.closest(PICTURES)) {
        current.image = element.currentSrc || element.src;
      }
      continue;
    }
    if (element.closest(SKIPPED_BLOCKS)) continue;
    if (/^H\d$/.test(element.tagName)) {
      section = anchorOf(element);
      const heading = element.querySelector(".mw-headline") ?? element;
      sections.set(section, { title: heading.textContent.trim(), image: null });
      if (element.tagName === "H2") backMatter = isBackMatter(section ?? "");
      continue;
    }
    if (backMatter) continue;
    const block = readBlock(element);
    if (block.text.trim()) blocks.push({ ...block, section });
  }
  return { blocks, sections };
}

/**
 * What the timeline draws of each event: where it falls, how much it
 * weighs, what its card says, shows and leads to.
 *
 * @param {import("../shared/dateExtraction.js").TimelineEvent[]} events
 * @param {Map<string | null, Section>} sections
 * @param {string} pageUrl the page, without a fragment
 * @returns {import("./timelineView.js").TimelineItem[]}
 */
function itemsOf(events, sections, pageUrl) {
  const lead = sections.get(null);
  return events.map((event) => {
    const section = sections.get(event.section) ?? lead;
    const own = hasOwnLink(event, pageUrl);
    return {
      ...spanOf(event),
      weight: weightOf(event, pageUrl),
      written: event.written,
      title: own ? articleTitle(event.link) : section.title,
      href: event.link,
      description: event.sentence.text,
      summary: own ? summaryUrl(event.link) : null,
      image: section.image ?? lead.image,
    };
  });
}

/**
 * Builds the banner's host element, its shadow root filled: a heading, how
 * many dates were read and, when there are any, the timeline.
 *
 * @param {import("./timelineView.js").TimelineItem[]} items
 * @returns {HTMLElement}
 */
function createBanner(items) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const section = document.createElement("section");
  section.setAttribute("aria-label", chrome.i18n.getMessage("bannerTitle"));
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = chrome.i18n.getMessage("bannerTitle");
  const summary = document.createElement("p");
  summary.textContent = items.length
    ? chrome.i18n.getMessage("bannerCount", [String(items.length)])
    : chrome.i18n.getMessage("bannerEmpty");
  header.append(title, summary);
  section.append(header);
  if (items.length) {
    const timeline = new TimelineView(items);
    header.append(timeline.controls());
    section.append(timeline.element);
  }

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

  const pageUrl = location.origin + location.pathname;
  const options = { language, pageUrl, now: new Date().getFullYear() };
  const story = content.querySelector(".mw-parser-output") ?? content;
  const { blocks, sections } = readArticle(
    story,
    articleTitle(pageUrl) ?? document.title,
  );
  const events = blocks.flatMap((block) => extractEvents(block, options));
  content.before(createBanner(itemsOf(events, sections, pageUrl)));
}

injectBanner();
