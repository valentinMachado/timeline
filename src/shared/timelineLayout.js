/**
 * What a timeline shows at a given zoom: which events earn a card, where,
 * and the window it opens on. Pure: the content script draws what this
 * decides.
 *
 * The timeline cannot show every event of a long article at once. Each event
 * has a weight worked out from its own fields; at every zoom the heaviest are
 * placed first, and an event whose card finds no room is left as a mark on
 * the axis. Zooming in makes room, so lighter events appear.
 */

import {
  MIN_SPAN,
  PRECISION_YEARS,
  clampView,
  yearsOf,
  xOf,
} from "./timeScale.js";

/**
 * What raises or lowers an event's weight, with how much. A table rather than
 * scattered conditions, so the reasons sit side by side.
 *
 * - The lead sums the article up: its dates are the article's own.
 * - An event with a link of its own leads somewhere new, with a picture.
 * - A range is a period the article is about, more than a passing date.
 * - A century or coarser is the backdrop of the story, not an event of it.
 * - An approximate date is a weaker claim.
 */
const WEIGHTS = [
  { points: 4, applies: (event) => event.section === null },
  { points: 2, applies: (event, pageUrl) => hasOwnLink(event, pageUrl) },
  { points: 1, applies: (event) => event.end !== null },
  { points: -1, applies: (event) => isCoarse(event.start.precision) },
  { points: -1, applies: (event) => event.approximate },
];

/** Precisions that set a backdrop rather than date an event. */
const COARSE = new Set(["century", "millennium", "kyr", "Myr", "Gyr"]);

/**
 * @param {string} precision
 * @returns {boolean}
 */
function isCoarse(precision) {
  return COARSE.has(precision);
}

/**
 * Whether an event leads to another article than the page it was read on,
 * rather than back to a section of that page.
 *
 * @param {import("./dateExtraction.js").TimelineEvent} event
 * @param {string} pageUrl the page, without a fragment
 * @returns {boolean}
 */
export function hasOwnLink(event, pageUrl) {
  return event.link !== pageUrl && !event.link.startsWith(`${pageUrl}#`);
}

/**
 * How much an event matters to the page it was read on: the heavier, the
 * sooner it gets a card when the timeline is zoomed out.
 *
 * @param {import("./dateExtraction.js").TimelineEvent} event
 * @param {string} pageUrl the page, without a fragment
 * @returns {number} a small integer, comparable between events of a page
 */
export function weightOf(event, pageUrl) {
  return WEIGHTS.reduce(
    (sum, { points, applies }) =>
      applies(event, pageUrl) ? sum + points : sum,
    0,
  );
}

/**
 * @param {import("./dateExtraction.js").TimelineEvent} event
 * @returns {{ start: number, end: number }} the years the event covers,
 *   its last period included: `1789–1799` ends where 1800 starts
 */
export function spanOf(event) {
  const last = event.end ?? event.start;
  return {
    start: yearsOf(event.start.date),
    end: yearsOf(last.date) + PRECISION_YEARS[last.precision],
  };
}

/** The share of events a first window may leave out at each end. */
const OUTLIERS = 0.1;

/**
 * The window a timeline opens on: around most of the page's events, so that
 * one remote date (a geological era in a history article, a founding
 * centuries back) does not squeeze the others into a line.
 *
 * @param {{ start: number }[]} spans the events' spans
 * @returns {import("./timeScale.js").View}
 */
export function initialView(spans) {
  if (!spans.length) return clampView({ start: 1900, end: 2100 });
  const starts = spans.map(({ start }) => start).sort((a, b) => a - b);
  const cut = spans.length >= 10 ? Math.floor(starts.length * OUTLIERS) : 0;
  const first = starts[cut];
  const last = starts[starts.length - 1 - cut];
  const margin = Math.max((last - first) * 0.1, MIN_SPAN);
  return clampView({ start: first - margin, end: last + margin });
}

/**
 * @typedef {object} Placed
 * @property {number} index the event's index in the list given
 * @property {number} x where its event starts, in pixels
 * @property {number} left where its card starts, in pixels: at `x`, or
 *   ending at `x` when the card would run past the right edge
 * @property {number} lane its row, 0 for the one nearest the axis
 */

/**
 * Places a card for as many events as the window has room for, heaviest
 * first; between events of equal weight, the one the page tells first. A card
 * starts at its event's date, or ends there when it would otherwise run out
 * of the window, and goes in the first row where it overlaps no other card.
 *
 * @param {{ start: number, weight: number }[]} items the events, in the
 *   order of the page
 * @param {import("./timeScale.js").View} view
 * @param {object} size
 * @param {number} size.width of the window, in pixels
 * @param {number} size.cardWidth in pixels
 * @param {number} size.gap least room between two cards of a row, in pixels
 * @param {number} size.lanes how many rows of cards there are
 * @returns {Placed[]} by position, left to right
 */
export function placeCards(items, view, { width, cardWidth, gap, lanes }) {
  const order = items
    .map((item, index) => ({ index, x: xOf(view, item.start, width) }))
    .filter(({ x }) => x + cardWidth > 0 && x < width)
    .sort(
      (a, b) =>
        items[b.index].weight - items[a.index].weight || a.index - b.index,
    );
  const rows = Array.from({ length: lanes }, () => []);
  const placed = [];
  for (const { index, x } of order) {
    const left = x + cardWidth > width ? x - cardWidth : x;
    const lane = rows.findIndex((row) =>
      row.every(
        (other) =>
          left + cardWidth + gap <= other || left >= other + cardWidth + gap,
      ),
    );
    if (lane === -1) continue;
    rows[lane].push(left);
    placed.push({ index, x, left, lane });
  }
  return placed.sort((a, b) => a.x - b.x || a.lane - b.lane);
}
