/**
 * The arithmetic of a timeline seen through a window: where a date falls,
 * how the window zooms and pans, where its graduations go. Pure, so that
 * every part of it is tested without a page.
 *
 * Time is a plain number of years here, astronomical (year 0 is 1 BC) and
 * continuous: the first of July 1789 is about 1789.5. A double holds the
 * Big Bang to the day's precision near year 0 and to the hour at a billion
 * years, which is finer than a pixel at any zoom that reaches that far.
 */

import { MAX_YEAR, MIN_YEAR, TimelineDate } from "./TimelineDate.js";

/**
 * How long a period of each precision lasts, in years: the length a point
 * of that precision stands for, so that `1799` ends where 1800 starts.
 */
export const PRECISION_YEARS = Object.freeze({
  day: 1 / 365.2425,
  month: 1 / 12,
  year: 1,
  decade: 10,
  century: 100,
  millennium: 1000,
  kyr: 1000,
  Myr: 1e6,
  Gyr: 1e9,
});

/** The narrowest window, in years: a few months, where days fall apart. */
export const MIN_SPAN = 0.25;

/** The widest window: the whole of time a {@link TimelineDate} reaches. */
export const MAX_SPAN = MAX_YEAR - MIN_YEAR;

/**
 * @typedef {object} View
 * @property {number} start the value at the left edge, in years
 * @property {number} end the value at the right edge, after `start`
 */

/**
 * @param {TimelineDate} date
 * @returns {number} the date as a number of years, its day a fraction of
 *   its year
 */
export function yearsOf(date) {
  const dayOfYear = date.diff(new TimelineDate(date.year));
  return date.year + dayOfYear / TimelineDate.yearDayCount(date.year);
}

/**
 * The window brought back inside the timeline: its span between
 * {@link MIN_SPAN} and {@link MAX_SPAN}, its edges between the first and the
 * last day of the timeline. A span that is changed keeps its middle.
 *
 * @param {View} view
 * @returns {View} a new window
 */
export function clampView({ start, end }) {
  const span = Math.min(Math.max(end - start, MIN_SPAN), MAX_SPAN);
  let from = (start + end) / 2 - span / 2;
  from = Math.min(Math.max(from, MIN_YEAR), MAX_YEAR - span);
  return { start: from, end: from + span };
}

/**
 * Zooms around a point of the window, which stays where it is on screen:
 * the point under the cursor, or the middle.
 *
 * @param {View} view
 * @param {number} factor above 1 zooms in, below 1 out
 * @param {number} [at] where the fixed point is, from 0 (left edge) to 1
 * @returns {View}
 */
export function zoomView(view, factor, at = 0.5) {
  const span = view.end - view.start;
  const anchor = view.start + at * span;
  const next = Math.min(Math.max(span / factor, MIN_SPAN), MAX_SPAN);
  const start = anchor - at * next;
  // Clamping a window of the right span only moves it, never rescales it.
  return clampView({ start, end: start + next });
}

/**
 * Pans by a share of the window's width.
 *
 * @param {View} view
 * @param {number} share positive moves towards later dates
 * @returns {View}
 */
export function panView(view, share) {
  const shift = share * (view.end - view.start);
  return clampView({ start: view.start + shift, end: view.end + shift });
}

/**
 * The window that keeps the dates under one or two fingers under them as
 * they move: one finger pans, two pan and zoom at once (a pinch).
 *
 * @param {View} view the window when the fingers came down
 * @param {number[]} from where the fingers came down, 0 to 1 across the
 *   width, one or two of them
 * @param {number[]} to where they are now, in the same order
 * @returns {View}
 */
export function dragView(view, from, to) {
  const span = view.end - view.start;
  const yearAt = (share) => view.start + share * span;
  if (from.length < 2 || Math.abs(to[1] - to[0]) < 1e-6) {
    const shift = (from[0] - to[0]) * span;
    return clampView({ start: view.start + shift, end: view.end + shift });
  }
  // The two dates under the fingers land exactly under them again.
  const a = yearAt(from[0]);
  const b = yearAt(from[1]);
  const next = Math.min(
    Math.max((b - a) / (to[1] - to[0]), MIN_SPAN),
    MAX_SPAN,
  );
  const start = a - to[0] * next;
  return clampView({ start, end: start + next });
}

/**
 * @param {View} view
 * @param {number} value in years
 * @param {number} width of the window, in pixels
 * @returns {number} the horizontal position of `value`, in pixels
 */
export function xOf(view, value, width) {
  return ((value - view.start) / (view.end - view.start)) * width;
}

/**
 * @typedef {object} Tick
 * @property {number} value where it stands, in years
 * @property {"month" | "year" | "Myr" | "Gyr"} unit what its label counts
 * @property {number} [year] for `month` and `year`: the year as written,
 *   1 or more, with `bc` saying which side of the era it is on
 * @property {boolean} [bc] for `month` and `year`
 * @property {number} [month] for `month`, 0 to 11
 * @property {number} [count] for `Myr` and `Gyr`: how many millions or
 *   billions of years ago
 */

/** Steps between graduations of months, in months. */
const MONTH_STEPS = [1, 3, 6];

/** From a year upwards, steps run 1, 2, 5, 10, 20, 50… */
const MULTIPLIERS = [1, 2, 5];

/**
 * The step between graduations: the smallest one that leaves at least
 * `spacing` pixels between two of them.
 *
 * @param {number} span of the window, in years
 * @param {number} width in pixels
 * @param {number} spacing in pixels
 * @returns {{ months: number } | { years: number }}
 */
function stepFor(span, width, spacing) {
  const least = (span * spacing) / width;
  for (const months of MONTH_STEPS) {
    if (months / 12 >= least) return { months };
  }
  let power = 1;
  for (;;) {
    for (const multiplier of MULTIPLIERS) {
      if (multiplier * power >= least) return { years: multiplier * power };
    }
    power *= 10;
  }
}

/**
 * The graduations of a window, left to right. Steps of a year or more fall
 * on round years as people write them: `500 BC` and `500`, with no year 0
 * between them. From a million years, they count back in millions or
 * billions of years, which are then rounder than the years themselves.
 *
 * @param {View} view
 * @param {number} width in pixels
 * @param {number} [spacing] the least room between two, in pixels
 * @returns {Tick[]}
 */
export function ticksOf(view, width, spacing = 90) {
  const step = stepFor(view.end - view.start, width, spacing);
  if ("months" in step) return monthTicks(view, step.months);
  if (step.years >= 1e6) return deepTicks(view, step.years);
  return yearTicks(view, step.years);
}

/**
 * @param {View} view
 * @param {number} months
 * @returns {Tick[]}
 */
function monthTicks(view, months) {
  const ticks = [];
  const first = Math.max(Math.floor(view.start), MIN_YEAR);
  for (let year = first; year <= view.end && year < MAX_YEAR; year++) {
    for (let month = 0; month < 12; month += months) {
      const value = yearsOf(new TimelineDate(year, month));
      if (value < view.start || value > view.end) continue;
      ticks.push({ value, unit: "month", month, ...written(year) });
    }
  }
  return ticks;
}

/**
 * @param {View} view
 * @param {number} years
 * @returns {Tick[]}
 */
function yearTicks(view, years) {
  const ticks = [];
  // Before the era, years as written are multiples of the step: 500 BC is
  // the astronomical year -499.
  const lastBc = Math.floor((1 - view.start) / years) * years;
  for (let bc = lastBc; bc >= years; bc -= years) {
    const value = 1 - bc;
    if (value > view.end) break;
    ticks.push({ value, unit: "year", year: bc, bc: true });
  }
  const firstAd = Math.max(Math.ceil(view.start / years) * years, years);
  for (let year = firstAd; year <= view.end; year += years) {
    ticks.push({ value: year, unit: "year", year, bc: false });
  }
  return ticks;
}

/**
 * @param {View} view
 * @param {number} years a million or more
 * @returns {Tick[]}
 */
function deepTicks(view, years) {
  const unit = years >= 1e9 ? "Gyr" : "Myr";
  const size = unit === "Gyr" ? 1e9 : 1e6;
  const ticks = [];
  for (
    let value = Math.ceil(view.start / years) * years;
    value <= view.end;
    value += years
  ) {
    // Past year 0 a count back is meaningless; the year itself is shown.
    ticks.push(
      value <= 0
        ? { value, unit, count: Math.abs(value) / size }
        : { value, unit: "year", year: value, bc: false },
    );
  }
  return ticks;
}

/**
 * @param {number} year astronomical
 * @returns {{ year: number, bc: boolean }} the year as written
 */
function written(year) {
  return year > 0 ? { year, bc: false } : { year: 1 - year, bc: true };
}
