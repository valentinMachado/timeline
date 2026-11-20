/**
 * Reads the dates of a block of text — a paragraph, an item of a list — into
 * timeline events. Pure: the content script walks the page and hands each
 * block over as plain text with the offsets of its links.
 *
 * What a language writes is in its grammar (`dateGrammars.js`); this file is
 * the same for every language. The rules it applies:
 *
 * - A bare year (`1789`, no month, no era) is read only with a cue: a word
 *   before it (`en`, `in`, `since`…), a range, or the start of a line of a
 *   chronology (`1789 : …`). It has three or four digits and is not
 *   followed by a unit (`1500 soldats`). A cue that also comes before a
 *   quantity — `de`, `of`, `about`, `environ`, parentheses (`le clergé
 *   (291)`) — only makes a date of four digits. A year of one or two digits
 *   needs an era (`52 av. J.-C.`). Numbers chained by dashes (an ISBN) are
 *   never a range.
 * - A range (`1914–1918`, `du 5 au 9 mai 1789`, `between 252 and 201 Ma`)
 *   is one event. Its start may leave out what its end says: the month, the
 *   year, the era, the unit.
 * - A date without a year (`le 14 juillet`) is not read: the year it
 *   belongs to is somewhere else in the text, and guessing it would be wrong
 *   without a sign.
 * - Dates are taken as written: one before 1582 is usually Julian on
 *   Wikipedia, and is not converted.
 * - Not read yet: `May 2–5, 1789`, `années 60`, `début du XIXe siècle` (read
 *   as the whole century), the French Republican calendar.
 */

import { TimelineDate } from "./TimelineDate.js";
import { GRAMMARS } from "./dateGrammars.js";

/**
 * How coarse a point in time is: the size of the period its date starts.
 * The deep-time ones are counted back from today, a thousand, a million or a
 * billion years at a time.
 */
export const PRECISIONS = Object.freeze([
  "day",
  "month",
  "year",
  "decade",
  "century",
  "millennium",
  "kyr",
  "Myr",
  "Gyr",
]);

/** The languages a block may be read in. */
export const LANGUAGES = Object.freeze(Object.keys(GRAMMARS));

/**
 * @typedef {object} Point
 * @property {TimelineDate} date the first day of the period the text names
 * @property {string} precision one of {@link PRECISIONS}
 */

/**
 * @typedef {object} Link
 * @property {number} start offset of its first character
 * @property {number} end offset past its last character
 * @property {string} href absolute URL
 */

/**
 * @typedef {object} Block
 * @property {string} text
 * @property {Link[]} links in the order of the text, offsets into `text`
 * @property {string | null} section the anchor of the section the block is
 *   in, null in the lead
 */

/**
 * @typedef {object} TimelineEvent
 * @property {Point} start
 * @property {Point | null} end null unless the text gives a range
 * @property {boolean} approximate `vers 1500`, `c. 1500`, `around 66 Ma`
 * @property {{ start: number, end: number }} mention where the date is
 *   written, offsets into the block's text
 * @property {string} written the date as the text writes it, invisible
 *   joiners left out: the label a timeline shows
 * @property {string | null} section the anchor of the section the event was
 *   read in, null in the lead
 * @property {{ text: string, links: Link[] }} sentence the sentence the date
 *   is in, its links' offsets into that sentence: the event's description
 * @property {string} link the URL the event leads to: the link of its
 *   sentence nearest the date, or the page at the block's section
 */

/**
 * @param {Block} block
 * @param {object} options
 * @param {string} options.language one of {@link LANGUAGES}
 * @param {string} options.pageUrl the page being read, without a fragment:
 *   the link of an event whose sentence has none
 * @param {number} options.now the current year, which `il y a 66 millions
 *   d'années` counts back from
 * @param {boolean} [options.lenient] reads a bare year without a cue: for a
 *   text the reader points at (a selection, a field), where nothing else
 *   could be meant
 * @returns {TimelineEvent[]} in the order of the text
 * @throws {RangeError} on a language without a grammar
 */
export function extractEvents(block, { language, pageUrl, now, lenient }) {
  const base = GRAMMARS[language];
  if (!base) throw new RangeError(`No date grammar for "${language}"`);
  // Every rule is handed the grammar; the cue rule reads `lenient` from it.
  const grammar = lenient ? { ...base, lenient: true } : base;
  const { text } = block;
  const mentions = scan(text, grammar);
  const found = [];

  for (let i = 0; i < mentions.length; i++) {
    const range = readRange(text, mentions[i], mentions[i + 1], grammar, now);
    if (range) {
      found.push(range);
      i++;
      continue;
    }
    const single = readSingle(text, mentions[i], grammar, now);
    if (single) found.push(single);
  }

  const sentences = sentencesOf(text, found, grammar);
  // A link written over a date (`14 juillet`, `1789 en France`) is the
  // date's own, not the event's: it never stands for the event.
  const dateSpans = [
    ...found.map(({ mention }) => mention),
    ...mentions.filter(isDayAndMonth),
  ];
  return found.map(({ start, end, mention, approximate }) => {
    const sentence = sentences.find(
      (s) => mention.start >= s.start && mention.start < s.end,
    ) ?? { start: 0, end: text.length };
    return {
      start,
      end,
      approximate,
      mention,
      written: text.slice(mention.start, mention.end).replace(INVISIBLE, ""),
      section: block.section,
      sentence: sentenceOf(block, sentence),
      link: linkOf(block, sentence, mention, dateSpans, pageUrl),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Raw mentions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every raw mention of the text, without overlaps: where two forms read the
 * same characters, the one starting first wins, then the longest.
 *
 * @param {string} text
 * @param {object} grammar
 * @returns {{ start: number, end: number, raw: object }[]}
 */
function scan(text, grammar) {
  const all = [];
  for (const { regex, read } of grammar.forms) {
    for (const match of text.matchAll(regex)) {
      const raw = read(match.groups);
      if (raw) {
        all.push({
          start: match.index,
          end: match.index + match[0].length,
          raw,
        });
      }
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const mention of all) {
    if (!kept.length || mention.start >= kept.at(-1).end) kept.push(mention);
  }
  return kept;
}

/**
 * @param {{ raw: object }} mention
 * @returns {boolean} true for `14 juillet`: a date, though not a whole one
 */
function isDayAndMonth({ raw }) {
  return raw.kind === "calendar" && raw.day !== undefined;
}

/**
 * Whether a raw mention names a whole date on its own.
 *
 * @param {object} raw
 * @returns {boolean}
 */
function isComplete(raw) {
  if (raw.kind === "calendar") return raw.year !== undefined;
  if (raw.kind === "ordinal") return raw.unit !== undefined;
  return true;
}

/**
 * Fills the start of a range from its end: what `du 5 au 9 mai 1789`,
 * `du XVe au XVIIe siècle`, `de 300 à 200 av. J.-C.` or `entre 252 et
 * 201 Ma` leave out of their start.
 *
 * @param {object} start a raw mention
 * @param {object} end a complete raw mention
 * @returns {object | null} the start made complete, or null when it cannot be
 */
function inherit(start, end) {
  const era = start.era ?? end.era;
  if (end.kind === "calendar" && start.kind === "calendar") {
    if (start.year !== undefined) return start;
    return { ...start, year: end.year, yearDigits: end.yearDigits, era };
  }
  if (end.kind === "calendar" && end.day !== undefined) {
    if (start.kind === "number" && !start.era && start.value <= 31) {
      return { ...end, day: start.value };
    }
  }
  if (end.kind === "number" && start.kind === "number") {
    return { ...start, era };
  }
  if (end.kind === "ordinal" && start.kind === "ordinal") {
    return { ...start, unit: start.unit ?? end.unit, era };
  }
  if (end.kind === "ago" && start.kind === "number" && !start.era) {
    return { ...end, value: start.value };
  }
  return isComplete(start) ? start : null;
}

/* ------------------------------------------------------------------ */
/* From a raw mention to a point                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {number} year as written, 1 or more
 * @param {"BC" | "AD" | undefined} era
 * @returns {number} the astronomical year: 1 BC is 0
 */
function astronomical(year, era) {
  return era === "BC" ? 1 - year : year;
}

/** How each kind of complete raw mention becomes a point. */
const POINT_OF = {
  calendar: (raw) => ({
    date: new TimelineDate(
      astronomical(raw.year, raw.era),
      raw.month,
      raw.day ?? 1,
    ),
    precision: raw.day === undefined ? "month" : "day",
  }),
  number: (raw) => ({
    date: new TimelineDate(astronomical(raw.value, raw.era)),
    precision: "year",
  }),
  decade: (raw) => ({
    date: new TimelineDate(raw.year),
    precision: raw.century ? "century" : "decade",
  }),
  ordinal: (raw) => {
    const size = raw.unit === "century" ? 100 : 1000;
    // The 18th century is 1701–1800; the 3rd century BC, 300–201 BC.
    const first = raw.era === "BC" ? raw.n * size : (raw.n - 1) * size + 1;
    return {
      date: new TimelineDate(astronomical(first, raw.era)),
      precision: raw.unit,
    };
  },
  ago: (raw, now) => ({
    date: new TimelineDate(now - Math.round(raw.value * raw.scale)),
    precision: raw.precision,
  }),
};

/**
 * @param {object} raw a complete raw mention
 * @param {number} now
 * @returns {Point | null} null when the date does not exist (`31 février`,
 *   year 0, before the Big Bang)
 */
function pointOf(raw, now) {
  // No year, century or count 0 is written: `0 av. J.-C.` would land on 1 BC.
  if ((raw.year ?? raw.value ?? raw.n) < 1) return null;
  try {
    return POINT_OF[raw.kind](raw, now);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Cues                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {string} before the text before a mention
 * @param {string} words a grammar's alternation of words
 * @returns {boolean} true when `before` ends with one of the words
 */
function endsWithWord(before, words) {
  return new RegExp(`(?:^|[^\\p{L}])(?:${words})\\s*$`, "iu").test(before);
}

/**
 * The context of a mention or range that may make a bare year a date.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {object} grammar
 * @returns {{ cue: boolean, weakCue: boolean, unitAfter: boolean }}
 */
function contextOf(text, start, end, grammar) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const articles = `(?:${grammar.articles})\\s*`;
  const parenthesised = /\(\s*$/.test(before) && /^\s*[),;]/.test(after);
  const lineStart = /^\s*$/.test(before) && /^\s*[:–—-]/.test(after);
  const strong = endsWithWord(
    before,
    `(?:${grammar.yearCues})\\s*(?:${articles})?`,
  );
  return {
    cue: strong || lineStart || Boolean(grammar.lenient),
    // `(291)` may be a count as well as a year.
    weakCue: parenthesised || endsWithWord(before, grammar.weakYearCues),
    unitAfter: new RegExp(`^\\s*(?:${grammar.units})(?![\\p{L}])`, "iu").test(
      after,
    ),
  };
}

/**
 * Whether a complete raw mention may stand as a date in its context, the
 * rules for bare years and for counts back from today.
 *
 * @param {object} raw
 * @param {{ cue: boolean, weakCue: boolean, unitAfter: boolean }} context
 * @param {string} before the text before the event
 * @param {object} grammar
 * @returns {boolean}
 */
function acceptable(raw, context, before, grammar) {
  if (raw.kind === "calendar") return raw.era || raw.yearDigits >= 3;
  if (raw.kind === "ago") {
    return (
      !raw.needsCue ||
      new RegExp(`${grammar.agoCue}(?:\\s+\\S+)?\\s*$`, "iu").test(before)
    );
  }
  if (raw.kind !== "number" || raw.era) return true;
  if (raw.digits < 3 || context.unitAfter) return false;
  return context.cue || (context.weakCue && raw.digits === 4);
}

/**
 * @param {string} before
 * @param {object} grammar
 * @returns {boolean} whether an approximation word precedes the date
 */
function isApproximate(before, grammar) {
  return endsWithWord(before, grammar.approximate);
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

/**
 * A single date, or null when its mention is partial or lacks a cue.
 *
 * @param {string} text
 * @param {{ start: number, end: number, raw: object }} mention
 * @param {object} grammar
 * @param {number} now
 * @returns {object | null}
 */
function readSingle(text, mention, grammar, now) {
  const { start, end, raw } = mention;
  if (!isComplete(raw)) return null;
  const before = text.slice(0, start);
  const context = contextOf(text, start, end, grammar);
  if (!acceptable(raw, context, before, grammar)) return null;
  const point = pointOf(raw, now);
  if (!point) return null;
  return {
    start: point,
    end: null,
    approximate: isApproximate(before, grammar),
    mention: { start, end },
  };
}

/** The zero-width joiners Wikipedia puts around the dash of a range. */
const INVISIBLE = /[\u200b-\u200d\u2060]/gu;

/** A dash between two dates, the invisible joiners Wikipedia puts around it included. */
const DASH = /^[\s\u200b-\u200d\u2060]*[-‐‑–—][\s\u200b-\u200d\u2060]*$/u;

/**
 * Two mentions read as one range, or null when they are not one.
 *
 * @param {string} text
 * @param {{ start: number, end: number, raw: object }} first
 * @param {{ start: number, end: number, raw: object } | undefined} second
 * @param {object} grammar
 * @param {number} now
 * @returns {object | null}
 */
function readRange(text, first, second, grammar, now) {
  if (!second || !isComplete(second.raw)) return null;
  const before = text.slice(0, first.start);
  const between = text.slice(first.end, second.start);
  // `978-1-4286-4988-0`: numbers chained by dashes are an ISBN, a phone
  // number, never a range.
  const chained =
    /\d\s*[-‐‑–—]\s*$/u.test(before) ||
    /^\s*[-‐‑–—]\s*\d/u.test(text.slice(second.end));
  const dash = DASH.test(between) && !chained;
  const opened = grammar.ranges.some(
    ({ open, close }) =>
      endsWithWord(before, `(?:${open})\\s*(?:(?:${grammar.articles})\\s*)?`) &&
      new RegExp(
        `^\\s*(?:${close})\\s+(?:(?:${grammar.articles})\\s*)?$`,
        "iu",
      ).test(between),
  );
  if (!dash && !opened) return null;

  let end = second.raw;
  // `1914–18`: the end keeps the start's century.
  if (
    dash &&
    first.raw.kind === "number" &&
    end.kind === "number" &&
    first.raw.digits === 4 &&
    end.digits === 2 &&
    !end.era
  ) {
    const value = first.raw.value - (first.raw.value % 100) + end.value;
    if (value <= first.raw.value) return null;
    end = { ...end, value, digits: 4 };
  }
  const start = inherit(first.raw, end);
  if (!start) return null;

  const context = contextOf(text, first.start, second.end, grammar);
  if (end.kind === "number" && !end.era) {
    // Two bare years: a range is a cue, but `10 to 15 km` is not one.
    const digitsOk = start.digits >= 3 && end.digits >= 3;
    const bothFull = start.digits === 4 && end.digits === 4;
    if (!digitsOk || context.unitAfter) return null;
    if (!(opened || context.cue || bothFull)) return null;
  } else if (
    !acceptable(start, context, before, grammar) ||
    !acceptable(end, context, before, grammar)
  ) {
    return null;
  }

  const startPoint = pointOf(start, now);
  const endPoint = pointOf(end, now);
  if (!startPoint || !endPoint) return null;
  if (startPoint.date.isAfter(endPoint.date)) return null;
  return {
    start: startPoint,
    end: endPoint,
    approximate: isApproximate(before, grammar),
    mention: { start: first.start, end: second.end },
  };
}

/* ------------------------------------------------------------------ */
/* Sentences and links                                                */
/* ------------------------------------------------------------------ */

/**
 * Where the sentences of the text start and end. A full stop ends one when
 * an upper-case letter, a digit or an opening quote follows, unless it ends
 * an abbreviation or an initial (`av.`, `c.`, `J. R. R.`); one that ends a
 * date (`av. J.-C.`) does end the sentence.
 *
 * @param {string} text
 * @param {object[]} events their `mention` spans are never cut
 * @param {object} grammar
 * @returns {{ start: number, end: number }[]} trimmed of white space
 */
function sentencesOf(text, events, grammar) {
  const cuts = [0];
  for (const match of text.matchAll(
    /[.!?…]+["»”)]*\s+(?=[\p{Lu}\p{N}«"“(])/gu,
  )) {
    const stop = match.index;
    const inside = events.some(
      ({ mention }) => stop >= mention.start && stop < mention.end - 1,
    );
    if (inside) continue;
    const endsDate = events.some(({ mention }) => stop === mention.end - 1);
    const word = /([\p{L}.]+)$/u.exec(text.slice(0, stop))?.[1] ?? "";
    const bare = word.replace(/^\.+/, "").toLowerCase();
    const abbreviation =
      grammar.abbreviations.has(bare) || /^\p{L}$/u.test(bare);
    if (abbreviation && !endsDate) continue;
    cuts.push(match.index + match[0].length);
  }
  cuts.push(text.length);

  const sentences = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let start = cuts[i];
    let end = cuts[i + 1];
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) sentences.push({ start, end });
  }
  return sentences;
}

/**
 * @param {Block} block
 * @param {{ start: number, end: number }} span
 * @returns {{ text: string, links: Link[] }} the sentence's text and the
 *   links wholly inside it, their offsets into the sentence
 */
function sentenceOf(block, span) {
  return {
    text: block.text.slice(span.start, span.end),
    links: block.links
      .filter((link) => link.start >= span.start && link.end <= span.end)
      .map((link) => ({
        start: link.start - span.start,
        end: link.end - span.start,
        href: link.href,
      })),
  };
}

/**
 * The URL an event leads to: the link of its sentence nearest the date,
 * leaving out links written over a date; failing one, the page at the
 * block's section.
 *
 * @param {Block} block
 * @param {{ start: number, end: number }} sentence
 * @param {{ start: number, end: number }} mention
 * @param {{ start: number, end: number }[]} dateSpans
 * @param {string} pageUrl
 * @returns {string}
 */
function linkOf(block, sentence, mention, dateSpans, pageUrl) {
  const overlaps = (link, span) =>
    link.start < span.end && span.start < link.end;
  let best = null;
  let bestDistance = Infinity;
  for (const link of block.links) {
    if (link.start < sentence.start || link.end > sentence.end) continue;
    if (dateSpans.some((span) => overlaps(link, span))) continue;
    const distance =
      link.end <= mention.start
        ? mention.start - link.end
        : Math.max(link.start - mention.end, 0);
    if (distance < bestDistance) {
      best = link;
      bestDistance = distance;
    }
  }
  if (best) return best.href;
  return block.section ? `${pageUrl}#${block.section}` : pageUrl;
}
