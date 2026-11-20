/**
 * Content script for Wikipedia articles: injects the banner the timeline will
 * be drawn in, above the article's text. It is empty until dates are read
 * from the page.
 *
 * The banner lives in a shadow root so that Wikipedia's styles do not reach
 * it and its own do not leak into the page. Its colours are Wikipedia's own
 * design tokens, which inherit through the shadow boundary, so it follows the
 * reader's light or dark theme in every skin that defines them.
 */

import { isArticleView } from "../shared/wikipediaPage.js";

/** The id of the banner's host element, to never inject it twice. */
const HOST_ID = "timeline-extension-banner";

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
 * Builds the banner's host element, its shadow root filled.
 *
 * @returns {HTMLElement}
 */
function createBanner() {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const section = document.createElement("section");
  section.setAttribute("aria-label", chrome.i18n.getMessage("bannerTitle"));
  const title = document.createElement("h2");
  title.textContent = chrome.i18n.getMessage("bannerTitle");
  const empty = document.createElement("p");
  empty.textContent = chrome.i18n.getMessage("bannerEmpty");
  section.append(title, empty);

  root.append(style, section);
  return host;
}

/** Injects the banner above the article's text, once, on articles only. */
function injectBanner() {
  if (!isArticleView(document.body.className)) return;
  if (document.getElementById(HOST_ID)) return;
  // #mw-content-text holds the article's text in every skin.
  const content = document.getElementById("mw-content-text");
  if (!content) return;
  content.before(createBanner());
}

injectBanner();
