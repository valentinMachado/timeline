/**
 * The reader's timeline in `chrome.storage.local`, one key per object as
 * `myTimeline.js` lays it out. Reached alike from a content script, which
 * adds what the reader picks on a page, and from the timeline's own page.
 *
 * Nothing is cached but photos: another tab may change the timeline at any
 * time, and `onTimelineChange` tells every page when it does.
 */

import {
  backupOf,
  keyOf,
  mergeBackup,
  newLayer,
  orphanPhotos,
  parseKey,
} from "../shared/myTimeline.js";

const local = chrome.storage.local;

/**
 * Every key of the timeline, without reading the values: `getKeys` where the
 * browser has it, so that listing never loads the photos; failing it, every
 * value is read once.
 *
 * @returns {Promise<{ key: string, kind: string, id: string }[]>}
 */
async function storedKeys() {
  const keys = local.getKeys
    ? await local.getKeys()
    : Object.keys(await local.get(null));
  return keys
    .map((key) => ({ key, ...parseKey(key) }))
    .filter(({ kind }) => kind);
}

/**
 * @returns {string} a new id, unique across devices so backups merge
 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * The layers and the entries, without the photos.
 *
 * @returns {Promise<{ layers: import("../shared/myTimeline.js").Layer[],
 *   entries: import("../shared/myTimeline.js").Entry[] }>}
 */
export async function loadTimeline() {
  const keys = (await storedKeys()).filter(({ kind }) => kind !== "photo");
  const values = keys.length ? await local.get(keys.map(({ key }) => key)) : {};
  const of = (kind) =>
    keys.filter((k) => k.kind === kind).map(({ key }) => values[key]);
  return {
    layers: of("layer").sort((a, b) => a.name.localeCompare(b.name)),
    entries: of("entry"),
  };
}

/**
 * The layers there are, the default one made first when there is none, so
 * that an entry always has somewhere to go.
 *
 * @returns {Promise<import("../shared/myTimeline.js").Layer[]>}
 */
export async function layersOrDefault() {
  const { layers } = await loadTimeline();
  if (layers.length) return layers;
  const layer = newLayer({
    id: newId(),
    name: chrome.i18n.getMessage("defaultLayerName"),
    count: 0,
    now: Date.now(),
  });
  await saveLayer(layer);
  return [layer];
}

/**
 * Stores an entry and, when it shows a new photo, the photo with it: in one
 * write, so that no other tab clears the photo as unused in between.
 *
 * @param {import("../shared/myTimeline.js").Entry} entry
 * @param {string | null} [photo] the data URL of `entry.image.photo`, when
 *   it is new
 */
export async function saveEntry(entry, photo = null) {
  const writes = { [keyOf("entry", entry.id)]: entry };
  if (photo && entry.image?.photo) {
    writes[keyOf("photo", entry.image.photo)] = photo;
  }
  await local.set(writes);
  await prunePhotos();
}

/**
 * @param {string} id
 */
export async function deleteEntry(id) {
  await local.remove(keyOf("entry", id));
  await prunePhotos();
}

/**
 * @param {import("../shared/myTimeline.js").Layer} layer
 */
export async function saveLayer(layer) {
  await local.set({ [keyOf("layer", layer.id)]: layer });
}

/**
 * Deletes a layer and every entry in it.
 *
 * @param {string} id
 */
export async function deleteLayer(id) {
  const { entries } = await loadTimeline();
  await local.remove([
    keyOf("layer", id),
    ...entries.filter((e) => e.layer === id).map((e) => keyOf("entry", e.id)),
  ]);
  await prunePhotos();
}

/** Each photo read so far, by id: a photo never changes once stored. */
const photos = new Map();

/**
 * @param {string} id
 * @returns {Promise<string | null>} its data URL, null when it is gone
 */
export function loadPhoto(id) {
  if (!photos.has(id)) {
    const key = keyOf("photo", id);
    photos.set(
      id,
      local.get(key).then((values) => values[key] ?? null),
    );
  }
  return photos.get(id);
}

/** Deletes the photos no entry shows any more. */
async function prunePhotos() {
  const keys = await storedKeys();
  const ids = keys.filter(({ kind }) => kind === "photo").map(({ id }) => id);
  if (!ids.length) return;
  const { entries } = await loadTimeline();
  const orphans = orphanPhotos(ids, entries);
  if (orphans.length)
    await local.remove(orphans.map((id) => keyOf("photo", id)));
}

/**
 * The whole timeline as a file, photos included.
 *
 * @returns {Promise<import("../shared/myTimeline.js").Backup>}
 */
export async function exportBackup() {
  const { layers, entries } = await loadTimeline();
  const keys = (await storedKeys()).filter(({ kind }) => kind === "photo");
  const values = keys.length ? await local.get(keys.map(({ key }) => key)) : {};
  const photoData = Object.fromEntries(
    keys.map(({ key, id }) => [id, values[key]]),
  );
  return backupOf({ layers, entries, photos: photoData });
}

/**
 * Merges a backup into the timeline: adds what is missing, replaces what is
 * older, deletes nothing.
 *
 * @param {unknown} backup the parsed file
 * @returns {Promise<number>} how many objects were written
 * @throws {TypeError} when the file is not a backup
 */
export async function importBackup(backup) {
  const keys = await storedKeys();
  const values = keys.length ? await local.get(keys.map(({ key }) => key)) : {};
  const writes = mergeBackup(values, backup);
  const count = Object.keys(writes).length;
  if (count) await local.set(writes);
  return count;
}

/**
 * Calls back whenever the timeline changes, in this tab or another.
 *
 * @param {() => void} callback
 */
export function onTimelineChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Object.keys(changes).some(parseKey)) callback();
  });
}
