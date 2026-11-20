import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TimelineDate } from "../../src/shared/TimelineDate.js";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  LAYER_COLORS,
  PHOTO_MAX_SIZE,
  backupOf,
  checkEntry,
  checkLayer,
  eventOfEntry,
  keyOf,
  mergeBackup,
  newLayer,
  orphanPhotos,
  parseKey,
  parseTags,
  pointFromJson,
  pointToJson,
  readDate,
  scaledSize,
  tagsOf,
  visibleEntries,
} from "../../src/shared/myTimeline.js";

const NOW = 2026;
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/**
 * A valid entry, its fields overridable.
 *
 * @param {object} [fields]
 */
function entry(fields = {}) {
  return {
    id: "e1",
    layer: "l1",
    start: { year: 1789, month: 6, day: 14, precision: "day" },
    end: null,
    approximate: false,
    written: "14 juillet 1789",
    title: "Prise de la Bastille",
    link: "https://fr.wikipedia.org/wiki/Prise_de_la_Bastille",
    description: { text: "La Bastille est prise.", links: [] },
    image: null,
    tags: ["Révolution"],
    source: null,
    updated: 10,
    ...fields,
  };
}

const layer = (fields = {}) => ({
  id: "l1",
  name: "Révolution",
  color: "#3366cc",
  hidden: false,
  updated: 10,
  ...fields,
});

describe("storage keys", () => {
  it("round-trips every kind", () => {
    for (const kind of ["entry", "layer", "photo"]) {
      assert.deepEqual(parseKey(keyOf(kind, "abc-1")), { kind, id: "abc-1" });
    }
  });

  it("ignores keys that are not the timeline's", () => {
    assert.equal(parseKey("settings"), null);
    assert.equal(parseKey("entry:"), null);
  });
});

describe("points", () => {
  it("round-trip through JSON", () => {
    const point = { date: new TimelineDate(-752, 3, 21), precision: "day" };
    const back = pointFromJson(JSON.parse(JSON.stringify(pointToJson(point))));
    assert.ok(back.date.equals(point.date));
    assert.equal(back.precision, "day");
  });

  it("refuses a day that does not exist or an unknown precision", () => {
    assert.throws(
      () => pointFromJson({ year: 1789, month: 1, day: 30, precision: "day" }),
      RangeError,
    );
    assert.throws(
      () => pointFromJson({ year: 1789, month: 0, day: 1, precision: "week" }),
      RangeError,
    );
  });

  it("give an entry the shape of an event", () => {
    const event = eventOfEntry(entry());
    assert.equal(String(event.start.date), "1789-07-14");
    assert.equal(event.end, null);
  });
});

describe("readDate", () => {
  const read = (text, languages = ["fr"]) => {
    const date = readDate(text, { languages, now: NOW });
    return date && [date.written, date.start.year, date.start.precision];
  };

  it("reads what a page would write, a bare year included", () => {
    assert.deepEqual(read("14 juillet 1789"), ["14 juillet 1789", 1789, "day"]);
    assert.deepEqual(read("1789"), ["1789", 1789, "year"]);
    assert.deepEqual(read("500 av. J.-C."), ["500 av. J.-C.", -499, "year"]);
    const range = readDate("1914–1918", { languages: ["fr"], now: NOW });
    assert.equal(range.end.year, 1918);
  });

  it("reads every kind of date in English as well", () => {
    const en = (text) => read(text, ["en"]);
    assert.deepEqual(en("July 14, 1789"), ["July 14, 1789", 1789, "day"]);
    assert.deepEqual(en("1789"), ["1789", 1789, "year"]);
    assert.deepEqual(en("500 BC"), ["500 BC", -499, "year"]);
    assert.equal(en("66 million years ago")[2], "Myr");
    assert.equal(read("il y a 66 millions d'années")[2], "Myr");
    const approximate = readDate("c. 1500", { languages: ["en"], now: NOW });
    assert.equal(approximate.approximate, true);
  });

  it("tries the other languages after the ones given", () => {
    assert.deepEqual(read("July 14, 1789", ["fr"]), [
      "July 14, 1789",
      1789,
      "day",
    ]);
    assert.deepEqual(read("14 juillet 1789", ["en"]), [
      "14 juillet 1789",
      1789,
      "day",
    ]);
  });

  it("finds nothing where there is no date", () => {
    assert.equal(read("demain"), null);
    assert.equal(read(""), null);
    assert.deepEqual(read("1789", ["de"]), read("1789"));
  });
});

describe("tags", () => {
  it("are comma-separated, trimmed, each once whatever its case", () => {
    assert.deepEqual(parseTags(" Révolution, guerre ,, révolution,  a  b "), [
      "Révolution",
      "guerre",
      "a b",
    ]);
    assert.deepEqual(parseTags(""), []);
  });

  it("are listed once over every entry, sorted", () => {
    const entries = [entry({ tags: ["b", "A"] }), entry({ tags: ["a", "c"] })];
    assert.deepEqual(tagsOf(entries), ["A", "b", "c"]);
  });
});

describe("visibleEntries", () => {
  const layers = [layer(), layer({ id: "l2", hidden: true })];
  const entries = [
    entry({ id: "a", tags: ["Guerre"] }),
    entry({ id: "b", tags: ["Paix"] }),
    entry({ id: "c", layer: "l2", tags: ["Guerre"] }),
    entry({ id: "d", layer: "gone" }),
  ];
  const ids = (list) => list.map(({ id }) => id);

  it("shows the entries of shown layers", () => {
    assert.deepEqual(ids(visibleEntries(entries, layers)), ["a", "b"]);
  });

  it("keeps those with a picked tag, whatever its case", () => {
    assert.deepEqual(ids(visibleEntries(entries, layers, ["guerre"])), ["a"]);
    assert.deepEqual(ids(visibleEntries(entries, layers, ["guerre", "paix"])), [
      "a",
      "b",
    ]);
  });
});

describe("layers", () => {
  it("take the palette's colours in turn", () => {
    const colors = [0, 1, LAYER_COLORS.length].map(
      (count) => newLayer({ id: "x", name: "X", count, now: 1 }).color,
    );
    assert.deepEqual(colors, [
      LAYER_COLORS[0],
      LAYER_COLORS[1],
      LAYER_COLORS[0],
    ]);
  });
});

describe("scaledSize", () => {
  it("brings the longest side down to the limit, proportions kept", () => {
    assert.deepEqual(scaledSize(4000, 3000), { width: 1024, height: 768 });
    assert.deepEqual(scaledSize(3000, 4000), { width: 768, height: 1024 });
    assert.equal(PHOTO_MAX_SIZE, 1024);
  });

  it("never enlarges, never reaches zero", () => {
    assert.deepEqual(scaledSize(300, 200), { width: 300, height: 200 });
    assert.deepEqual(scaledSize(100000, 10), { width: 1024, height: 1 });
  });
});

describe("checkEntry", () => {
  it("keeps a valid entry as it is", () => {
    const valid = entry({
      image: {
        summary: "https://fr.wikipedia.org/api/rest_v1/page/summary/X",
        fallback: null,
      },
      source: { url: "https://fr.wikipedia.org/wiki/R", title: "R" },
    });
    assert.deepEqual(checkEntry(JSON.parse(JSON.stringify(valid))), valid);
  });

  it("refuses what cannot be drawn", () => {
    const badDay = { year: 1789, month: 13, day: 1, precision: "day" };
    assert.equal(checkEntry(null), null);
    assert.equal(checkEntry(entry({ id: "" })), null);
    assert.equal(checkEntry(entry({ id: "a b/c" })), null);
    assert.equal(checkEntry(entry({ layer: 3 })), null);
    assert.equal(checkEntry(entry({ start: badDay })), null);
    assert.equal(checkEntry(entry({ end: { year: "x" } })), null);
  });

  it("drops a dangerous or malformed field rather than the entry", () => {
    const checked = checkEntry(
      entry({
        link: "javascript:alert(1)",
        image: { url: "javascript:alert(1)" },
        description: {
          text: "x",
          links: [{ start: 0, end: 1, href: "javascript:y" }, "junk"],
        },
        tags: ["a", 3, "A"],
        title: 42,
        updated: "soon",
      }),
    );
    assert.equal(checked.link, null);
    assert.equal(checked.image, null);
    assert.deepEqual(checked.description, { text: "x", links: [] });
    assert.deepEqual(checked.tags, ["a"]);
    assert.equal(checked.title, "");
    assert.equal(checked.updated, 0);
  });
});

describe("checkLayer", () => {
  it("keeps a valid layer and mends a bad colour", () => {
    assert.deepEqual(checkLayer(layer()), layer());
    assert.equal(checkLayer(layer({ color: "red" })).color, LAYER_COLORS[0]);
    assert.equal(checkLayer({ name: "x" }), null);
  });
});

describe("mergeBackup", () => {
  const backup = (fields = {}) =>
    JSON.parse(
      JSON.stringify({
        ...backupOf({ layers: [layer()], entries: [entry()], photos: {} }),
        ...fields,
      }),
    );

  it("writes everything into an empty timeline", () => {
    const writes = mergeBackup({}, backup({ photos: { p1: PHOTO } }));
    assert.deepEqual(Object.keys(writes).sort(), [
      "entry:e1",
      "layer:l1",
      "photo:p1",
    ]);
    assert.deepEqual(writes["entry:e1"], entry());
  });

  it("replaces only what the backup holds newer, deletes nothing", () => {
    const current = {
      "layer:l1": layer({ updated: 20 }),
      "entry:e1": entry({ updated: 5 }),
      "entry:mine": entry({ id: "mine" }),
      "photo:p1": PHOTO,
    };
    const writes = mergeBackup(current, backup({ photos: { p1: PHOTO } }));
    assert.deepEqual(Object.keys(writes), ["entry:e1"]);
  });

  it("is idempotent", () => {
    const first = mergeBackup({}, backup());
    assert.deepEqual(mergeBackup(first, backup()), {});
  });

  it("skips an entry whose layer exists nowhere, and a bad photo", () => {
    const writes = mergeBackup(
      {},
      backup({
        entries: [entry({ layer: "gone" })],
        photos: { p1: "data:text/html;base64,PHNjcmlwdD4=", "../x": PHOTO },
      }),
    );
    assert.deepEqual(Object.keys(writes), ["layer:l1"]);
  });

  it("refuses a file that is not a backup, or too new", () => {
    assert.throws(() => mergeBackup({}, { layers: [] }), TypeError);
    assert.throws(() => mergeBackup({}, null), TypeError);
    assert.throws(
      () => mergeBackup({}, backup({ version: BACKUP_VERSION + 1 })),
      TypeError,
    );
    assert.equal(backup().format, BACKUP_FORMAT);
  });
});

describe("orphanPhotos", () => {
  it("lists the photos no entry shows", () => {
    const entries = [entry({ image: { photo: "p1" } }), entry()];
    assert.deepEqual(orphanPhotos(["p1", "p2"], entries), ["p2"]);
  });
});
