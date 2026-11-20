/**
 * The description of an event as the reader writes it: plain text where a
 * link is written `[its text](https://…)`, the way Markdown writes one. It is
 * kept as `{ text, links }`, the shape of the sentence an event of a page is
 * read in, so a sentence copied from a page and a description written by
 * hand are one thing, drawn and edited alike.
 *
 * Only `http:` and `https:` links are kept: a description may come from an
 * imported file, and a `javascript:` link drawn on a page would run.
 */

/**
 * @typedef {object} RichText
 * @property {string} text what is read, links' targets left out
 * @property {import("./dateExtraction.js").Link[]} links in the order of the
 *   text, offsets into `text`
 */

/** `[text](url)`, the text without brackets, the URL without spaces. */
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * @param {string} href
 * @returns {string | null} the URL made absolute, null unless it is an
 *   `http:` or `https:` one
 */
export function safeUrl(href) {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads what the reader wrote. A link whose URL is not a web address stays
 * as written, brackets and all, so nothing typed is lost.
 *
 * @param {string} source
 * @returns {RichText}
 */
export function parseRichText(source) {
  let text = "";
  const links = [];
  let last = 0;
  for (const match of source.matchAll(LINK)) {
    const href = safeUrl(match[2]);
    if (!href) continue;
    text += source.slice(last, match.index);
    const start = text.length;
    text += match[1];
    links.push({ start, end: text.length, href });
    last = match.index + match[0].length;
  }
  text += source.slice(last);
  return { text, links };
}

/**
 * Writes a description back as the reader would type it: the inverse of
 * {@link parseRichText} for every link it would keep.
 *
 * @param {RichText} rich
 * @returns {string}
 */
export function formatRichText({ text, links }) {
  let source = "";
  let last = 0;
  for (const { start, end, href } of validLinks(text, links)) {
    source += text.slice(last, start) + `[${text.slice(start, end)}](${href})`;
    last = end;
  }
  return source + text.slice(last);
}

/**
 * The text cut into what is plain and what is a link, for drawing it.
 *
 * @param {RichText} rich
 * @returns {{ text: string, href: string | null }[]} in order, never empty
 *   pieces
 */
export function richTextPieces({ text, links }) {
  const pieces = [];
  let last = 0;
  for (const { start, end, href } of validLinks(text, links)) {
    if (start > last)
      pieces.push({ text: text.slice(last, start), href: null });
    pieces.push({ text: text.slice(start, end), href });
    last = end;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), href: null });
  return pieces;
}

/**
 * The links that can be drawn: inside the text, not empty, not overlapping
 * the one before, with a web address.
 *
 * @param {string} text
 * @param {import("./dateExtraction.js").Link[]} links
 * @returns {import("./dateExtraction.js").Link[]}
 */
function validLinks(text, links) {
  const kept = [];
  let last = 0;
  for (const link of [...links].sort((a, b) => a.start - b.start)) {
    const href = safeUrl(link.href);
    if (!href || link.start < last || link.end > text.length) continue;
    if (link.end <= link.start) continue;
    kept.push({ ...link, href });
    last = link.end;
  }
  return kept;
}
