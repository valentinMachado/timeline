/**
 * Content script for Wikipedia articles: on an article of a Wikipedia whose
 * language the extension reads, puts the timeline of its dates above its
 * text (`articleTimeline.js`), with a button to the reader's own timeline
 * and, on every card, a + that adds its event to it; and selecting text in
 * the article shows a « + My timeline » button that adds the date selected,
 * read leniently, or opens the form to type one the extraction missed.
 */

import { message, uiLanguage } from "#i18n";
import { OPEN_MY_TIMELINE } from "../manifest.js";
import { LANGUAGES, extractEvents } from "../shared/dateExtraction.js";
import {
  articleTitle,
  isArticleView,
  pageLanguage,
} from "../shared/wikipediaPage.js";
import {
  HOST_ID,
  draftOf,
  readBlock,
  sectionAt,
  showArticleTimeline,
} from "../ui/articleTimeline.js";
import { FORM_STYLE, openEntryForm } from "../ui/entryForm.js";

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

/** How long the note that an event was added stays, in milliseconds. */
const TOAST_DURATION = 2500;

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
  button.textContent = message("addSelection");
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
 * Opens the form on a draft and, once the reader saves, says where the
 * event went.
 *
 * @param {Overlay} overlay
 * @param {import("../ui/articleTimeline.js").Page} page
 * @param {import("../ui/entryForm.js").Draft} draft
 */
async function addToMyTimeline(overlay, page, draft) {
  const saved = await openEntryForm(overlay.root, {
    draft,
    isNew: true,
    languages: [page.language, uiLanguage().slice(0, 2)],
  });
  if (!saved) return;
  const { toast } = overlay;
  toast.textContent = message("savedTo", [saved.layer.name]);
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION);
}

/**
 * The form's first draft of a selection: the date in it, read leniently
 * since the reader pointed at it; failing one, everything but the date,
 * the selection kept as the description, for the reader to type the date.
 *
 * @param {Range} range
 * @param {import("../ui/articleTimeline.js").Page} page
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
 * @param {import("../ui/articleTimeline.js").Page} page
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
 * @returns {HTMLButtonElement} the banner's button that opens the reader's
 *   timeline, an extension page only the background script may open
 */
function myTimelineButton() {
  const mine = document.createElement("button");
  mine.type = "button";
  mine.textContent = message("myTimelineTitle");
  mine.title = message("myTimelineOpen");
  mine.addEventListener("click", () =>
    chrome.runtime.sendMessage(OPEN_MY_TIMELINE),
  );
  return mine;
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
  const overlay = createOverlay();
  const page = showArticleTimeline(content, {
    language,
    pageUrl,
    title: articleTitle(pageUrl) ?? document.title,
    buttons: [myTimelineButton()],
    onAdd: (draft) => addToMyTimeline(overlay, page, draft),
  });
  watchSelection(overlay, page);
}

injectBanner();
