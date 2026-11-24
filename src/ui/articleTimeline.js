/**
 * The timeline of an article: reads the dates of its text and puts above it
 * a banner that draws them (`timelineView.js`). A card scrolls the article
 * to its date, highlighted; its ↗ opens the article it is about; every date
 * read is faintly highlighted in the text, and clicking one brings the
 * banner back centred on its event.
 *
 * The article is Wikipedia's parsed HTML, `.mw-parser-output`, wherever it
 * is shown: on Wikipedia itself under the extension's content script, or
 * fetched and shown by the installable site. What only one of them does —
 * the extension's button to the reader's timeline, the + that adds an event
 * to it — is handed in.
 *
 * The banner lives in a shadow root so that the page's styles do not reach
 * it and its own do not leak into the page. Its colours are Wikipedia's own
 * design tokens, which inherit through the shadow boundary, so it follows the
 * reader's light or dark theme in every skin that defines them.
 */

import { message } from "#i18n";
import { extractEvents } from "../shared/dateExtraction.js";
import { datePartOf } from "../shared/myTimeline.js";
import { hasOwnLink, spanOf, weightOf } from "../shared/timelineLayout.js";
import {
  articleTitle,
  isBackMatter,
  summaryUrl,
} from "../shared/wikipediaPage.js";
import { pictureOf } from "./pictures.js";
import { TIMELINE_STYLE, TimelineView } from "./timelineView.js";

/** The id of the banner's host element, to never inject it twice. */
export const HOST_ID = "timeline-extension-banner";

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
    /* At a phone's width, the count takes a line of its own. */
    flex: 1 1 12em;
    margin: 0;
    color: var(--color-subtle, #54595d);
  }
  header {
    flex-wrap: wrap;
  }
  ${TIMELINE_STYLE}
  @media (pointer: coarse) {
    header > button { min-height: 2.25em; }
  }
`;

/** The name of the highlight on the date a card scrolled to. */
const HIGHLIGHT = "timeline-extension-date";

/** The name of the highlight on every date the timeline was made from. */
const DATES = "timeline-extension-dates";

/**
 * Put in the page, not in a shadow root: a highlight paints the page's text.
 * A translucent yellow, as a marker pen: it reads on a light and a dark
 * theme alike, the text keeping its own colour. Every date read is a faint
 * stroke of it; the one a card scrolled to, a full one.
 */
const PAGE_STYLE = `
  ::highlight(${DATES}) {
    background-color: rgb(255 204 51 / 0.22);
    text-decoration: underline dotted 1px rgb(255 170 0);
  }
  ::highlight(${HIGHLIGHT}) {
    background-color: rgb(255 204 51 / 0.6);
    text-decoration: underline 2px rgb(255 170 0);
  }
`;

/** How long the date a card scrolled to stays highlighted, in milliseconds. */
const HIGHLIGHT_DURATION = 4000;

/**
 * @typedef {object} TextPiece
 * @property {Text} node a text node of the block
 * @property {number} start the offset of its first character in the block
 */

/**
 * The text of a paragraph or list item, or of a selection, and the article
 * links in it, with their offsets into that text; and the text nodes it was
 * read from, to find an offset in the page again. A nested list is left
 * out: its items are blocks of their own.
 *
 * @param {Element | DocumentFragment} element
 * @returns {{
 *   text: string,
 *   links: { start: number, end: number, href: string }[],
 *   pieces: TextPiece[],
 * }}
 */
export function readBlock(element) {
  let text = "";
  const links = [];
  const pieces = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        pieces.push({ node: child, start: text.length });
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
  return { text, links, pieces };
}

/**
 * The range of the page a span of a block's text was read from.
 *
 * @param {TextPiece[]} pieces the block's, from `readBlock`
 * @param {{ start: number, end: number }} span offsets into the block's text
 * @returns {Range | null} null if the span is in no piece
 */
function rangeOf(pieces, { start, end }) {
  // The start is in the piece it begins; the end, in the piece it closes.
  const at = (offset, after) =>
    pieces.find(
      ({ node, start: from }) =>
        offset >= from + after && offset < from + node.data.length + after,
    );
  const first = at(start, 0);
  const last = at(end, 1);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}

/**
 * Opens the section of the mobile site that hides a node: there, every
 * section but the lead starts folded, and its heading unfolds it.
 *
 * @param {Node} node
 */
function unfold(node) {
  const folded = node.parentElement?.closest(
    ".collapsible-block:not(.open-block)",
  );
  folded?.previousElementSibling?.click();
}

/** @returns {boolean} whether the reader asked for less motion */
function stillMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The timer that clears the highlight, to restart it on another card. */
let highlightTimer = 0;

/**
 * Scrolls the article to where a date was read, and highlights it for a
 * while where the browser can (the CSS Custom Highlight API).
 *
 * @param {Range | null} range where the date is written; null, nothing
 */
function showInText(range) {
  if (!range) return;
  unfold(range.startContainer);
  const rect = range.getBoundingClientRect();
  const still = stillMotion();
  window.scrollBy({
    top: rect.top - innerHeight / 3,
    behavior: still ? "auto" : "smooth",
  });
  if (!globalThis.CSS?.highlights) return;
  const highlight = new Highlight(range);
  // Above the faint highlight of every date, which covers the same text.
  highlight.priority = 1;
  CSS.highlights.set(HIGHLIGHT, highlight);
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(
    () => CSS.highlights.delete(HIGHLIGHT),
    HIGHLIGHT_DURATION,
  );
}

/**
 * Highlights every date of the article the timeline was made from, and
 * hands over the one the reader clicks. A highlight is no element, so a
 * click finds its date by where the date is drawn. A date written as a
 * link is left to its link.
 *
 * @param {(Range | null)[]} ranges by event index; null for a date that
 *   could not be found again
 * @param {(index: number) => void} onPick
 */
function watchDates(ranges, onPick) {
  if (!globalThis.CSS?.highlights) return;
  CSS.highlights.set(DATES, new Highlight(...ranges.filter(Boolean)));
  const dateAt = ({ target, clientX: x, clientY: y }) => {
    if (!(target instanceof Element) || target.closest("a, button, input")) {
      return -1;
    }
    // Only the dates in the element under the pointer are measured.
    return ranges.findIndex(
      (range) =>
        range?.intersectsNode(target) &&
        [...range.getClientRects()].some(
          (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
        ),
    );
  };
  document.addEventListener("click", (event) => {
    // The click that ends a selection is about the selection.
    if (event.defaultPrevented || !document.getSelection().isCollapsed) return;
    const index = dateAt(event);
    if (index !== -1) onPick(index);
  });
  let frame = 0;
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      document.body.style.cursor = dateAt(event) === -1 ? "" : "pointer";
    });
  });
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
 *   blocks: (import("../shared/dateExtraction.js").Block
 *     & { pieces: TextPiece[] })[],
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
 * What an event shows wherever it is drawn, on the banner or once added to
 * the reader's timeline: its title, and its picture, that of the article it
 * leads to and failing one that of its section or of the article.
 *
 * @param {import("../shared/dateExtraction.js").TimelineEvent} event
 * @param {Map<string | null, Section>} sections
 * @param {string} pageUrl the page, without a fragment
 * @returns {{ title: string,
 *   image: import("../shared/myTimeline.js").Image | null }}
 */
function lookOf(event, sections, pageUrl) {
  const lead = sections.get(null);
  const section = sections.get(event.section) ?? lead;
  const fallback = section.image ?? lead.image;
  const own = hasOwnLink(event, pageUrl);
  const summary = own ? summaryUrl(event.link) : null;
  return {
    title: (own && articleTitle(event.link)) || section.title,
    image: summary
      ? { summary, fallback }
      : fallback
        ? { url: fallback }
        : null,
  };
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
  return events.map((event) => {
    const { title, image } = lookOf(event, sections, pageUrl);
    return {
      ...spanOf(event),
      weight: weightOf(event, pageUrl),
      written: event.written,
      title,
      href: null,
      article: event.link,
      description: event.sentence.text,
      picture: () => pictureOf(image),
    };
  });
}

/**
 * The form's first draft of an event of the page: its date, title, link,
 * sentence and picture, and its section as a first tag.
 *
 * @param {import("../shared/dateExtraction.js").TimelineEvent} event
 * @param {Map<string | null, Section>} sections
 * @param {string} pageUrl
 * @returns {import("./entryForm.js").Draft}
 */
export function draftOf(event, sections, pageUrl) {
  const lead = sections.get(null);
  const section = sections.get(event.section) ?? lead;
  return {
    ...datePartOf(event),
    ...lookOf(event, sections, pageUrl),
    link: event.link,
    description: event.sentence,
    tags: [section.title],
    source: { url: pageUrl, title: lead.title },
  };
}

/**
 * @typedef {object} Page
 * @property {string} language
 * @property {string} pageUrl the page, without a fragment
 * @property {Element} story the article's text
 * @property {Map<string | null, Section>} sections
 */

/**
 * The anchor of the section a node of the article is in: that of the last
 * heading before it, null in the lead.
 *
 * @param {Node} node
 * @param {Element} story
 * @returns {string | null}
 */
export function sectionAt(node, story) {
  let section = null;
  for (const heading of story.querySelectorAll("h2, h3, h4, h5, h6")) {
    const after = heading.compareDocumentPosition(node);
    if (!(after & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    section = anchorOf(heading);
  }
  return section;
}

/**
 * Builds the banner's host element, its shadow root filled: a heading, how
 * many dates were read, the timeline when there are dates, and the buttons
 * handed in.
 *
 * @param {import("./timelineView.js").TimelineItem[]} items
 * @param {object} options
 * @param {(index: number) => void} options.onOpen called with the index of
 *   the item whose card was clicked
 * @param {import("./timelineView.js").CardAction | null} options.action a
 *   button on every card
 * @param {HTMLElement[]} options.buttons put at the end of the heading
 * @returns {{ host: HTMLElement, timeline: TimelineView | null }} the
 *   timeline null when no date was read
 */
function createBanner(items, { onOpen, action, buttons }) {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const section = document.createElement("section");
  section.setAttribute("aria-label", message("bannerTitle"));
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = message("bannerTitle");
  const summary = document.createElement("p");
  summary.textContent = items.length
    ? message("bannerCount", [String(items.length)])
    : message("bannerEmpty");
  header.append(title, summary);
  section.append(header);
  let timeline = null;
  if (items.length) {
    timeline = new TimelineView(items, { action, open: onOpen });
    header.append(timeline.controls());
    section.append(timeline.element);
  }
  header.append(...buttons);

  root.append(style, section);
  return { host, timeline };
}

/**
 * Reads the dates of an article and puts the banner that draws them just
 * above its text; highlights the dates in the text, each leading back to its
 * event on the banner.
 *
 * @param {Element} content what holds the article's text, its
 *   `.mw-parser-output` or that element itself; the banner goes before it
 * @param {object} options
 * @param {string} options.language the article's Wikipedia, which says how
 *   its dates are written; one of `LANGUAGES`
 * @param {string} options.pageUrl the article, without a fragment
 * @param {string} options.title the article's title, which names its lead
 * @param {HTMLElement[]} [options.buttons] put at the end of the banner's
 *   heading
 * @param {(draft: import("./entryForm.js").Draft) => void} [options.onAdd]
 *   when given, every card has a + that hands over its event as a draft
 * @returns {Page} what was read of the article
 */
export function showArticleTimeline(
  content,
  { language, pageUrl, title, buttons = [], onAdd },
) {
  const options = { language, pageUrl, now: new Date().getFullYear() };
  const story = content.querySelector(".mw-parser-output") ?? content;
  const { blocks, sections } = readArticle(story, title);
  const read = blocks.flatMap(({ pieces, ...block }) =>
    extractEvents(block, options).map((event) => ({ event, pieces })),
  );
  const events = read.map(({ event }) => event);
  const style = document.createElement("style");
  style.textContent = PAGE_STYLE;
  document.head.append(style);
  const ranges = read.map(({ event, pieces }) =>
    rangeOf(pieces, event.mention),
  );
  const action = onAdd
    ? {
        text: "+",
        label: message("addToMyTimeline"),
        run: (index) => onAdd(draftOf(events[index], sections, pageUrl)),
      }
    : null;
  const banner = createBanner(itemsOf(events, sections, pageUrl), {
    onOpen: (index) => showInText(ranges[index]),
    action,
    buttons,
  });
  content.before(banner.host);
  watchDates(ranges, (index) => {
    banner.timeline?.reveal(index);
    // Centred, clear of a sticky header.
    banner.host.scrollIntoView({
      block: "center",
      behavior: stillMotion() ? "auto" : "smooth",
    });
  });
  return { language, pageUrl, story, sections };
}
