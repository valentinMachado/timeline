/**
 * The reader's own timeline: its events (entries), the layers they are
 * sorted into, and the photos the reader adds. Pure: what is stored, how it
 * is checked, how a backup merges; `src/ui/store.js` keeps it in
 * `chrome.storage.local`.
 *
 * Every object is stored under a key of its own (`entry:<id>`,
 * `layer:<id>`, `photo:<id>`), so that two tabs adding at once never
 * overwrite each other, and listing the entries never loads the photos.
 * An entry is in exactly one layer; its tags cut across layers.
 */

import { TimelineDate } from "./TimelineDate.js";
import { LANGUAGES, PRECISIONS, extractEvents } from "./dateExtraction.js";
import { safeUrl } from "./richText.js";

/**
 * @typedef {object} PointJson
 * @property {number} year astronomical: 0 is 1 BC
 * @property {number} month 0-based
 * @property {number} day
 * @property {string} precision one of `PRECISIONS`
 */

/**
 * @typedef {{ summary: string, fallback: string | null }
 *   | { url: string }
 *   | { photo: string }} Image
 * The picture of an entry: the thumbnail of a Wikipedia article (and the
 * picture to show when it has none), a picture online, or a local photo.
 */

/**
 * @typedef {object} Entry
 * @property {string} id
 * @property {string} layer the id of its layer
 * @property {PointJson} start
 * @property {PointJson | null} end null unless it is a range
 * @property {boolean} approximate
 * @property {string} written its date as written: the label it shows
 * @property {string} title
 * @property {string | null} link where its card leads, an http(s) URL
 * @property {import("./richText.js").RichText} description
 * @property {Image | null} image
 * @property {string[]} tags
 * @property {{ url: string, title: string } | null} source the page it was
 *   added from
 * @property {number} updated when it last changed, in milliseconds: the
 *   newer copy wins when a backup is merged
 */

/**
 * @typedef {object} Layer
 * @property {string} id
 * @property {string} name
 * @property {string} color `#rrggbb`
 * @property {boolean} hidden
 * @property {number} updated
 */

/** The colours new layers take in turn: distinct in light and dark themes. */
export const LAYER_COLORS = Object.freeze([
  "#3366cc",
  "#d33f2e",
  "#14866d",
  "#ac6600",
  "#8a3fb8",
  "#2a8fa6",
]);

/** The longest side of a stored photo, in pixels: sharp on a card, light. */
export const PHOTO_MAX_SIZE = 1024;

/** What a backup file says it is, to refuse any other JSON. */
export const BACKUP_FORMAT = "timeline-backup";

/** The backup layout this code writes and reads. */
export const BACKUP_VERSION = 1;

/** The storage key of each kind of object, by prefix. */
const PREFIXES = { entry: "entry:", layer: "layer:", photo: "photo:" };

/**
 * @param {"entry" | "layer" | "photo"} kind
 * @param {string} id
 * @returns {string} the storage key of that object
 */
export function keyOf(kind, id) {
  return PREFIXES[kind] + id;
}

/**
 * @param {string} key a storage key
 * @returns {{ kind: "entry" | "layer" | "photo", id: string } | null} null
 *   for a key that is not the timeline's
 */
export function parseKey(key) {
  for (const [kind, prefix] of Object.entries(PREFIXES)) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return { kind, id: key.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * @param {import("./dateExtraction.js").Point} point
 * @returns {PointJson}
 */
export function pointToJson({ date, precision }) {
  return { year: date.year, month: date.month, day: date.day, precision };
}

/**
 * @param {PointJson} json
 * @returns {import("./dateExtraction.js").Point}
 * @throws {RangeError} when the day does not exist or the precision is
 *   unknown
 */
export function pointFromJson({ year, month, day, precision }) {
  if (!PRECISIONS.includes(precision)) {
    throw new RangeError(`Unknown precision: ${precision}`);
  }
  return { date: new TimelineDate(year, month, day), precision };
}

/**
 * An entry seen as an event of a page: what `spanOf` and the weights read.
 *
 * @param {Entry} entry
 * @returns {{ start: import("./dateExtraction.js").Point,
 *   end: import("./dateExtraction.js").Point | null, approximate: boolean }}
 */
export function eventOfEntry(entry) {
  return {
    start: pointFromJson(entry.start),
    end: entry.end ? pointFromJson(entry.end) : null,
    approximate: entry.approximate,
  };
}

/**
 * @typedef {object} ReadDate
 * @property {PointJson} start
 * @property {PointJson | null} end
 * @property {boolean} approximate
 * @property {string} written
 */

/**
 * Reads the date the reader wrote or selected, as a page would write it
 * (`14 juillet 1789`, `1914–1918`, `500 av. J.-C.`), a bare year accepted.
 * Every language is tried and the longest reading kept, so that
 * `July 14, 1789` is a day in English rather than a bare year in French.
 *
 * @param {string} text
 * @param {object} options
 * @param {string[]} options.languages the languages to prefer, in order,
 *   between readings of the same length: the page's or the reader's first
 * @param {number} options.now the current year
 * @returns {ReadDate | null} the date found, null when none is
 */
export function readDate(text, { languages, now }) {
  const order = [...new Set([...languages, ...LANGUAGES])].filter((language) =>
    LANGUAGES.includes(language),
  );
  let best = null;
  for (const language of order) {
    const [event] = extractEvents(
      { text, links: [], section: null },
      { language, pageUrl: "", now, lenient: true },
    );
    const length = event ? event.mention.end - event.mention.start : 0;
    if (event && (!best || length > best.length)) best = { event, length };
  }
  return best && datePartOf(best.event);
}

/**
 * @param {import("./dateExtraction.js").TimelineEvent} event
 * @returns {ReadDate}
 */
export function datePartOf(event) {
  return {
    start: pointToJson(event.start),
    end: event.end ? pointToJson(event.end) : null,
    approximate: event.approximate,
    written: event.written,
  };
}

/**
 * Cuts what the reader typed into tags: comma-separated, trimmed, each
 * once whatever its case, the first spelling kept.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parseTags(source) {
  const seen = new Set();
  const tags = [];
  for (const raw of source.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ");
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * @param {Entry[]} entries
 * @returns {string[]} every tag used, each once, sorted
 */
export function tagsOf(entries) {
  return parseTags(entries.flatMap((entry) => entry.tags).join(",")).sort(
    (a, b) => a.localeCompare(b),
  );
}

/**
 * The entries the reader sees: those of a shown layer and, when tags are
 * picked, those carrying at least one of them.
 *
 * @param {Entry[]} entries
 * @param {Layer[]} layers
 * @param {string[]} [tags] the tags picked; none shows every entry
 * @returns {Entry[]}
 */
export function visibleEntries(entries, layers, tags = []) {
  const shown = new Set(layers.filter((l) => !l.hidden).map((l) => l.id));
  const picked = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  return entries.filter(
    (entry) =>
      shown.has(entry.layer) &&
      (!picked.size ||
        entry.tags.some((tag) => picked.has(tag.toLocaleLowerCase()))),
  );
}

/**
 * A new layer, its colour the next of {@link LAYER_COLORS}.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.name
 * @param {number} options.count how many layers there are already
 * @param {number} options.now in milliseconds
 * @returns {Layer}
 */
export function newLayer({ id, name, count, now }) {
  return {
    id,
    name,
    color: LAYER_COLORS[count % LAYER_COLORS.length],
    hidden: false,
    updated: now,
  };
}

/**
 * The size a photo is stored at: its longest side at most `max`, its
 * proportions kept, never enlarged.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{ width: number, height: number }} whole pixels, at least 1
 */
export function scaledSize(width, height, max = PHOTO_MAX_SIZE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/* ------------------------------------------------------------------ */
/* Checking what comes from a file                                    */
/* ------------------------------------------------------------------ */

const isText = (value) => typeof value === "string";
const isId = (value) => isText(value) && /^[\w-]{1,64}$/.test(value);

/**
 * @param {unknown} json
 * @returns {PointJson | null}
 */
function checkPoint(json) {
  if (!json || typeof json !== "object") return null;
  const { year, month, day, precision } = json;
  if (![year, month, day].every(Number.isInteger)) return null;
  try {
    return pointToJson(pointFromJson({ year, month, day, precision }));
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * @param {unknown} json
 * @returns {Image | null}
 */
function checkImage(json) {
  if (!json || typeof json !== "object") return null;
  if (isText(json.summary) && safeUrl(json.summary)) {
    return { summary: json.summary, fallback: safeUrl(json.fallback ?? "") };
  }
  if (isText(json.url) && safeUrl(json.url)) return { url: json.url };
  if (isId(json.photo)) return { photo: json.photo };
  return null;
}

/**
 * @param {unknown} json
 * @returns {import("./richText.js").RichText}
 */
function checkRichText(json) {
  const text = isText(json?.text) ? json.text : "";
  const links = Array.isArray(json?.links)
    ? json.links.filter(
        (link) =>
          Number.isInteger(link?.start) &&
          Number.isInteger(link?.end) &&
          isText(link.href) &&
          safeUrl(link.href),
      )
    : [];
  return {
    text,
    links: links.map(({ start, end, href }) => ({ start, end, href })),
  };
}

/**
 * An entry read from a file, its fields checked one by one, or null when
 * it cannot be drawn (no id, no layer, no valid date).
 *
 * @param {unknown} json
 * @returns {Entry | null}
 */
export function checkEntry(json) {
  if (!json || typeof json !== "object") return null;
  const start = checkPoint(json.start);
  const end = json.end == null ? null : checkPoint(json.end);
  if (!isId(json.id) || !isId(json.layer) || !start) return null;
  if (json.end != null && !end) return null;
  const source =
    isText(json.source?.url) && safeUrl(json.source.url)
      ? {
          url: json.source.url,
          title: isText(json.source.title) ? json.source.title : "",
        }
      : null;
  return {
    id: json.id,
    layer: json.layer,
    start,
    end,
    approximate: json.approximate === true,
    written: isText(json.written) ? json.written : "",
    title: isText(json.title) ? json.title : "",
    link: isText(json.link) ? safeUrl(json.link) : null,
    description: checkRichText(json.description),
    image: checkImage(json.image),
    tags: Array.isArray(json.tags)
      ? parseTags(json.tags.filter(isText).join(","))
      : [],
    source,
    updated: Number.isFinite(json.updated) ? json.updated : 0,
  };
}

/**
 * @param {unknown} json
 * @returns {Layer | null}
 */
export function checkLayer(json) {
  if (!json || typeof json !== "object" || !isId(json.id)) return null;
  return {
    id: json.id,
    name: isText(json.name) ? json.name : "",
    color:
      isText(json.color) && /^#[0-9a-f]{6}$/i.test(json.color)
        ? json.color
        : LAYER_COLORS[0],
    hidden: json.hidden === true,
    updated: Number.isFinite(json.updated) ? json.updated : 0,
  };
}

/** What a stored photo may be: a JPEG, PNG or WebP data URL. */
const PHOTO = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/* ------------------------------------------------------------------ */
/* Backups                                                            */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Backup
 * @property {string} format {@link BACKUP_FORMAT}
 * @property {number} version {@link BACKUP_VERSION}
 * @property {Layer[]} layers
 * @property {Entry[]} entries
 * @property {Record<string, string>} photos data URLs by id
 */

/**
 * The file a timeline is exported to, photos included, so that a timeline
 * kept on a phone reaches a computer whole.
 *
 * @param {{ layers: Layer[], entries: Entry[],
 *   photos: Record<string, string> }} timeline
 * @returns {Backup}
 */
export function backupOf({ layers, entries, photos }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    layers,
    entries,
    photos,
  };
}

/**
 * What importing a backup writes: every object the timeline does not have,
 * and every one the backup holds a newer copy of. Nothing is deleted, so
 * importing twice, or the backup of another device, loses nothing.
 *
 * @param {Record<string, { updated?: number }>} current the stored objects
 *   by key; a photo's value is not read
 * @param {unknown} backup the parsed file
 * @returns {Record<string, unknown>} the objects to store, by key
 * @throws {TypeError} when the file is not a backup of this format
 */
export function mergeBackup(current, backup) {
  if (backup?.format !== BACKUP_FORMAT || !Number.isInteger(backup.version)) {
    throw new TypeError("Not a timeline backup");
  }
  if (backup.version > BACKUP_VERSION) {
    throw new TypeError(`Backup version ${backup.version} is too new`);
  }
  const writes = {};
  const offer = (kind, object) => {
    const key = keyOf(kind, object.id);
    const mine = current[key];
    if (!mine || (mine.updated ?? 0) < object.updated) writes[key] = object;
  };
  const list = (value) => (Array.isArray(value) ? value : []);
  list(backup.layers)
    .map(checkLayer)
    .filter(Boolean)
    .forEach((layer) => {
      offer("layer", layer);
    });
  const layers = new Set(
    Object.keys({ ...current, ...writes })
      .map(parseKey)
      .filter((parsed) => parsed?.kind === "layer")
      .map(({ id }) => id),
  );
  for (const entry of list(backup.entries).map(checkEntry)) {
    // An entry whose layer is nowhere could never be shown.
    if (entry && layers.has(entry.layer)) offer("entry", entry);
  }
  const photos =
    backup.photos && typeof backup.photos === "object" ? backup.photos : {};
  for (const [id, data] of Object.entries(photos)) {
    // A photo never changes once stored: its id is new for every photo.
    if (isId(id) && isText(data) && PHOTO.test(data)) {
      const key = keyOf("photo", id);
      if (!(key in current)) writes[key] = data;
    }
  }
  return writes;
}

/**
 * The photos no entry shows any more, to delete them with their last
 * entry.
 *
 * @param {string[]} photoIds the stored photos
 * @param {Entry[]} entries every entry
 * @returns {string[]}
 */
export function orphanPhotos(photoIds, entries) {
  const used = new Set(entries.map((entry) => entry.image?.photo));
  return photoIds.filter((id) => !used.has(id));
}
