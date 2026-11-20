/**
 * How each language writes a date, as tables the extraction reads
 * (`dateExtraction.js`). A language is one entry of {@link GRAMMARS}; adding
 * one adds an entry, never a branch in the extraction.
 *
 * A grammar's `forms` find raw mentions: a piece of text that names a date
 * or part of one. A raw mention is one of these shapes, `era` being `"BC"`,
 * `"AD"` or undefined when the text gives none:
 *
 * - `{ kind: "calendar", day?, month, year?, yearDigits?, era? }`, month
 *   0-based: `14 juillet 1789`, `July 1789`, or a partial `14 July`;
 * - `{ kind: "number", value, digits, era? }`: `1789`, `52 av. J.-C.`, or a
 *   number only a range can make a date of;
 * - `{ kind: "ordinal", n, unit?, era? }`, unit `"century"` or
 *   `"millennium"`; without one it is the partial start of a range
 *   (`du XVe au XVIIe siècle`);
 * - `{ kind: "decade", year, century }`: `années 1960`, `1960s`; `century`
 *   is true for `the 1800s`, which names a century in English;
 * - `{ kind: "ago", value, scale, needsCue }`: `66 Ma`, or `66 millions
 *   d'années` which only counts back from today after `il y a`.
 */

/** No letter or digit before, nor the digit of a decimal (`4,5`, `65.5`). */
const BEFORE = String.raw`(?<![\p{L}\p{N}])(?<!\p{N}[,.])`;

/** No letter or digit after: `1960` is not read inside `1960s`. */
const AFTER = String.raw`(?![\p{L}\p{N}])`;

/**
 * @param {string} text
 * @returns {string} `text` as a regular expression source matching itself
 */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A form: a regular expression that finds one shape of mention, and how to
 * read its named groups into a raw mention.
 *
 * @param {string} source
 * @param {(groups: object) => object | null} read null refuses the match
 * @returns {{ regex: RegExp, read: (groups: object) => object | null }}
 */
function form(source, read) {
  return {
    regex: new RegExp(BEFORE + "(?:" + source + ")" + AFTER, "gu"),
    read,
  };
}

/**
 * The era group of a form, one alternative per spelling.
 *
 * @param {string[]} bc
 * @param {string[]} ad
 * @returns {string}
 */
function eraSource(bc, ad) {
  return `(?<bc>${bc.join("|")})|(?<ad>${ad.join("|")})`;
}

/**
 * @param {object} groups
 * @returns {"BC" | "AD" | undefined}
 */
function eraOf(groups) {
  if (groups.bc) return "BC";
  if (groups.ad || groups.adBefore) return "AD";
  return undefined;
}

/**
 * The month table of a language: a regular expression source matching any
 * spelling, and the lookup from a spelling to the 0-based month.
 *
 * @param {string[][]} spellings the spellings of each month, January first
 * @param {boolean} anyCase whether a capital first letter is also read
 * @returns {{ source: string, index: (name: string) => number }}
 */
function monthTable(spellings, anyCase) {
  const lookup = new Map();
  const sources = [];
  spellings.forEach((names, month) => {
    for (const name of names) {
      lookup.set(name.toLowerCase(), month);
      const first = escape(name[0]);
      const head = anyCase ? `[${first}${first.toUpperCase()}]` : first;
      sources.push(head + escape(name.slice(1)));
    }
  });
  // Longest first, so `Sept.` is not read as `Sep` then a stray dot.
  sources.sort((a, b) => b.length - a.length);
  return {
    source: sources.join("|"),
    index: (name) => lookup.get(name.toLowerCase()),
  };
}

/**
 * @param {string} text a Roman numeral, upper case
 * @returns {number | null} its value, or null when it is not written the
 *   canonical way (`IIII`, `VX`)
 */
function romanValue(text) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const value = values[text[i]];
    const next = values[text[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return toRoman(total) === text ? total : null;
}

/**
 * @param {number} value 1 to 399
 * @returns {string}
 */
function toRoman(value) {
  const steps = [
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let text = "";
  for (const [step, numeral] of steps) {
    while (value >= step) {
      text += numeral;
      value -= step;
    }
  }
  return text;
}

/**
 * Years a unit of deep time stands for, and the precision it gives. A plain
 * year count (`il y a 10 000 ans`) is precise to the year.
 */
const SCALES = {
  year: { scale: 1, precision: "year" },
  thousand: { scale: 1e3, precision: "kyr" },
  million: { scale: 1e6, precision: "Myr" },
  billion: { scale: 1e9, precision: "Gyr" },
};

/**
 * @param {string} value a number as written, already stripped of its
 *   grouping and with a dot for its decimal point
 * @param {keyof typeof SCALES} unit
 * @param {boolean} needsCue
 * @returns {object} an `ago` raw mention
 */
function ago(value, unit, needsCue) {
  return { kind: "ago", value: Number(value), ...SCALES[unit], needsCue };
}

/**
 * @param {string} digits
 * @param {"BC" | "AD" | undefined} era
 * @returns {object} a `number` raw mention
 */
function number(digits, era) {
  return { kind: "number", value: Number(digits), digits: digits.length, era };
}

/**
 * @param {{ index: (name: string) => number }} months
 * @param {object} groups
 * @param {(day: string) => number} dayOf
 * @returns {object} a `calendar` raw mention
 */
function calendar(months, groups, dayOf) {
  return {
    kind: "calendar",
    day: groups.day === undefined ? undefined : dayOf(groups.day),
    month: months.index(groups.month),
    year: groups.year === undefined ? undefined : Number(groups.year),
    yearDigits: groups.year?.length,
    era: eraOf(groups),
  };
}

/* ------------------------------------------------------------------ */
/* French                                                             */
/* ------------------------------------------------------------------ */

const FR_MONTHS = monthTable(
  [
    ["janvier", "janv."],
    ["février", "fevrier", "févr."],
    ["mars"],
    ["avril", "avr."],
    ["mai"],
    ["juin"],
    ["juillet", "juil."],
    ["août", "aout"],
    ["septembre", "sept."],
    ["octobre", "oct."],
    ["novembre", "nov."],
    ["décembre", "decembre", "déc."],
  ],
  true,
);

const JC = String.raw`J\.?\s?-?\s?C\.?`;
const FR_ERA = eraSource(
  [
    String.raw`av\.\s?${JC}`,
    String.raw`avant\s+${JC}`,
    String.raw`avant\s+Jésus-Christ`,
    String.raw`avant\s+notre\s+ère`,
    String.raw`av\.\s?n\.\s?è\.?`,
    "AEC",
  ],
  [
    String.raw`apr\.\s?${JC}`,
    String.raw`ap\.\s?${JC}`,
    String.raw`après\s+${JC}`,
    String.raw`après\s+Jésus-Christ`,
    String.raw`de\s+notre\s+ère`,
    "EC",
  ],
);

/** French groups thousands with a (narrow) no-break space, decimals with a comma. */
const FR_NUMBER = String.raw`\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

/**
 * @param {string} text
 * @returns {string}
 */
function frNumber(text) {
  return text.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
}

const FR_SCALES = {
  mille: "thousand",
  million: "million",
  millions: "million",
  milliard: "billion",
  milliards: "billion",
};

const FR = {
  forms: [
    form(
      String.raw`(?:(?<day>1er|\d{1,2})\s+)?(?<month>${FR_MONTHS.source})(?:\s+(?<year>\d{1,4})(?!\d|[,.]\d)(?:\s+(?:${FR_ERA}))?)?`,
      (g) => calendar(FR_MONTHS, g, (day) => (day === "1er" ? 1 : Number(day))),
    ),
    form(
      String.raw`(?<n>[IVXLC]+|\d{1,2})(?:er|re|ère|e|ème)(?:\s+(?<unit>siècles?|millénaires?))?(?:\s+(?:${FR_ERA}))?`,
      (g) => {
        const n = /\d/.test(g.n) ? Number(g.n) : romanValue(g.n);
        if (!n) return null;
        const unit =
          g.unit && (g.unit.startsWith("s") ? "century" : "millennium");
        return { kind: "ordinal", n, unit, era: eraOf(g) };
      },
    ),
    form(String.raw`[aA]nnées\s+(?<year>\d{3}0)`, (g) => ({
      kind: "decade",
      year: Number(g.year),
      century: false,
    })),
    form(
      String.raw`(?<n>${FR_NUMBER})\s+(?:(?<scale>mille|millions?|milliards?)\s+)?(?:d['’]années|ans)`,
      (g) => ago(frNumber(g.n), g.scale ? FR_SCALES[g.scale] : "year", true),
    ),
    form(String.raw`(?<n>${FR_NUMBER})\s?(?<unit>ka|Ma|Ga)`, (g) =>
      ago(frNumber(g.n), UNIT_SCALES[g.unit], false),
    ),
    form(String.raw`(?<n>\d{1,4})(?![,.]\d)(?:\s+(?:${FR_ERA}))?`, (g) =>
      number(g.n, eraOf(g)),
    ),
  ],
  yearCues: String.raw`en|dès|depuis|vers|v\.|jusqu['’]en|avant|après|l['’]an|année|circa|ca\.|c\.|courant|mi-`,
  // Also before a quantity (`environ 300 hommes`): only a 4-digit year.
  weakYearCues: String.raw`de|du|environ`,
  approximate: String.raw`vers|v\.|environ|env\.|circa|ca\.|c\.|autour\s+de|aux\s+alentours\s+de`,
  agoCue: String.raw`il\s+y\s+a`,
  units: String.raw`ans|années|an|mois|jours?|semaines?|heures?|minutes?|secondes?|km|cm|mm|kilomètres?|mètres?|m|kg|tonnes?|habitants|hommes|femmes|personnes|soldats|morts|victimes|exemplaires|euros?|dollars?|francs?|livres|%|pour\s+cent|fois|pages?|voix|élèves|membres|navires|canons`,
  ranges: [
    {
      open: String.raw`de|du|des|d['’]|depuis`,
      close: String.raw`à|au|aux|jusqu['’](?:à|au|aux|en)`,
    },
    { open: "entre", close: "et" },
  ],
  articles: String.raw`le|la|les|l['’]|l['’]an`,
  abbreviations: new Set(
    "av apr ap env v c ca cf etc p pp vol n no st ste mgr mme mlle m dr pr t chap fig éd coll dir".split(
      " ",
    ),
  ),
};

/* ------------------------------------------------------------------ */
/* English                                                            */
/* ------------------------------------------------------------------ */

// Capitals only: lower-case `may` and `march` are a verb, not a month.
const EN_MONTHS = monthTable(
  [
    ["January", "Jan."],
    ["February", "Feb."],
    ["March", "Mar."],
    ["April", "Apr."],
    ["May"],
    ["June", "Jun."],
    ["July", "Jul."],
    ["August", "Aug."],
    ["September", "Sept.", "Sep."],
    ["October", "Oct."],
    ["November", "Nov."],
    ["December", "Dec."],
  ],
  false,
);

const EN_ERA = eraSource(
  ["BCE", "BC", String.raw`B\.C\.E\.`, String.raw`B\.C\.`],
  ["AD", "CE", String.raw`A\.D\.`, String.raw`C\.E\.`],
);

/** English groups thousands with a comma, decimals with a dot. */
const EN_NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

/**
 * @param {string} text
 * @returns {string}
 */
function enNumber(text) {
  return text.replace(/,/g, "");
}

/** Units of deep time, read the same in both languages. */
const UNIT_SCALES = {
  ka: "thousand",
  kya: "thousand",
  Ma: "million",
  mya: "million",
  Ga: "billion",
  bya: "billion",
};

const EN_ORDINAL_WORDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "twenty-first",
];

const EN_SUFFIX = "st|nd|rd|th";
const EN_UNIT = "century|centuries|millennium|millennia";
const EN_YEAR = String.raw`(?:,?\s+(?<year>\d{1,4})(?!\d|[,.]\d)(?:\s+(?:${EN_ERA}))?)?`;

/**
 * @param {string} unit
 * @returns {"century" | "millennium"}
 */
function enUnit(unit) {
  return unit.startsWith("cent") ? "century" : "millennium";
}

const EN = {
  forms: [
    form(
      String.raw`(?:(?<day>\d{1,2})(?:${EN_SUFFIX})?\s+(?:of\s+)?)?(?<month>${EN_MONTHS.source})${EN_YEAR}`,
      (g) => calendar(EN_MONTHS, g, Number),
    ),
    form(
      String.raw`(?<month>${EN_MONTHS.source})\s+(?<day>\d{1,2})(?!\d)(?:${EN_SUFFIX})?${EN_YEAR}`,
      (g) => calendar(EN_MONTHS, g, Number),
    ),
    form(
      String.raw`(?<n>\d{1,2})(?:${EN_SUFFIX})(?:[\s-]+(?<unit>${EN_UNIT}))?(?:\s+(?:${EN_ERA}))?`,
      (g) => ({
        kind: "ordinal",
        n: Number(g.n),
        unit: g.unit && enUnit(g.unit),
        era: eraOf(g),
      }),
    ),
    form(
      String.raw`(?<word>(?:${EN_ORDINAL_WORDS.join("|")}))[\s-]+(?<unit>${EN_UNIT})(?:\s+(?:${EN_ERA}))?`,
      (g) => ({
        kind: "ordinal",
        n: EN_ORDINAL_WORDS.indexOf(g.word.toLowerCase()) + 1,
        unit: enUnit(g.unit),
        era: eraOf(g),
      }),
    ),
    form(String.raw`(?<year>\d{2,3}0)['’]?s`, (g) => {
      const year = Number(g.year);
      // `the 1800s` is a century; `the 2000s`, a decade.
      const century = year % 100 === 0 && year % 1000 !== 0;
      return { kind: "decade", year, century };
    }),
    form(
      String.raw`(?<n>${EN_NUMBER})[\s-]+(?:(?<scale>thousand|million|billion)[\s-]+)?years?\s+ago`,
      (g) => ago(enNumber(g.n), g.scale ?? "year", false),
    ),
    form(String.raw`(?<n>${EN_NUMBER})\s?(?<unit>ka|kya|Ma|mya|Ga|bya)`, (g) =>
      ago(enNumber(g.n), UNIT_SCALES[g.unit], false),
    ),
    form(
      String.raw`(?:(?<adBefore>AD|A\.D\.)\s+)?(?<n>\d{1,4})(?![,.]\d)(?:\s+(?:${EN_ERA}))?`,
      (g) => number(g.n, eraOf(g)),
    ),
  ],
  yearCues: String.raw`in|since|by|until|till|before|after|during|circa|c\.|ca\.|year|r\.|early|late|mid-?`,
  // Also before a quantity (`about 300 rebels`): only a 4-digit year.
  weakYearCues: "of|around|about",
  approximate: String.raw`c\.|ca\.|circa|around|about|approximately|roughly|some`,
  agoCue: null,
  units: String.raw`years?|months?|days?|weeks?|hours?|minutes?|seconds?|km|cm|mm|lbs?|kilometres?|kilometers?|miles?|metres?|meters?|m|kg|tons?|tonnes?|ft|feet|people|men|women|soldiers|troops|inhabitants|deaths|dead|casualties|copies|dollars|pounds|%|percent|per\s+cent|times|pages?|votes|students|members|ships|guns`,
  ranges: [
    { open: "from", close: String.raw`to|until|till|through` },
    { open: "between", close: "and" },
  ],
  articles: "the",
  abbreviations: new Set(
    "c ca cf etc p pp vol no st mr mrs ms dr jr sr vs e.g i.e fig ed r".split(
      " ",
    ),
  ),
};

/**
 * The grammars, by language code: the subdomain of the Wikipedia the page
 * belongs to (`fr.wikipedia.org`).
 */
export const GRAMMARS = { fr: FR, en: EN };
