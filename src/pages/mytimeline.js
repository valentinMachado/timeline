/**
 * The reader's own timeline, in a page of the extension: the entries of the
 * shown layers drawn on a timeline coloured by layer, the layers to show,
 * hide, rename, recolour or delete, a filter by tag, the list of entries,
 * and the backup file to export or import.
 *
 * The page keeps no copy of its own beyond what it last loaded: every change,
 * here or in another tab, comes back through `onTimelineChange` and redraws
 * it whole.
 */

import {
  eventOfEntry,
  newLayer,
  passageOf,
  tagsOf,
  visibleEntries,
} from "../shared/myTimeline.js";
import { richTextPieces } from "../shared/richText.js";
import { spanOf, weightOfEntry } from "../shared/timelineLayout.js";
import { FORM_STYLE, openEntryForm } from "../ui/entryForm.js";
import { pictureOf } from "../ui/pictures.js";
import {
  deleteLayer,
  exportBackup,
  importBackup,
  loadTimeline,
  newId,
  onTimelineChange,
  saveLayer,
} from "../ui/store.js";
import { TIMELINE_STYLE, TimelineView } from "../ui/timelineView.js";

/**
 * The page's own look. Wikipedia's design tokens are defined here, light
 * and dark, so that the timeline and the form, written against them for the
 * banner, look the same in this page.
 */
const PAGE_STYLE = `
  :root {
    color-scheme: light dark;
    --color-base: #202122;
    --color-subtle: #54595d;
    --color-progressive: #36c;
    --color-error: #d73333;
    --color-success: #14866d;
    --background-color-base: #fff;
    --background-color-neutral-subtle: #f8f9fa;
    --background-color-interactive: #eaecf0;
    --background-color-interactive-subtle: #f8f9fa;
    --border-color-base: #a2a9b1;
    --border-color-subtle: #c8ccd1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-base: #eaecf0;
      --color-subtle: #a2a9b1;
      --color-progressive: #6d8af0;
      --color-error: #fd7865;
      --color-success: #3dc48f;
      --background-color-base: #101418;
      --background-color-neutral-subtle: #1b1f24;
      --background-color-interactive: #27292d;
      --background-color-interactive-subtle: #202122;
      --border-color-base: #72777d;
      --border-color-subtle: #54595d;
    }
  }
  body {
    margin: 0;
    font-family: sans-serif;
    font-size: 0.9375rem;
    color: var(--color-base);
    background: var(--background-color-base);
  }
  main {
    box-sizing: border-box;
    max-width: 72em;
    margin: 0 auto;
    padding: 1em;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5em;
  }
  h1 {
    flex: 1 1 auto;
    margin: 0;
    font-size: 1.4rem;
  }
  h2 {
    margin: 0 0 0.5em;
    font-size: 1rem;
  }
  a { color: var(--color-progressive); }
  header button.primary {
    color: #fff;
    background: var(--color-progressive);
    border-color: var(--color-progressive);
  }
  .status {
    min-height: 1.25em;
    margin: 0.25em 0 0;
    color: var(--color-subtle);
  }
  .empty {
    padding: 1em;
    color: var(--color-subtle);
    background: var(--background-color-neutral-subtle);
    border: 1px solid var(--border-color-subtle);
    border-radius: 2px;
  }
  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17em, 1fr));
    gap: 1.5em;
    margin-top: 1.5em;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .layer {
    display: flex;
    align-items: center;
    gap: 0.4em;
    margin-bottom: 0.4em;
  }
  .layer input[type="text"], .new-layer input {
    flex: 1;
    min-width: 0;
    font: inherit;
    padding: 0.25em 0.4em;
    color: inherit;
    background: var(--background-color-base);
    border: 1px solid var(--border-color-base);
    border-radius: 2px;
  }
  .layer input[type="color"] {
    width: 2em;
    height: 1.8em;
    padding: 0;
    border: 0;
    background: none;
  }
  .count { color: var(--color-subtle); font-size: 0.85em; }
  .new-layer { display: flex; gap: 0.4em; margin-top: 0.5em; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3em; }
  .chips button { border-radius: 1em; }
  .chips button[aria-pressed="true"] {
    color: #fff;
    background: var(--color-progressive);
    border-color: var(--color-progressive);
  }
  .entries li {
    display: flex;
    gap: 0.6em;
    padding: 0.5em 0;
    border-top: 1px solid var(--border-color-subtle);
  }
  .entries .dot {
    flex: none;
    width: 0.7em;
    height: 0.7em;
    margin-top: 0.35em;
    border-radius: 50%;
  }
  .entries .body { flex: 1; min-width: 0; }
  .entries li > button { align-self: flex-start; }
  .entries .when { font-weight: bold; margin-right: 0.4em; }
  .entries .description, .entries .meta {
    margin: 0.2em 0 0;
    font-size: 0.875em;
    color: var(--color-subtle);
    overflow-wrap: anywhere;
  }
  @media (pointer: coarse) {
    button, .layer input, .new-layer input { min-height: 2.5em; }
  }
`;

/** The reader's language, to read a date typed in the form first. */
const LANGUAGES = [chrome.i18n.getUILanguage().slice(0, 2)];

/**
 * @param {string} tag
 * @param {object} [props] properties set on the element
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
function make(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

/**
 * @param {string} text
 * @param {() => void} action
 * @param {object} [props]
 * @returns {HTMLButtonElement}
 */
function button(text, action, props = {}) {
  const element = make("button", { type: "button", ...props }, text);
  element.addEventListener("click", action);
  return element;
}

/**
 * The page: what the reader set on it, the timeline it draws into, and the
 * timeline as last loaded from storage.
 */
class MyTimelinePage {
  constructor() {
    /** The timeline as last loaded: storage is asynchronous. */
    this.timeline = { layers: [], entries: [] };
    /** The tags the reader picked to filter by. */
    this.picked = new Set();
    /** What the last import or export said, until the next one. */
    this.status = make("p", { className: "status" });
    this.status.setAttribute("role", "status");

    /** The timeline drawn, kept across redraws so its window stays. */
    this.view = new TimelineView([], {
      action: {
        text: "✎",
        label: chrome.i18n.getMessage("editEntry"),
        run: (index) => this.edit(this.shown()[index]),
      },
    });
    /** The parts redrawn on every change. */
    this.empty = make(
      "p",
      { className: "empty" },
      chrome.i18n.getMessage("emptyTimeline"),
    );
    this.panels = make("div", { className: "panels" });

    const importInput = make("input", {
      type: "file",
      accept: "application/json,.json",
      hidden: true,
    });
    importInput.addEventListener("change", () => {
      const [file] = importInput.files;
      importInput.value = "";
      if (file) this.import(file);
    });
    const header = make(
      "header",
      {},
      make("h1", {}, chrome.i18n.getMessage("myTimelineTitle")),
      this.view.controls(),
      button(chrome.i18n.getMessage("addEntry"), () => this.edit(null), {
        className: "primary",
      }),
      button(chrome.i18n.getMessage("exportButton"), () => this.export()),
      button(chrome.i18n.getMessage("importButton"), () => importInput.click()),
      importInput,
    );
    document
      .querySelector("main")
      .append(header, this.status, this.empty, this.view.element, this.panels);
  }

  /** Loads the timeline again and redraws the page. */
  async refresh() {
    this.timeline = await loadTimeline();
    const known = new Set(tagsOf(this.timeline.entries));
    for (const tag of this.picked) if (!known.has(tag)) this.picked.delete(tag);
    this.render();
  }

  /**
   * @returns {import("../shared/myTimeline.js").Entry[]} the entries drawn:
   *   those of shown layers carrying a picked tag, if any is picked
   */
  shown() {
    const { entries, layers } = this.timeline;
    return visibleEntries(entries, layers, [...this.picked]);
  }

  /** Redraws everything from the timeline last loaded. */
  render() {
    const { layers, entries } = this.timeline;
    const colors = new Map(layers.map((layer) => [layer.id, layer.color]));
    this.empty.hidden = entries.length > 0;
    this.view.element.hidden = entries.length === 0;
    this.view.setItems(
      this.shown().map((entry) => ({
        ...spanOf(eventOfEntry(entry)),
        weight: weightOfEntry(entry),
        written: entry.written,
        title: entry.title,
        // The page it was read in, at its date; failing one, its link.
        href: passageOf(entry) ?? entry.link,
        article: entry.source ? entry.link : null,
        description: entry.description.text,
        picture: () => pictureOf(entry.image),
        color: colors.get(entry.layer),
      })),
    );
    this.panels.replaceChildren(
      this.layersPanel(),
      this.tagsPanel(),
      this.entriesPanel(colors),
    );
  }

  /**
   * The layers: shown or hidden, colour, name, how many entries, delete;
   * and a field to make a new one.
   *
   * @returns {HTMLElement}
   */
  layersPanel() {
    const { layers, entries } = this.timeline;
    const list = make("ul");
    for (const layer of layers) {
      const save = (fields) =>
        saveLayer({ ...layer, ...fields, updated: Date.now() });
      const shown = make("input", { type: "checkbox", checked: !layer.hidden });
      shown.title = chrome.i18n.getMessage("layerVisible");
      shown.setAttribute(
        "aria-label",
        `${chrome.i18n.getMessage("layerVisible")} — ${layer.name}`,
      );
      shown.addEventListener("change", () => save({ hidden: !shown.checked }));
      const color = make("input", { type: "color", value: layer.color });
      color.title = chrome.i18n.getMessage("layerColor");
      color.addEventListener("change", () => save({ color: color.value }));
      const name = make("input", { type: "text", value: layer.name });
      name.setAttribute("aria-label", chrome.i18n.getMessage("layerName"));
      name.addEventListener("change", () => {
        if (name.value.trim()) save({ name: name.value.trim() });
      });
      const count = entries.filter((entry) => entry.layer === layer.id).length;
      const remove = button("×", () => {
        const question = chrome.i18n.getMessage("confirmDeleteLayer", [
          layer.name,
          String(count),
        ]);
        if (confirm(question)) deleteLayer(layer.id);
      });
      remove.title = chrome.i18n.getMessage("deleteLayer");
      remove.setAttribute(
        "aria-label",
        `${chrome.i18n.getMessage("deleteLayer")} — ${layer.name}`,
      );
      list.append(
        make(
          "li",
          { className: "layer" },
          shown,
          color,
          name,
          make("span", { className: "count" }, String(count)),
          remove,
        ),
      );
    }
    const newName = make("input", {
      type: "text",
      placeholder: chrome.i18n.getMessage("newLayerName"),
    });
    const add = make(
      "form",
      { className: "new-layer" },
      newName,
      make("button", { type: "submit" }, chrome.i18n.getMessage("addLayer")),
    );
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = newName.value.trim();
      if (!name) return;
      saveLayer(
        newLayer({ id: newId(), name, count: layers.length, now: Date.now() }),
      );
    });
    return make(
      "section",
      {},
      make("h2", {}, chrome.i18n.getMessage("layersHeading")),
      list,
      add,
    );
  }

  /**
   * The tags, each a toggle: picking some shows only the entries carrying
   * one of them.
   *
   * @returns {HTMLElement}
   */
  tagsPanel() {
    const tags = tagsOf(this.timeline.entries);
    const chips = make("div", { className: "chips" });
    for (const tag of tags) {
      const chip = button(tag, () => {
        if (this.picked.has(tag)) this.picked.delete(tag);
        else this.picked.add(tag);
        this.render();
      });
      chip.setAttribute("aria-pressed", String(this.picked.has(tag)));
      chips.append(chip);
    }
    if (this.picked.size) {
      chips.append(
        button(chrome.i18n.getMessage("allTags"), () => {
          this.picked.clear();
          this.render();
        }),
      );
    }
    const section = make(
      "section",
      {},
      make("h2", {}, chrome.i18n.getMessage("tagsHeading")),
    );
    section.append(
      tags.length
        ? chips
        : make("p", { className: "count" }, chrome.i18n.getMessage("noTags")),
    );
    return section;
  }

  /**
   * The entries drawn, in the order of time, each with its description and
   * a button to edit it: the timeline's content readable at any width.
   *
   * @param {Map<string, string>} colors each layer's colour, by id
   * @returns {HTMLElement}
   */
  entriesPanel(colors) {
    const names = new Map(this.timeline.layers.map((l) => [l.id, l.name]));
    const entries = this.shown()
      .map((entry) => ({ entry, start: spanOf(eventOfEntry(entry)).start }))
      .sort((a, b) => a.start - b.start)
      .map(({ entry }) => entry);
    const list = make("ul", { className: "entries" });
    for (const entry of entries) {
      const dot = make("span", { className: "dot" });
      dot.style.background = colors.get(entry.layer) ?? "";
      const title = entry.link
        ? make("a", { href: entry.link }, entry.title || entry.link)
        : make("span", {}, entry.title);
      const description = make("p", { className: "description" });
      for (const piece of richTextPieces(entry.description)) {
        description.append(
          piece.href ? make("a", { href: piece.href }, piece.text) : piece.text,
        );
      }
      const meta = [names.get(entry.layer), ...entry.tags].join(" · ");
      const edit = button("✎", () => this.edit(entry));
      edit.title = chrome.i18n.getMessage("editEntry");
      edit.setAttribute(
        "aria-label",
        `${chrome.i18n.getMessage("editEntry")} — ${entry.title}`,
      );
      list.append(
        make(
          "li",
          {},
          dot,
          make(
            "div",
            { className: "body" },
            entry.source
              ? make(
                  "a",
                  { className: "when", href: passageOf(entry) },
                  entry.written,
                )
              : make("span", { className: "when" }, entry.written),
            title,
            description,
            make("p", { className: "meta" }, meta),
          ),
          edit,
        ),
      );
    }
    return make(
      "section",
      { className: "entries-panel" },
      make(
        "h2",
        {},
        chrome.i18n.getMessage("entriesHeading", [String(entries.length)]),
      ),
      list,
    );
  }

  /**
   * Opens the form on an entry, or on a blank one to add.
   *
   * @param {import("../shared/myTimeline.js").Entry | null} entry
   */
  edit(entry) {
    openEntryForm(document.body, {
      draft: entry ?? {},
      isNew: !entry,
      languages: LANGUAGES,
    });
  }

  /** Saves the whole timeline, photos included, as a file. */
  async export() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const day = new Date().toISOString().slice(0, 10);
    make("a", { href: url, download: `timeline-${day}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.status.textContent = chrome.i18n.getMessage("exportDone", [
      String(backup.entries.length),
    ]);
  }

  /**
   * Merges a backup file into the timeline.
   *
   * @param {File} file
   */
  async import(file) {
    try {
      const count = await importBackup(JSON.parse(await file.text()));
      this.status.textContent = chrome.i18n.getMessage("importDone", [
        String(count),
      ]);
    } catch (error) {
      // A file the reader picked by mistake is not a bug.
      if (!(error instanceof SyntaxError || error instanceof TypeError)) {
        throw error;
      }
      this.status.textContent = chrome.i18n.getMessage("importFailed");
    }
  }
}

document.title = chrome.i18n.getMessage("myTimelineTitle");
document.documentElement.lang = chrome.i18n.getUILanguage();
const style = document.createElement("style");
style.textContent = PAGE_STYLE + TIMELINE_STYLE + FORM_STYLE;
document.head.append(style);

const page = new MyTimelinePage();
onTimelineChange(() => page.refresh());
page.refresh();
