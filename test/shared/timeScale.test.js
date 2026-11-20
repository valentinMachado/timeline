import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_YEAR,
  MIN_YEAR,
  TimelineDate,
} from "../../src/shared/TimelineDate.js";
import { PRECISIONS } from "../../src/shared/dateExtraction.js";
import {
  MAX_SPAN,
  PRECISION_YEARS,
  MIN_SPAN,
  clampView,
  dragView,
  panView,
  ticksOf,
  xOf,
  yearsOf,
  zoomView,
} from "../../src/shared/timeScale.js";

/** A seeded generator, so a failure replays. */
function random(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
    `${actual} is not ${expected}`,
  );

describe("years of a date", () => {
  it("is the year itself on the first of January", () => {
    assert.equal(yearsOf(new TimelineDate(1789)), 1789);
    assert.equal(yearsOf(new TimelineDate(-499)), -499);
  });

  it("puts a day at its share of the year, against Date", () => {
    const next = random(7);
    for (let i = 0; i < 200; i++) {
      const year = Math.floor(next() * 4000) - 2000;
      const month = Math.floor(next() * 12);
      const day = 1 + Math.floor(next() * 28);
      const at = (y, m, d) => {
        const date = new Date(0);
        date.setUTCFullYear(y, m, d);
        return date.getTime();
      };
      const share =
        (at(year, month, day) - at(year, 0, 1)) /
        (at(year + 1, 0, 1) - at(year, 0, 1));
      close(yearsOf(new TimelineDate(year, month, day)), year + share);
    }
  });

  it("only grows, day after day", () => {
    const date = new TimelineDate(1999, 11, 25);
    let last = yearsOf(date);
    for (let i = 0; i < 20; i++) {
      const value = yearsOf(date.add(1));
      assert.ok(value > last);
      last = value;
    }
  });
});

describe("precisions", () => {
  it("give every precision the extraction reads a length, growing", () => {
    assert.deepEqual(Object.keys(PRECISION_YEARS), [...PRECISIONS]);
    const lengths = PRECISIONS.map((precision) => PRECISION_YEARS[precision]);
    for (let i = 1; i < lengths.length; i++) {
      assert.ok(lengths[i] >= lengths[i - 1], PRECISIONS[i]);
    }
  });
});

describe("window", () => {
  it("keeps the point under the cursor in place when zooming", () => {
    const view = { start: 1700, end: 1900 };
    for (const at of [0, 0.25, 0.5, 0.9]) {
      const before = view.start + at * (view.end - view.start);
      const zoomed = zoomView(view, 3, at);
      close(zoomed.start + at * (zoomed.end - zoomed.start), before);
      close(zoomed.end - zoomed.start, 200 / 3);
    }
  });

  it("zooms back out to where it was", () => {
    const view = { start: 1789, end: 1799 };
    const back = zoomView(zoomView(view, 4, 0.3), 1 / 4, 0.3);
    close(back.start, view.start);
    close(back.end, view.end);
  });

  it("never narrows past a few months nor widens past all of time", () => {
    const narrow = zoomView({ start: 1789, end: 1790 }, 1e6);
    close(narrow.end - narrow.start, MIN_SPAN);
    const wide = zoomView({ start: 0, end: 1 }, 1e-12);
    close(wide.end - wide.start, MAX_SPAN);
    assert.equal(wide.start, MIN_YEAR);
  });

  it("stops at the ends of time when panning", () => {
    const view = { start: MAX_YEAR - 100, end: MAX_YEAR - 10 };
    const panned = panView(view, 5);
    assert.equal(panned.end, MAX_YEAR);
    close(panned.end - panned.start, 90);
    assert.equal(
      panView({ start: MIN_YEAR, end: MIN_YEAR + 10 }, -1).start,
      MIN_YEAR,
    );
  });

  it("pans by a share of its width", () => {
    assert.deepEqual(panView({ start: 1700, end: 1800 }, 0.5), {
      start: 1750,
      end: 1850,
    });
  });

  it("keeps the middle of a window it must widen", () => {
    const view = clampView({ start: 1789.5, end: 1789.5 });
    close((view.start + view.end) / 2, 1789.5);
  });

  it("places values across the width", () => {
    const view = { start: 1700, end: 1800 };
    assert.equal(xOf(view, 1700, 500), 0);
    assert.equal(xOf(view, 1750, 500), 250);
    assert.equal(xOf(view, 1800, 500), 500);
  });
});

describe("graduations", () => {
  const labels = (view, width) =>
    ticksOf(view, width, 100).map((tick) =>
      tick.unit === "month"
        ? `${tick.month + 1}/${tick.year}`
        : tick.unit === "year"
          ? `${tick.year}${tick.bc ? " BC" : ""}`
          : `${tick.count} ${tick.unit}`,
    );

  it("fall on round years", () => {
    assert.deepEqual(labels({ start: 1700, end: 1800 }, 1000), [
      "1700",
      "1710",
      "1720",
      "1730",
      "1740",
      "1750",
      "1760",
      "1770",
      "1780",
      "1790",
      "1800",
    ]);
  });

  it("are round on both sides of the era, with no year 0", () => {
    assert.deepEqual(labels({ start: -1600, end: 1600 }, 800), [
      "1500 BC",
      "1000 BC",
      "500 BC",
      "500",
      "1000",
      "1500",
    ]);
    const [fiveHundredBc] = ticksOf({ start: -1600, end: 1600 }, 800, 100);
    // 500 BC is the astronomical year -499.
    assert.equal(fiveHundredBc.value, -1499);
  });

  it("count months when zoomed in to a year", () => {
    assert.deepEqual(labels({ start: 1789, end: 1790 }, 400), [
      "1/1789",
      "4/1789",
      "7/1789",
      "10/1789",
      "1/1790",
    ]);
  });

  it("count back in millions, then billions of years", () => {
    assert.deepEqual(labels({ start: -100e6, end: -50e6 }, 500), [
      "100 Myr",
      "90 Myr",
      "80 Myr",
      "70 Myr",
      "60 Myr",
      "50 Myr",
    ]);
    assert.deepEqual(labels({ start: MIN_YEAR, end: MAX_YEAR }, 300), [
      "10 Gyr",
      "5 Gyr",
      "0 Gyr",
    ]);
  });

  it("leave room between them and stay inside the window", () => {
    const next = random(3);
    for (let i = 0; i < 300; i++) {
      const span = 10 ** (next() * 10 - 0.5);
      const start = MIN_YEAR + next() * (MAX_SPAN - span);
      const view = clampView({ start, end: start + span });
      const width = 200 + next() * 1200;
      const ticks = ticksOf(view, width, 90);
      assert.ok(ticks.length <= width / 90 + 1, `${ticks.length} ticks`);
      for (let j = 0; j < ticks.length; j++) {
        assert.ok(ticks[j].value >= view.start && ticks[j].value <= view.end);
        if (j) {
          const gap =
            xOf(view, ticks[j].value, width) -
            xOf(view, ticks[j - 1].value, width);
          // A month is never shorter than 28 days, a year in BC never off by more than one.
          assert.ok(gap >= 90 * 0.9, `gap ${gap}`);
        }
      }
    }
  });
});

describe("dragView", () => {
  const view = { start: 1000, end: 2000 };

  it("pans with one finger, the date under it following it", () => {
    const next = dragView(view, [0.5], [0.25]);
    close(next.start, 1250);
    close(next.end, 2250);
  });

  it("matches panView", () => {
    const next = dragView(view, [0.6], [0.4]);
    const pan = panView(view, 0.2);
    close(next.start, pan.start);
    close(next.end, pan.end);
  });

  it("zooms with two fingers, both dates staying under them", () => {
    const next = dragView(view, [0.4, 0.6], [0.2, 0.8]);
    const yearAt = (v, share) => v.start + share * (v.end - v.start);
    close(yearAt(next, 0.2), 1400);
    close(yearAt(next, 0.8), 1600);
  });

  it("pans and zooms at once", () => {
    const next = dragView(view, [0.1, 0.3], [0.5, 0.9]);
    const yearAt = (v, share) => v.start + share * (v.end - v.start);
    close(yearAt(next, 0.5), 1100);
    close(yearAt(next, 0.9), 1300);
  });

  it("stays inside the timeline and its spans", () => {
    const tight = dragView(view, [0.49, 0.51], [0, 1]);
    assert.ok(tight.end - tight.start >= MIN_SPAN);
    const wide = dragView(
      { start: MIN_YEAR, end: MAX_YEAR },
      [0, 1],
      [0.45, 0.55],
    );
    close(wide.end - wide.start, MAX_SPAN, 1);
    const crossed = dragView(view, [0.4, 0.6], [0.5, 0.5]);
    assert.ok(crossed.end > crossed.start);
  });
});
