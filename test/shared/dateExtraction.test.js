import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LANGUAGES,
  PRECISIONS,
  extractEvents,
} from "../../src/shared/dateExtraction.js";
import { EXCERPTS } from "./fixtures/wikipediaExcerpts.js";

const NOW = 2026;
const PAGE = "https://fr.wikipedia.org/wiki/Page";

/**
 * The events of a text, each as `[mention, start, precision, end]`, plus
 * `"~"` when approximate: short enough to list a whole page's worth.
 *
 * @param {string} text
 * @param {string} language
 * @returns {Array<Array<string | null>>}
 */
function read(text, language) {
  const block = { text, links: [], section: null };
  return extractEvents(block, { language, pageUrl: PAGE, now: NOW }).map(
    (event) => [
      text.slice(event.mention.start, event.mention.end),
      String(event.start.date),
      event.start.precision,
      event.end ? String(event.end.date) : null,
      ...(event.approximate ? ["~"] : []),
    ],
  );
}

/**
 * @param {string} text
 * @param {string} language
 * @returns {string[]} the mentions read, nothing else
 */
function mentions(text, language) {
  return read(text, language).map(([mention]) => mention);
}

/** What each excerpt holds, checked by hand against the text. */
const EXPECTED = {
  "Ancient Rome": [
    ["8th century BC", "-799-01-01", "century", null],
    ["5th century AD", "401-01-01", "century", null],
    ["753–509 BC", "-752-01-01", "year", "-508-01-01"],
    ["509\u200d–\u200d27 BC", "-508-01-01", "year", "-26-01-01"],
    ["27 BC – 476 AD", "-26-01-01", "year", "476-01-01"],
    ["753 BC", "-752-01-01", "year", null],
    ["AD 117", "117-01-01", "year", null],
  ],
  "Cretaceous–Paleogene extinction event": [
    ["65.5 million years ago", "-65497974-01-01", "Myr", null, "~"],
  ],
  "French Revolution": [
    ["1789", "1789-01-01", "year", null],
    ["9 November 1799", "1799-11-09", "day", null],
    ["May 1789", "1789-05-01", "month", null],
    ["February 1614", "1614-02-01", "month", null],
  ],
  Napoleon: [
    ["15 August 1769 – 5 May 1821", "1769-08-15", "day", "1821-05-05"],
    ["18 May 1804", "1804-05-18", "day", null],
    ["1814", "1814-01-01", "year", null],
    ["1815", "1815-01-01", "year", null],
    ["1779", "1779-01-01", "year", null],
    ["1785", "1785-01-01", "year", null],
    ["1789", "1789-01-01", "year", null],
    ["1793", "1793-01-01", "year", null],
    ["1795", "1795-01-01", "year", null],
    ["1796", "1796-01-01", "year", null],
    ["1798", "1798-01-01", "year", null],
    ["November 1799", "1799-11-01", "month", null],
    ["1800", "1800-01-01", "year", null],
    ["1803", "1803-01-01", "year", null],
    ["December 1804", "1804-12-01", "month", null],
  ],
  "Extinction Crétacé-Paléogène": [
    ["66 millions d'années", "-65997974-01-01", "Myr", null],
  ],
  "Napoléon Ier": [
    ["15 août 1769", "1769-08-15", "day", null],
    ["5 mai 1821", "1821-05-05", "day", null],
    ["18 mai 1804 au 6 avril 1814", "1804-05-18", "day", "1814-04-06"],
    ["20 mars au 22 juin 1815", "1815-03-20", "day", "1815-06-22"],
    ["1793", "1793-01-01", "year", null],
    ["1799", "1799-01-01", "year", null],
    ["2 août 1802", "1802-08-02", "day", null],
    ["18 mai 1804", "1804-05-18", "day", null],
    ["2 décembre 1804", "1804-12-02", "day", null],
  ],
  "Rome antique": [
    ["VIIIe siècle av. J.-C.", "-799-01-01", "century", null],
    ["Ier au Ve siècle", "1-01-01", "century", "401-01-01"],
    ["IIIe siècle", "201-01-01", "century", null],
    ["IVe siècle", "301-01-01", "century", null],
    ["395", "395-01-01", "year", null],
    ["476", "476-01-01", "year", null],
  ],
  "Révolution française": [
    ["1789-1799", "1789-01-01", "year", "1799-01-01"],
    ["XVIIIe siècle", "1701-01-01", "century", null],
    ["5 mai 1789", "1789-05-05", "day", null],
    ["9 novembre 1799", "1799-11-09", "day", null],
    ["1789-1792", "1789-01-01", "year", "1792-01-01"],
    ["1789", "1789-01-01", "year", null],
  ],
};

describe("real Wikipedia excerpts", () => {
  for (const { title, language, paragraphs } of EXCERPTS) {
    it(`reads ${title} (${language})`, () => {
      const events = paragraphs.flatMap((text) => read(text, language));
      assert.deepEqual(events, EXPECTED[title]);
    });
  }
});

describe("forms", () => {
  /** Each row: language, text, then what `read` gives for it. */
  const ROWS = [
    // Full dates.
    [
      "fr",
      "le 1er janvier 2000",
      [["1er janvier 2000", "2000-01-01", "day", null]],
    ],
    [
      "fr",
      "le 14 Juillet 1789",
      [["14 Juillet 1789", "1789-07-14", "day", null]],
    ],
    [
      "fr",
      "le 15 mars 44 av. J.-C.",
      [["15 mars 44 av. J.-C.", "-43-03-15", "day", null]],
    ],
    ["en", "on July 14, 1789", [["July 14, 1789", "1789-07-14", "day", null]]],
    [
      "en",
      "on the 4th of July 1776",
      [["4th of July 1776", "1776-07-04", "day", null]],
    ],
    ["en", "on 4 Sept. 1870", [["4 Sept. 1870", "1870-09-04", "day", null]]],
    // Month and year.
    ["fr", "en août 1914", [["août 1914", "1914-08-01", "month", null]]],
    ["en", "in August 1914", [["August 1914", "1914-08-01", "month", null]]],
    // Years, with a cue.
    ["fr", "depuis 1958", [["1958", "1958-01-01", "year", null]]],
    ["fr", "la constitution de 1958", [["1958", "1958-01-01", "year", null]]],
    [
      "fr",
      "1515 : bataille de Marignan",
      [["1515", "1515-01-01", "year", null]],
    ],
    ["en", "the Treaty (1648) ended", [["1648", "1648-01-01", "year", null]]],
    ["en", "since 1958", [["1958", "1958-01-01", "year", null]]],
    // Eras.
    [
      "fr",
      "fondée en 753 avant notre ère",
      [["753 avant notre ère", "-752-01-01", "year", null]],
    ],
    [
      "fr",
      "mort en 14 apr. J.-C.",
      [["14 apr. J.-C.", "14-01-01", "year", null]],
    ],
    ["en", "in 44 BCE", [["44 BCE", "-43-01-01", "year", null]]],
    ["en", "in 79 CE", [["79 CE", "79-01-01", "year", null]]],
    // Decades and centuries.
    [
      "fr",
      "dans les années 1960",
      [["années 1960", "1960-01-01", "decade", null]],
    ],
    ["en", "in the 1960s", [["1960s", "1960-01-01", "decade", null]]],
    ["en", "in the 1800s", [["1800s", "1800-01-01", "century", null]]],
    ["fr", "au 18e siècle", [["18e siècle", "1701-01-01", "century", null]]],
    [
      "en",
      "the eighteenth century",
      [["eighteenth century", "1701-01-01", "century", null]],
    ],
    [
      "en",
      "the 21st-century novel",
      [["21st-century", "2001-01-01", "century", null]],
    ],
    [
      "fr",
      "au IIIe millénaire av. J.-C.",
      [["IIIe millénaire av. J.-C.", "-2999-01-01", "millennium", null]],
    ],
    [
      "en",
      "the 3rd millennium BC",
      [["3rd millennium BC", "-2999-01-01", "millennium", null]],
    ],
    // Deep time.
    [
      "fr",
      "il y a 4,54 milliards d'années",
      [["4,54 milliards d'années", "-4539997974-01-01", "Gyr", null]],
    ],
    [
      "fr",
      "il y a 10\u00a0000 ans",
      [["10\u00a0000 ans", "-7974-01-01", "year", null]],
    ],
    ["fr", "vers 252 Ma", [["252 Ma", "-251997974-01-01", "Myr", null, "~"]]],
    [
      "en",
      "4.54 billion years ago",
      [["4.54 billion years ago", "-4539997974-01-01", "Gyr", null]],
    ],
    [
      "en",
      "about 12,000 years ago",
      [["12,000 years ago", "-9974-01-01", "year", null, "~"]],
    ],
    ["en", "dated to 40 ka", [["40 ka", "-37974-01-01", "kyr", null]]],
    // Approximations.
    ["fr", "vers 1500", [["1500", "1500-01-01", "year", null, "~"]]],
    ["fr", "né v. 1225", [["1225", "1225-01-01", "year", null, "~"]]],
    ["en", "born c. 1225", [["1225", "1225-01-01", "year", null, "~"]]],
  ];

  for (const [language, text, expected] of ROWS) {
    it(`${language}: ${text}`, () => {
      assert.deepEqual(read(text, language), expected);
    });
  }
});

describe("ranges", () => {
  const ROWS = [
    [
      "fr",
      "de 1914 à 1918",
      [["1914 à 1918", "1914-01-01", "year", "1918-01-01"]],
    ],
    [
      "fr",
      "entre 1914 et 1918",
      [["1914 et 1918", "1914-01-01", "year", "1918-01-01"]],
    ],
    [
      "fr",
      "du 5 au 9 mai 1789",
      [["5 au 9 mai 1789", "1789-05-05", "day", "1789-05-09"]],
    ],
    [
      "fr",
      "de juillet à septembre 1789",
      [["juillet à septembre 1789", "1789-07-01", "month", "1789-09-01"]],
    ],
    [
      "fr",
      "du XVe au XVIIe siècle",
      [["XVe au XVIIe siècle", "1401-01-01", "century", "1601-01-01"]],
    ],
    [
      "fr",
      "de 300 à 200 av. J.-C.",
      [["300 à 200 av. J.-C.", "-299-01-01", "year", "-199-01-01"]],
    ],
    [
      "fr",
      "il y a entre 66 et 56 millions d'années",
      [
        [
          "66 et 56 millions d'années",
          "-65997974-01-01",
          "Myr",
          "-55997974-01-01",
        ],
      ],
    ],
    [
      "en",
      "from 1914 to 1918",
      [["1914 to 1918", "1914-01-01", "year", "1918-01-01"]],
    ],
    [
      "en",
      "between 252 and 201 Ma",
      [["252 and 201 Ma", "-251997974-01-01", "Myr", "-200997974-01-01"]],
    ],
    [
      "en",
      "the war (1914–18)",
      [["1914–18", "1914-01-01", "year", "1918-01-01"]],
    ],
    [
      "en",
      "from the 15th to the 17th century",
      [["15th to the 17th century", "1401-01-01", "century", "1601-01-01"]],
    ],
    [
      "en",
      "1914 - 1918",
      [["1914 - 1918", "1914-01-01", "year", "1918-01-01"]],
    ],
  ];

  for (const [language, text, expected] of ROWS) {
    it(`${language}: ${text}`, () => {
      assert.deepEqual(read(text, language), expected);
    });
  }

  it("does not read a backwards range as one", () => {
    // Undone, each year stands on its own cue: `à` is none.
    assert.deepEqual(mentions("de 1918 à 1914", "fr"), ["1918"]);
    assert.deepEqual(mentions("(27 BC – 476 AD)", "en"), ["27 BC – 476 AD"]);
    assert.deepEqual(mentions("(476 AD – 27 BC)", "en"), ["476 AD", "27 BC"]);
  });

  it("reads a range opened after an article", () => {
    assert.deepEqual(mentions("entre le XVe et le XVIIe siècle", "fr"), [
      "XVe et le XVIIe siècle",
    ]);
  });

  it("does not join two dates a dash merely sits between", () => {
    assert.deepEqual(
      mentions("à partir du 2 août 1802 — jusqu'au 18 mai 1804", "fr"),
      ["2 août 1802", "18 mai 1804"],
    );
  });
});

describe("what is not a date", () => {
  const ROWS = [
    ["fr", "le 14 juillet"], // no year
    ["fr", "1500 soldats arrivent"], // no cue
    ["fr", "en 1500 exemplaires"], // a unit
    ["fr", "de 10 à 15 km"],
    ["fr", "il compte 252 pages"],
    ["fr", "pendant 66 millions d'années"], // a duration, no « il y a »
    ["fr", "François Ier et Louis XIV"],
    ["fr", "le 31 février 1800"], // no such day
    ["fr", "en mai 68"], // a two-digit year needs an era
    ["en", "A 2016 drilling project"],
    ["en", "10 to 15 km wide"],
    ["en", "about 16,000 people"],
    ["en", "in 1500 years"],
    ["en", "it may 2000"],
    ["en", "on 14 July"],
    ["en", "a 1.5 million year span"],
    // Quantities a weak cue comes before, read on whole articles.
    ["fr", "ceux du clergé (291) et de la noblesse (270)"],
    ["fr", "environ 300 hommes"],
    ["fr", "environ 168 cm"],
    ["en", "the clergy (291) and the nobility (270)"],
    ["en", "About 300 to 1,400 rebels"],
    ["en", "at about 168 cm"],
    ["en", "On 25 September, 200,000 French troops"],
    ["fr", "ISBN 978-1-4286-4988-0"],
    ["en", "ISBN 978-1-4286-4988-0"],
  ];

  for (const [language, text] of ROWS) {
    it(`${language}: ${text}`, () => {
      assert.deepEqual(read(text, language), []);
    });
  }
});

describe("sentences and links", () => {
  /**
   * A block whose links are given by their text, in order.
   *
   * @param {string} text
   * @param {Array<[string, string]>} links each `[linked text, href]`
   * @param {string | null} [section]
   */
  function block(text, links, section = null) {
    let from = 0;
    return {
      text,
      section,
      links: links.map(([linked, href]) => {
        const start = text.indexOf(linked, from);
        from = start + linked.length;
        return { start, end: from, href };
      }),
    };
  }

  /**
   * @param {object} b
   * @param {string} [language]
   */
  function events(b, language = "fr") {
    return extractEvents(b, { language, pageUrl: PAGE, now: NOW });
  }

  it("leads to the nearest link of the sentence", () => {
    const b = block(
      "La Bastille est prise le 14 juillet 1789 par les émeutiers. " +
        "Napoléon naît en 1769 à Ajaccio.",
      [
        ["Bastille", "https://fr.wikipedia.org/wiki/Bastille"],
        ["Napoléon", "https://fr.wikipedia.org/wiki/Napol%C3%A9on_Ier"],
        ["Ajaccio", "https://fr.wikipedia.org/wiki/Ajaccio"],
      ],
    );
    const [bastille, napoleon] = events(b);
    assert.equal(bastille.link, "https://fr.wikipedia.org/wiki/Bastille");
    assert.equal(napoleon.link, "https://fr.wikipedia.org/wiki/Ajaccio");
  });

  it("never leads to a link written over the date", () => {
    const b = block("Le 14 juillet 1789, la Bastille tombe.", [
      ["14 juillet", "https://fr.wikipedia.org/wiki/14_juillet"],
      ["1789", "https://fr.wikipedia.org/wiki/1789_en_France"],
      ["Bastille", "https://fr.wikipedia.org/wiki/Bastille"],
    ]);
    assert.equal(events(b)[0].link, "https://fr.wikipedia.org/wiki/Bastille");
  });

  it("falls back on the page at the block's section", () => {
    const text = "Les travaux reprennent en 1850.";
    assert.equal(
      events(block(text, [], "Histoire"))[0].link,
      `${PAGE}#Histoire`,
    );
    assert.equal(events(block(text, []))[0].link, PAGE);
  });

  it("keeps the date as written, and the section it was read in", () => {
    const zwj = String.fromCharCode(0x200d);
    const b = block(
      `La République dure de 509${zwj}–${zwj}27 av. J.-C.`,
      [],
      "Rome",
    );
    const [republic] = events(b);
    assert.equal(republic.written, "509–27 av. J.-C.");
    assert.equal(republic.section, "Rome");
    assert.equal(events(block("Fondée en 753 av. J.-C.", []))[0].section, null);
  });

  it("keeps the sentence, with its links, as the description", () => {
    const b = block(
      "Rome est fondée en 753 av. J.-C. Elle devient une République en 509 av. J.-C. selon la tradition.",
      [
        ["Rome", "https://fr.wikipedia.org/wiki/Rome"],
        ["République", "https://fr.wikipedia.org/wiki/R%C3%A9publique_romaine"],
      ],
    );
    const [founding, republic] = events(b);
    assert.deepEqual(founding.sentence, {
      text: "Rome est fondée en 753 av. J.-C.",
      links: [{ start: 0, end: 4, href: "https://fr.wikipedia.org/wiki/Rome" }],
    });
    assert.equal(
      republic.sentence.text,
      "Elle devient une République en 509 av. J.-C. selon la tradition.",
    );
    assert.equal(republic.sentence.links[0].start, 17);
  });

  it("does not cut a sentence after an abbreviation or an initial", () => {
    const english = block(
      "The king died c. 1300 according to J. Smith. Then in 1310 he returned.",
      [],
    );
    const [died, returned] = events(english, "en");
    assert.equal(
      died.sentence.text,
      "The king died c. 1300 according to J. Smith.",
    );
    assert.equal(returned.sentence.text, "Then in 1310 he returned.");

    const french = block(
      "Le roi meurt v. 1300 selon M. Dupont. Puis en 1310 il revient.",
      [],
    );
    const [meurt, revient] = events(french, "fr");
    assert.equal(meurt.sentence.text, "Le roi meurt v. 1300 selon M. Dupont.");
    assert.equal(revient.sentence.text, "Puis en 1310 il revient.");
  });
});

describe("contract", () => {
  it("reads French and English", () => {
    assert.deepEqual([...LANGUAGES].sort(), ["en", "fr"]);
  });

  it("refuses a language without a grammar", () => {
    assert.throws(
      () =>
        extractEvents(
          { text: "", links: [], section: null },
          { language: "de", pageUrl: PAGE, now: NOW },
        ),
      RangeError,
    );
  });

  it("gives every point a known precision", () => {
    for (const { language, paragraphs } of EXCERPTS) {
      for (const text of paragraphs) {
        const block = { text, links: [], section: null };
        for (const event of extractEvents(block, {
          language,
          pageUrl: PAGE,
          now: NOW,
        })) {
          assert.ok(PRECISIONS.includes(event.start.precision));
          if (event.end) assert.ok(PRECISIONS.includes(event.end.precision));
        }
      }
    }
  });
});
