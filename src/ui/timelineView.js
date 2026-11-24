/**
 * A timeline drawn into an element: an axis of graduated time, a mark on it
 * for every event, and a card with a picture for the events the zoom has
 * room for. A card leads to where its event was read — the passage of the
 * page — and its ↗ to the article it is about. The banner of a Wikipedia
 * article draws the page's events with it, a card scrolling the article to
 * its date; the reader's timeline page draws the reader's entries, coloured
 * by layer, a card opening the page each was added from.
 *
 * The wheel zooms around the cursor, a drag or a horizontal scroll pans, a
 * finger pans and two fingers pinch, the keyboard does both once the
 * timeline has the focus, and three buttons zoom in, out, and back to the
 * opening window. Which events earn a card, and where, is decided by
 * `timelineLayout.js`; this file only draws it.
 */

import {
  dragView,
  panView,
  ticksOf,
  xOf,
  zoomView,
} from "../shared/timeScale.js";
import { initialView, placeCards } from "../shared/timelineLayout.js";

/** Card and row sizes, in pixels; the CSS below is written from them. */
const CARD_WIDTH = 176;
const CARD_HEIGHT = 56;
const CARD_GAP = 8;
const LANES = 3;
const LANE_HEIGHT = CARD_HEIGHT + 10;
const AXIS_HEIGHT = 34;
const HEIGHT = LANES * LANE_HEIGHT + 12 + AXIS_HEIGHT;

/** The least room between graduations: `12 000 av. J.-C.` must fit. */
const TICK_SPACING = 110;

/** How far a pointer may move and still click rather than drag. */
const CLICK_SLOP = 4;

/** The zoom a button or a key press applies. */
const ZOOM_STEP = 1.6;

/** The share of the window a key press pans by. */
const PAN_STEP = 0.15;

export const TIMELINE_STYLE = `
  [hidden] { display: none !important; }
  .timeline, .mark, .card {
    --accent: var(--layer, var(--color-progressive, #36c));
  }
  .timeline {
    position: relative;
    height: ${HEIGHT}px;
    margin-top: 0.5em;
    overflow: hidden;
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    background: var(--background-color-base, #fff);
    border: 1px solid var(--border-color-subtle, #c8ccd1);
    border-radius: 2px;
  }
  .timeline:focus-visible {
    outline: 2px solid var(--color-progressive, #36c);
    outline-offset: 1px;
  }
  .timeline.dragging { cursor: grabbing; }
  .axis {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: ${AXIS_HEIGHT}px;
    border-top: 1px solid var(--border-color-base, #a2a9b1);
  }
  .tick {
    position: absolute;
    top: 0;
    height: 100%;
    border-left: 1px solid var(--border-color-subtle, #c8ccd1);
    padding: 12px 0 0 4px;
    font-size: 0.75rem;
    white-space: nowrap;
    color: var(--color-subtle, #54595d);
  }
  .mark {
    position: absolute;
    bottom: ${AXIS_HEIGHT - 3}px;
    width: 5px;
    height: 5px;
    margin-left: -3px;
    border-radius: 50%;
    background: var(--layer, var(--color-subtle, #54595d));
    opacity: 0.5;
  }
  .mark.shown {
    height: 3px;
    margin-left: 0;
    border-radius: 0;
    background: var(--accent);
    opacity: 0.8;
  }
  .card {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    background: var(--background-color-neutral-subtle, #f8f9fa);
    border: 1px solid var(--border-color-subtle, #c8ccd1);
    border-left: 2px solid var(--accent);
    border-radius: 2px;
  }
  .card:hover, .card:focus-within {
    border-color: var(--accent);
    z-index: 1;
  }
  .card::before {
    content: "";
    position: absolute;
    left: -2px;
    top: 100%;
    height: var(--stem);
    border-left: 1px solid var(--accent);
  }
  .card.flipped {
    border-left: 1px solid var(--border-color-subtle, #c8ccd1);
    border-right: 2px solid var(--accent);
  }
  .card.flipped::before {
    left: auto;
    right: -2px;
  }
  .link {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    gap: 6px;
    padding: 4px;
    color: inherit;
    text-decoration: none;
  }
  button.link {
    width: 100%;
    min-width: 0;
    margin: 0;
    text-align: start;
    background: none;
    border: 0;
    border-radius: 0;
  }
  .link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .card.acting .link { padding-right: 26px; }
  .thumb {
    flex: none;
    width: 46px;
    height: 46px;
    object-fit: cover;
    border-radius: 2px;
    background: var(--background-color-interactive, #eaecf0);
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .date {
    font-weight: bold;
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    font-size: 0.8rem;
    color: var(--color-progressive, #36c);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .controls {
    display: flex;
    gap: 4px;
  }
  button {
    font: inherit;
    min-width: 2em;
    padding: 0.1em 0.5em;
    cursor: pointer;
    color: var(--color-base, #202122);
    background: var(--background-color-interactive-subtle, #f8f9fa);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 2px;
  }
  button:hover { background: var(--background-color-interactive, #eaecf0); }
  .action {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    line-height: 1;
    opacity: 0.75;
  }
  .action.open {
    top: auto;
    bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    text-decoration: none;
    /* A link dressed as the buttons beside it. */
    color: var(--color-base, #202122);
    background: var(--background-color-interactive-subtle, #f8f9fa);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 2px;
  }
  .action:hover, .action:focus-visible { opacity: 1; }
  /* A finger needs a bigger target than a cursor. */
  @media (pointer: coarse) {
    .controls button { min-width: 2.5em; min-height: 2.25em; }
    /* Two of them stack in a card's height. */
    .action { width: 26px; height: 26px; }
    .card.acting .link { padding-right: 30px; }
  }
`;

/**
 * @typedef {object} TimelineItem
 * @property {number} start where the event starts, in years
 * @property {number} end where it ends, its last period included
 * @property {number} weight from `weightOf` or `weightOfEntry`
 * @property {string} written the date as written
 * @property {string} title the article or the entry the event is
 * @property {string | null} href where its card leads, null for nowhere or
 *   when the view's `open` handles the click
 * @property {string | null} [article] where its ↗ leads: the article the
 *   event is about, when the card leads elsewhere
 * @property {string} description what a hovered card says
 * @property {() => Promise<string | null>} picture asked for the card's
 *   picture the first time the card is drawn, so that only the cards a
 *   reader sees ask for theirs
 * @property {string} [color] its layer's colour; the theme's accent if none
 */

/**
 * @typedef {object} CardAction
 * @property {string} text the button's face: a sign, `+`, `✎`
 * @property {string} label what it does, for its tooltip and screen readers
 * @property {(index: number) => void} run given the index of the card's item
 */

/**
 * A timeline of events, drawn into an element it owns.
 */
export class TimelineView {
  /**
   * @param {TimelineItem[]} items the events
   * @param {object} [options]
   * @param {CardAction} [options.action] a button on every card
   * @param {(index: number) => void} [options.open] what a click on a card
   *   does, given the index of its item, in place of following its `href`
   */
  constructor(items, { action, open } = {}) {
    /** The events, set by the owner: once, or again by `setItems`. */
    this.items = items;
    /** The button on every card, set by the owner. */
    this.action = action ?? null;
    /** What a click on a card does, set by the owner; null to follow it. */
    this.open = open ?? null;
    /** The window on time, set by the reader's zooms and pans. */
    this.view = initialView(items);

    /** The element drawn into, to measure and to listen on. */
    this.element = document.createElement("div");
    this.element.className = "timeline";
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "group");
    this.element.setAttribute(
      "aria-label",
      chrome.i18n.getMessage("timelineLabel"),
    );
    /** The graduations' layer, redrawn on every change. */
    this.axis = document.createElement("div");
    this.axis.className = "axis";
    /** One mark per event, made with the items and moved. */
    this.marks = [];
    /** Each card made so far, by event index: made when first placed. */
    this.cards = new Map();
    this.element.append(this.axis);
    this.makeMarks();

    /** The pending redraw, so that many changes in a frame draw once. */
    this.frame = 0;
    /** Where each pointer down on the timeline is now, by pointer id. */
    this.pointers = new Map();
    /** The gesture under way: the window and the pointers when it began. */
    this.gesture = null;

    this.listen();
    new ResizeObserver(() => this.render()).observe(this.element);
  }

  /**
   * Draws other events in the same window: a layer shown or hidden, an
   * entry edited. The window opens on them only if there were none before.
   *
   * @param {TimelineItem[]} items
   */
  setItems(items) {
    const wasEmpty = !this.items.length;
    this.items = items;
    for (const card of this.cards.values()) card.remove();
    this.cards.clear();
    for (const mark of this.marks) mark.remove();
    this.makeMarks();
    this.setView(wasEmpty ? initialView(items) : this.view);
  }

  /** One mark per item, coloured by its layer. */
  makeMarks() {
    this.marks = this.items.map((item) => {
      const mark = document.createElement("div");
      mark.className = "mark";
      if (item.color) mark.style.setProperty("--layer", item.color);
      return mark;
    });
    this.axis.before(...this.marks);
  }

  /**
   * The zoom in, zoom out and fit buttons, to put beside the title.
   *
   * @returns {HTMLElement}
   */
  controls() {
    const box = document.createElement("div");
    box.className = "controls";
    const buttons = [
      [chrome.i18n.getMessage("zoomOut"), "−", () => this.zoom(1 / ZOOM_STEP)],
      [chrome.i18n.getMessage("zoomIn"), "+", () => this.zoom(ZOOM_STEP)],
      [chrome.i18n.getMessage("zoomFit"), "⤢", () => this.fit()],
    ];
    for (const [label, text, action] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", action);
      box.append(button);
    }
    return box;
  }

  /**
   * @param {number} factor above 1 zooms in
   * @param {number} [at] the point that stays put, 0 to 1 across the width
   */
  zoom(factor, at) {
    this.setView(zoomView(this.view, factor, at));
  }

  /** Back to the window that holds the events. */
  fit() {
    this.setView(initialView(this.items));
  }

  /**
   * @param {import("../shared/timeScale.js").View} view
   */
  setView(view) {
    this.view = view;
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
  }

  /** Wheel, mouse and fingers, and keys. */
  listen() {
    const element = this.element;
    element.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        // A line is about 16 pixels; a page, the timeline's width.
        const scale = [1, 16, element.clientWidth][event.deltaMode];
        const dx = event.deltaX * scale;
        const dy = event.deltaY * scale;
        const width = element.clientWidth || 1;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.setView(panView(this.view, dx / width));
        } else {
          const at =
            (event.clientX - element.getBoundingClientRect().left) / width;
          this.zoom(Math.exp(-dy * 0.002), at);
        }
      },
      { passive: false },
    );

    // One finger or the mouse pans; two fingers pinch. Every pointer that
    // comes or goes starts the gesture again from where they all are.
    const restart = () => {
      const ids = [...this.pointers.keys()].slice(0, 2);
      this.gesture = ids.length
        ? {
            view: this.view,
            ids,
            from: ids.map((id) => this.pointers.get(id)),
            moved: this.gesture?.moved ?? false,
          }
        : null;
    };
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.pointers.set(event.pointerId, event.clientX);
      restart();
    });
    window.addEventListener("pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, event.clientX);
      const gesture = this.gesture;
      const to = gesture.ids.map((id) => this.pointers.get(id));
      if (to.some((x, i) => Math.abs(x - gesture.from[i]) > CLICK_SLOP)) {
        gesture.moved = true;
      }
      if (!gesture.moved) return;
      element.classList.add("dragging");
      const left = element.getBoundingClientRect().left;
      const width = element.clientWidth || 1;
      const share = (x) => (x - left) / width;
      this.setView(
        dragView(gesture.view, gesture.from.map(share), to.map(share)),
      );
    });
    const release = (event) => {
      if (!this.pointers.delete(event.pointerId)) return;
      const moved = this.gesture?.moved;
      restart();
      if (this.pointers.size) return;
      element.classList.remove("dragging");
      // The click that ends a drag must not reach a card. It comes in the
      // same task as the pointerup, if at all: a later one is the reader's.
      if (moved && event.type === "pointerup") {
        const swallow = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
        element.addEventListener("click", swallow, { capture: true });
        setTimeout(() =>
          element.removeEventListener("click", swallow, { capture: true }),
        );
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    element.addEventListener("keydown", (event) => {
      if (event.target !== element) return;
      const action = {
        ArrowLeft: () => this.setView(panView(this.view, -PAN_STEP)),
        ArrowRight: () => this.setView(panView(this.view, PAN_STEP)),
        "+": () => this.zoom(ZOOM_STEP),
        "=": () => this.zoom(ZOOM_STEP),
        "-": () => this.zoom(1 / ZOOM_STEP),
        0: () => this.fit(),
      }[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    });
  }

  /** Draws the graduations, the marks and the cards for the current window. */
  render() {
    const width = this.element.clientWidth;
    if (!width) return;
    this.axis.replaceChildren(
      ...ticksOf(this.view, width, TICK_SPACING).map((tick) => {
        const element = document.createElement("div");
        element.className = "tick";
        element.style.left = `${xOf(this.view, tick.value, width)}px`;
        element.textContent = tickLabel(tick);
        return element;
      }),
    );

    const placed = placeCards(this.items, this.view, {
      width,
      cardWidth: CARD_WIDTH,
      gap: CARD_GAP,
      lanes: LANES,
    });
    const shown = new Map(placed.map(({ index, lane }) => [index, lane]));

    // A dot for every event; for an event with a card, the bar of its
    // period, one track per row so that the bars of a row do not overlap.
    this.items.forEach((item, index) => {
      const mark = this.marks[index];
      const lane = shown.get(index);
      // Off-screen marks are parked just outside rather than at huge offsets.
      const from = Math.min(
        Math.max(xOf(this.view, item.start, width), -10),
        width + 10,
      );
      mark.classList.toggle("shown", lane !== undefined);
      mark.style.left = `${from}px`;
      if (lane === undefined) {
        mark.style.width = mark.style.bottom = "";
        return;
      }
      const to = Math.min(xOf(this.view, item.end, width), width + 10);
      mark.style.width = `${Math.max(to - from, 2)}px`;
      mark.style.bottom = `${AXIS_HEIGHT + 2 + lane * 4}px`;
    });

    for (const [index, card] of this.cards) {
      if (!shown.has(index)) card.hidden = true;
    }
    for (const { index, x, left, lane } of placed) {
      const card = this.cardOf(index);
      const top = (LANES - 1 - lane) * LANE_HEIGHT + 6;
      card.hidden = false;
      card.classList.toggle("flipped", left !== x);
      card.style.transform = `translate(${left}px, ${top}px)`;
      card.style.setProperty(
        "--stem",
        `${HEIGHT - AXIS_HEIGHT - top - CARD_HEIGHT}px`,
      );
    }
  }

  /**
   * The card of an event, made the first time it is placed; its picture is
   * asked for then, so a page asks only for the cards a reader sees.
   *
   * @param {number} index
   * @returns {HTMLElement}
   */
  cardOf(index) {
    if (this.cards.has(index)) return this.cards.get(index);
    const item = this.items[index];
    const card = document.createElement("div");
    card.className = "card";
    if (item.color) card.style.setProperty("--layer", item.color);

    // A card that leads nowhere is read the same way, without a link.
    const tag = this.open ? "button" : item.href ? "a" : "div";
    const link = document.createElement(tag);
    link.className = "link";
    if (this.open) {
      link.type = "button";
      link.addEventListener("click", () => this.open(index));
    } else if (item.href) {
      link.href = item.href;
    }
    link.title = item.description;
    link.draggable = false;

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.alt = "";
    thumb.draggable = false;
    thumb.hidden = true;
    // Until a picture loads, an empty square keeps the card's shape.
    const placeholder = document.createElement("span");
    placeholder.className = "thumb";
    thumb.addEventListener("load", () => {
      thumb.hidden = false;
      placeholder.remove();
    });
    item.picture().then((source) => {
      if (source) thumb.src = source;
    });

    const text = document.createElement("span");
    text.className = "text";
    const date = document.createElement("span");
    date.className = "date";
    date.textContent = item.written;
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title;
    text.append(date, title);

    link.append(placeholder, thumb, text);
    card.append(link);

    if (this.action) {
      const { text: face, label, run } = this.action;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action";
      button.textContent = face;
      button.title = label;
      button.setAttribute("aria-label", `${label} — ${item.title}`);
      button.addEventListener("click", () => run(index));
      card.classList.add("acting");
      card.append(button);
    }
    if (item.article) {
      const label = chrome.i18n.getMessage("openArticle");
      const open = document.createElement("a");
      open.className = "action open";
      open.href = item.article;
      open.textContent = "↗";
      open.title = label;
      open.draggable = false;
      open.setAttribute("aria-label", `${label} — ${item.title}`);
      card.classList.add("acting");
      card.append(open);
    }

    this.cards.set(index, card);
    this.element.append(card);
    return card;
  }
}

/** The reader's language, for numbers and month names. */
const LOCALE = chrome.i18n.getUILanguage();

const NUMBER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

const MONTH = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  timeZone: "UTC",
});

/**
 * @param {number} year
 * @returns {string} grouped only past four digits: `1789`, `12 000`
 */
function yearNumber(year) {
  return year >= 10000 ? NUMBER.format(year) : String(year);
}

/**
 * @param {import("../shared/timeScale.js").Tick} tick
 * @returns {string} the year as written, its era when before it
 */
function yearText(tick) {
  const year = yearNumber(tick.year);
  return tick.bc ? chrome.i18n.getMessage("yearBc", [year]) : year;
}

/** How each kind of graduation is labelled, in the reader's language. */
const TICK_LABELS = {
  month: (tick) =>
    chrome.i18n.getMessage("tickMonth", [
      MONTH.format(Date.UTC(2001, tick.month, 15)),
      yearText(tick),
    ]),
  year: yearText,
  Myr: (tick) => chrome.i18n.getMessage("tickMyr", [NUMBER.format(tick.count)]),
  Gyr: (tick) => chrome.i18n.getMessage("tickGyr", [NUMBER.format(tick.count)]),
};

/**
 * @param {import("../shared/timeScale.js").Tick} tick
 * @returns {string}
 */
function tickLabel(tick) {
  return TICK_LABELS[tick.unit](tick);
}
