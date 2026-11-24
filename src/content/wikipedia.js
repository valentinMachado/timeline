/**
 * Content script for Wikipedia articles: reads the dates of the article and
 * injects, above the article's text, a banner that draws them as a timeline
 * (`timelineView.js`). A card scrolls the article to its date, highlighted;
 * its ↗ opens the article it is about, and its + adds its event to the
 * reader's own timeline, and selecting text in the article shows a
 * « + My timeline » button that adds the date selected, read leniently, or
 * opens the form to type one the extraction missed.
 *
 * The banner lives in a shadow root so that Wikipedia's styles do not reach
 * it and its own do not leak into the page. Its colours are Wikipedia's own
 * design tokens, which inherit through the shadow boundary, so it follows the
 * reader's light or dark theme in every skin that defines them.
 */

import { OPEN_MY_TIMELINE } from "../manifest.js";
import { LANGUAGES, extractEvents } from "../shared/dateExtraction.js";
import { datePartOf } from "../shared/myTimeline.js";
import { hasOwnLink, spanOf, weightOf } from "../shared/timelineLayout.js";
import {
  articleTitle,
  isArticleView,
  isBackMatter,
  pageLanguage,
  summaryUrl,
} from "../shared/wikipediaPage.js";
import { FORM_STYLE, openEntryForm } from "../ui/entryForm.js";
import { pictureOf } from "../ui/pictures.js";
import { TIMELINE_STYLE, TimelineView } from "../ui/timelineView.js";

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

/**
 * The layer above the page the extension draws in outside the banner: the
 * button beside a selection, the form's dialog, the note that an event was
 * added.
 */
const OVERLAY_STYLE = `
  :host {
    all: initial;
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 100;
  }
  [hidden] { display: none !important; }
  .add-selection, .toast {
    position: absolute;
    font-family: sans-serif;
    font-size: 0.875rem;
    white-space: nowrap;
    border-radius: 2px;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  }
  .add-selection {
    padding: 0.4em 0.8em;
    cursor: pointer;
    color: #fff;
    background: var(--color-progressive, #36c);
    border: 0;
  }
  .toast {
    position: fixed;
    left: 50vw;
    bottom: 1.5em;
    transform: translateX(-50%);
    padding: 0.6em 1em;
    color: var(--color-inverted, #fff);
    background: var(--color-base, #202122);
  }
  @media (pointer: coarse) {
    .add-selection { padding: 0.7em 1.1em; }
  }
  ${FORM_STYLE}
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

/** How long the note that an event was added stays, in milliseconds. */
const TOAST_DURATION = 2500;

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
function readBlock(element) {
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
 * @returns {import("../ui/timelineView.js").TimelineItem[]}
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
 * @returns {import("../ui/entryForm.js").Draft}
 */
function draftOf(event, sections, pageUrl) {
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
 * Builds the banner's host element, its shadow root filled: a heading, how
 * many dates were read, a button to the reader's timeline and, when there
 * are dates, the timeline, each card with a + that adds its event.
 *
 * @param {import("../ui/timelineView.js").TimelineItem[]} items
 * @param {object} handlers each called with the index of an item
 * @param {(index: number) => void} handlers.onOpen its card was clicked
 * @param {(index: number) => void} handlers.onAdd its + was pressed
 * @returns {{ host: HTMLElement, timeline: TimelineView | null }} the
 *   timeline null when no date was read
 */
function createBanner(items, { onOpen, onAdd }) {
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
  const mine = document.createElement("button");
  mine.type = "button";
  mine.textContent = chrome.i18n.getMessage("myTimelineTitle");
  mine.title = chrome.i18n.getMessage("myTimelineOpen");
  mine.addEventListener("click", () =>
    chrome.runtime.sendMessage(OPEN_MY_TIMELINE),
  );
  header.append(title, summary);
  section.append(header);
  let timeline = null;
  if (items.length) {
    timeline = new TimelineView(items, {
      action: {
        text: "+",
        label: chrome.i18n.getMessage("addToMyTimeline"),
        run: onAdd,
      },
      open: onOpen,
    });
    header.append(timeline.controls());
    section.append(timeline.element);
  }
  header.append(mine);

  root.append(style, section);
  return { host, timeline };
}

/**
 * @typedef {object} Overlay
 * @property {ShadowRoot} root where the form's dialog is put
 * @property {HTMLButtonElement} button the button shown below a selection
 * @property {HTMLElement} toast the note that an event was added
 */

/**
 * Builds the layer the extension draws in above the page, outside the
 * banner, and puts it at the end of the body.
 *
 * @returns {Overlay}
 */
function createOverlay() {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_STYLE;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-selection";
  button.textContent = chrome.i18n.getMessage("addSelection");
  button.hidden = true;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  root.append(style, button, toast);
  document.body.append(host);
  return { root, button, toast };
}

/**
 * @typedef {object} Page
 * @property {string} language
 * @property {string} pageUrl the page, without a fragment
 * @property {Element} story the article's text
 * @property {Map<string | null, Section>} sections
 */

/**
 * Opens the form on a draft and, once the reader saves, says where the
 * event went.
 *
 * @param {Overlay} overlay
 * @param {Page} page
 * @param {import("../ui/entryForm.js").Draft} draft
 */
async function addToMyTimeline(overlay, page, draft) {
  const saved = await openEntryForm(overlay.root, {
    draft,
    isNew: true,
    languages: [page.language, chrome.i18n.getUILanguage().slice(0, 2)],
  });
  if (!saved) return;
  const { toast } = overlay;
  toast.textContent = chrome.i18n.getMessage("savedTo", [saved.layer.name]);
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION);
}

/**
 * The anchor of the section a node of the article is in: that of the last
 * heading before it, null in the lead.
 *
 * @param {Node} node
 * @param {Element} story
 * @returns {string | null}
 */
function sectionAt(node, story) {
  let section = null;
  for (const heading of story.querySelectorAll("h2, h3, h4, h5, h6")) {
    const after = heading.compareDocumentPosition(node);
    if (!(after & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    section = anchorOf(heading);
  }
  return section;
}

/**
 * The form's first draft of a selection: the date in it, read leniently
 * since the reader pointed at it; failing one, everything but the date,
 * the selection kept as the description, for the reader to type the date.
 *
 * @param {Range} range
 * @param {Page} page
 * @returns {import("../ui/entryForm.js").Draft}
 */
function draftOfSelection(range, { language, pageUrl, story, sections }) {
  const section = sectionAt(range.startContainer, story);
  const block = { ...readBlock(range.cloneContents()), section };
  const [event] = extractEvents(block, {
    language,
    pageUrl,
    now: new Date().getFullYear(),
    lenient: true,
  });
  if (event) return draftOf(event, sections, pageUrl);
  const lead = sections.get(null);
  const current = sections.get(section) ?? lead;
  const image = current.image ?? lead.image;
  return {
    title: current.title,
    link: section ? `${pageUrl}#${section}` : pageUrl,
    description: { text: block.text, links: block.links },
    image: image ? { url: image } : null,
    tags: [current.title],
    source: { url: pageUrl, title: lead.title },
  };
}

/** How far below a selection its button goes: below a finger's handles. */
const BUTTON_OFFSET = { fine: 8, coarse: 36 };

/**
 * Shows the add button below the text the reader selects in the article,
 * and opens the form on it when pressed.
 *
 * @param {Overlay} overlay
 * @param {Page} page
 */
function watchSelection(overlay, page) {
  const { button } = overlay;
  let range = null;
  const update = () => {
    const selection = document.getSelection();
    const current =
      selection.rangeCount && !selection.isCollapsed
        ? selection.getRangeAt(0)
        : null;
    if (
      !current ||
      !page.story.contains(current.commonAncestorContainer) ||
      !selection.toString().trim()
    ) {
      button.hidden = true;
      return;
    }
    range = current.cloneRange();
    const rects = current.getClientRects();
    const last = rects[rects.length - 1] ?? current.getBoundingClientRect();
    const offset = matchMedia("(pointer: coarse)").matches
      ? BUTTON_OFFSET.coarse
      : BUTTON_OFFSET.fine;
    button.hidden = false;
    const left = Math.max(
      8,
      Math.min(last.left, innerWidth - button.offsetWidth - 8),
    );
    button.style.left = `${left + scrollX}px`;
    button.style.top = `${last.bottom + scrollY + offset}px`;
  };
  let timer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    // A selection being dragged changes many times a second.
    timer = setTimeout(update, 200);
  });
  // Pressing the button must not clear the selection it is about.
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    button.hidden = true;
    if (range) addToMyTimeline(overlay, page, draftOfSelection(range, page));
  });
}

/**
 * Reads the article's dates and injects the banner above its text, once, on
 * articles of a Wikipedia whose language the extension reads; then lets the
 * reader add an event, or a selected date, to their own timeline.
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
  const read = blocks.flatMap(({ pieces, ...block }) =>
    extractEvents(block, options).map((event) => ({ event, pieces })),
  );
  const events = read.map(({ event }) => event);
  const page = { language, pageUrl, story, sections };
  const overlay = createOverlay();
  const style = document.createElement("style");
  style.textContent = PAGE_STYLE;
  document.head.append(style);
  const ranges = read.map(({ event, pieces }) =>
    rangeOf(pieces, event.mention),
  );
  const banner = createBanner(itemsOf(events, sections, pageUrl), {
    onOpen: (index) => showInText(ranges[index]),
    onAdd: (index) =>
      addToMyTimeline(overlay, page, draftOf(events[index], sections, pageUrl)),
  });
  content.before(banner.host);
  watchSelection(overlay, page);
  watchDates(ranges, (index) => {
    banner.timeline?.reveal(index);
    // Centred, clear of the skins' sticky header.
    banner.host.scrollIntoView({
      block: "center",
      behavior: stillMotion() ? "auto" : "smooth",
    });
  });
}

injectBanner();
