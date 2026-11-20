import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_YEAR,
  MIN_YEAR,
  TimelineDate,
} from "../../src/shared/TimelineDate.js";

const DAY_MS = 86400000;

/**
 * Days since 1970-01-01 by `Date`, the oracle on its own range (±273,790
 * years). `setUTCFullYear` keeps years 0 to 99 literal, where `Date.UTC`
 * would read them as 1900 to 1999.
 *
 * @param {TimelineDate} date
 * @returns {number}
 */
function epochDay(date) {
  const js = new Date(0);
  js.setUTCFullYear(date.year, date.month, date.day);
  return js.getTime() / DAY_MS;
}

/**
 * A seeded generator, so a failure replays the same dates.
 *
 * @param {number} seed
 * @returns {() => number} a float in [0, 1)
 */
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * @param {() => number} next
 * @param {number} minYear
 * @param {number} maxYear
 * @returns {TimelineDate}
 */
function randomDate(next, minYear, maxYear) {
  const year = minYear + Math.floor(next() * (maxYear - minYear));
  const month = Math.floor(next() * 12);
  const day = 1 + Math.floor(next() * TimelineDate.monthDayCount(year, month));
  return new TimelineDate(year, month, day);
}

describe("TimelineDate", () => {
  it("refuses a date outside the timeline or the calendar", () => {
    assert.throws(() => new TimelineDate(MAX_YEAR + 1), RangeError);
    assert.throws(() => new TimelineDate(MIN_YEAR - 1), RangeError);
    assert.throws(() => new TimelineDate(2023, 1, 29), RangeError);
    assert.throws(() => new TimelineDate(2023, 12, 1), RangeError);
    assert.throws(() => new TimelineDate(2023.5), RangeError);
    assert.doesNotThrow(() => new TimelineDate(2024, 1, 29));
  });

  it("follows the Gregorian leap rule, year 0 included", () => {
    assert.equal(TimelineDate.yearIsLeap(2000), true);
    assert.equal(TimelineDate.yearIsLeap(1900), false);
    assert.equal(TimelineDate.yearIsLeap(2024), true);
    assert.equal(TimelineDate.yearIsLeap(0), true);
    assert.equal(TimelineDate.yearIsLeap(-4), true);
    assert.equal(TimelineDate.yearIsLeap(-100), false);
  });

  it("orders dates", () => {
    const a = new TimelineDate(-500, 6, 14);
    const b = new TimelineDate(-500, 6, 15);
    assert.equal(a.isBefore(b), true);
    assert.equal(b.isAfter(a), true);
    assert.equal(a.isAfter(a.clone()), false);
    assert.equal(a.isBefore(a.clone()), false);
    assert.equal(TimelineDate.min(a, b), a);
    assert.equal(TimelineDate.max(a, b), b);
  });

  it("counts days between two dates as Date does", () => {
    const next = random(1);
    for (let i = 0; i < 2000; i++) {
      const a = randomDate(next, -200000, 200000);
      const b = randomDate(next, -200000, 200000);
      const expected = Math.abs(epochDay(a) - epochDay(b));
      assert.equal(a.diff(b), expected, `${a} → ${b}`);
      assert.equal(b.diff(a), expected, `${b} → ${a}`);
    }
  });

  it("adds days as Date does", () => {
    const next = random(2);
    for (let i = 0; i < 2000; i++) {
      const start = randomDate(next, -150000, 150000);
      const count = Math.floor(next() * 40000000);
      const end = start.clone().add(count);
      assert.equal(
        epochDay(end) - epochDay(start),
        count,
        `${start} + ${count}`,
      );
    }
  });

  it("adds and counts back the same days from the Big Bang", () => {
    const bigBang = new TimelineDate(-13800000000, 5, 23);
    const counts = [
      1, 5, 10, 12, 15, 30, 31, 32, 56, 58, 85, 151, 184, 364, 365, 366, 367,
      845, 5485, 12515, 11151818, 18181812, 15138461843,
    ];
    for (const count of counts) {
      assert.equal(bigBang.clone().add(count).diff(bigBang), count);
    }
  });

  it("steps back a day across a year boundary", () => {
    assert.equal(new TimelineDate(0, 0, 1).subDay().toString(), "-1-12-31");
    assert.equal(
      new TimelineDate(2024, 2, 1).subDay().toString(),
      "2024-02-29",
    );
  });

  it("steps to the next month and years, capped at the end", () => {
    assert.equal(
      new TimelineDate(1999, 11, 31).toNextMonth().toString(),
      "2000-01-01",
    );
    assert.equal(new TimelineDate(1999, 4, 3).dayCountToNextYears(1), 243);
    assert.ok(
      new TimelineDate(MAX_YEAR - 1)
        .toNextYears(10)
        .equals(TimelineDate.MAX_TIMELINE_DATE),
    );
  });

  it("clamps into a range", () => {
    const min = new TimelineDate(1000);
    const max = new TimelineDate(2000);
    assert.equal(new TimelineDate(500).clamp(min, max).year, 1000);
    assert.equal(new TimelineDate(2500).clamp(min, max).year, 2000);
    assert.equal(new TimelineDate(1500).clamp(min, max).year, 1500);
  });

  it("refuses to add a negative count", () => {
    assert.throws(() => new TimelineDate(2000).add(-1), RangeError);
  });
});
