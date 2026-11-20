import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TimelineDate } from "../../src/shared/TimelineDate.js";
import { extractEvents } from "../../src/shared/dateExtraction.js";
import {
  hasOwnLink,
  initialView,
  placeCards,
  spanOf,
  weightOf,
} from "../../src/shared/timelineLayout.js";

const PAGE = "https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise";
const ELSEWHERE = "https://fr.wikipedia.org/wiki/Bastille";

/**
 * An event with only the fields weighing reads, the others as plain as can be.
 *
 * @param {object} [fields]
 */
function event(fields = {}) {
  return {
    start: { date: new TimelineDate(1789), precision: "year" },
    end: null,
    approximate: false,
    section: "Histoire",
    link: `${PAGE}#Histoire`,
    ...fields,
  };
}

describe("own link", () => {
  it("is a link to another article", () => {
    assert.equal(hasOwnLink(event({ link: ELSEWHERE }), PAGE), true);
  });

  it("is not the page, nor a section of it", () => {
    assert.equal(hasOwnLink(event({ link: PAGE }), PAGE), false);
    assert.equal(hasOwnLink(event({ link: `${PAGE}#Histoire` }), PAGE), false);
  });
});

describe("weight", () => {
  const weight = (fields) => weightOf(event(fields), PAGE);

  it("is heavier in the lead than in a section", () => {
    assert.ok(weight({ section: null }) > weight({}));
  });

  it("is heavier with a link of its own", () => {
    assert.ok(weight({ link: ELSEWHERE }) > weight({}));
  });

  it("is heavier for a range", () => {
    const end = { date: new TimelineDate(1799), precision: "year" };
    assert.ok(weight({ end }) > weight({}));
  });

  it("is lighter for a century, or an approximate date", () => {
    const century = { date: new TimelineDate(1701), precision: "century" };
    assert.ok(weight({ start: century }) < weight({}));
    assert.ok(weight({ approximate: true }) < weight({}));
  });

  it("puts the lead before a linked event of a section", () => {
    assert.ok(weight({ section: null }) > weight({ link: ELSEWHERE, end: {} }));
  });

  it("is read from the fields the extraction gives", () => {
    const block = {
      text: "La Révolution française (1789-1799) met fin à l'Ancien Régime.",
      links: [],
      section: null,
    };
    const [read] = extractEvents(block, {
      language: "fr",
      pageUrl: PAGE,
      now: 2026,
    });
    assert.equal(weightOf(read, PAGE), weight({ section: null, end: {} }));
  });
});

describe("span", () => {
  it("covers the whole of its last period", () => {
    assert.deepEqual(spanOf(event()), { start: 1789, end: 1790 });
    const range = event({
      end: { date: new TimelineDate(1799), precision: "year" },
    });
    assert.deepEqual(spanOf(range), { start: 1789, end: 1800 });
    const century = event({
      start: { date: new TimelineDate(1701), precision: "century" },
    });
    assert.deepEqual(spanOf(century), { start: 1701, end: 1801 });
  });
});

describe("opening window", () => {
  it("frames the events with a margin", () => {
    const view = initialView([{ start: 1789 }, { start: 1799 }]);
    assert.ok(view.start < 1789 && view.start > 1780);
    assert.ok(view.end > 1799 && view.end < 1810);
  });

  it("leaves a remote date out when there are many", () => {
    const spans = [
      { start: -66e6 },
      ...Array.from({ length: 20 }, (_, i) => ({ start: 1789 + i / 2 })),
    ];
    const view = initialView(spans);
    assert.ok(view.start > 1700, `${view.start}`);
  });

  it("opens on something sensible for a single date or none", () => {
    const one = initialView([{ start: 1789 }]);
    assert.ok(one.start < 1789 && one.end > 1789);
    const none = initialView([]);
    assert.ok(none.end > none.start);
  });
});

describe("cards", () => {
  const size = { width: 1000, cardWidth: 100, gap: 10, lanes: 2 };
  const view = { start: 0, end: 1000 };

  it("give the heaviest events a card first", () => {
    const items = [
      { start: 100, weight: 0 },
      { start: 110, weight: 0 },
      { start: 120, weight: 5 },
    ];
    const placed = placeCards(items, view, size);
    assert.deepEqual(placed.map(({ index }) => index).sort(), [0, 2]);
    assert.equal(placed.find(({ index }) => index === 2).lane, 0);
  });

  it("break a tie in the order of the page", () => {
    const items = [100, 110, 120].map((start) => ({ start, weight: 1 }));
    const placed = placeCards(items, view, { ...size, lanes: 1 });
    assert.deepEqual(
      placed.map(({ index }) => index),
      [0],
    );
  });

  it("never overlap in a row", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      start: (i * 37) % 1000,
      weight: i % 5,
    }));
    const placed = placeCards(items, view, size);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b || a.lane !== b.lane) continue;
        assert.ok(Math.abs(a.x - b.x) >= size.cardWidth + size.gap);
      }
    }
  });

  it("show more events when zoomed in", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      start: 500 + i,
      weight: i % 3,
    }));
    const wide = placeCards(items, view, size).length;
    const close = placeCards(items, { start: 500, end: 550 }, size).length;
    assert.ok(close > wide, `${close} <= ${wide}`);
  });

  it("are only given to events in the window", () => {
    const items = [
      { start: -500, weight: 9 },
      { start: 2000, weight: 9 },
    ];
    assert.deepEqual(placeCards(items, view, size), []);
  });

  it("come left to right", () => {
    const items = [900, 100, 500].map((start) => ({ start, weight: 0 }));
    const xs = placeCards(items, view, size).map(({ x }) => x);
    assert.deepEqual(xs, [100, 500, 900]);
  });

  it("end at their date when they would run past the right edge", () => {
    const items = [
      { start: 50, weight: 0 },
      { start: 950, weight: 0 },
    ];
    const [first, last] = placeCards(items, view, size);
    assert.equal(first.left, first.x);
    assert.equal(last.left, last.x - size.cardWidth);
    assert.ok(last.left + size.cardWidth <= size.width);
  });

  it("do not overlap a card that ends at its date", () => {
    const items = [
      { start: 950, weight: 1 },
      { start: 860, weight: 0 },
    ];
    const placed = placeCards(items, view, { ...size, lanes: 1 });
    assert.deepEqual(
      placed.map(({ index }) => index),
      [0],
    );
  });
});
