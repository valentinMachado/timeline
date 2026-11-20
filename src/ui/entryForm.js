/**
 * The form an entry of the reader's timeline is written in: to add an event
 * of a page, a date the reader selected, or one typed by hand, and to edit
 * or delete an entry later. One form for every way in, opened in a modal
 * dialog wherever it is needed (the shadow root of a Wikipedia page, the
 * timeline's own page), so that it reads the same everywhere and works at a
 * phone's width.
 */

import { newLayer, parseTags, readDate, tagsOf } from "../shared/myTimeline.js";
import { formatRichText, parseRichText, safeUrl } from "../shared/richText.js";
import { photoFromFile } from "./photos.js";
import { pictureOf } from "./pictures.js";
import {
  deleteEntry,
  layersOrDefault,
  loadTimeline,
  newId,
  saveEntry,
  saveLayer,
} from "./store.js";

export const FORM_STYLE = `
  dialog [hidden] { display: none !important; }
  dialog {
    box-sizing: border-box;
    width: min(34em, calc(100vw - 1.5em));
    max-height: calc(100dvh - 1.5em);
    overflow: auto;
    padding: 1em;
    font-family: sans-serif;
    font-size: 0.9rem;
    color: var(--color-base, #202122);
    background: var(--background-color-base, #fff);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 4px;
  }
  dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  dialog h2 {
    margin: 0 0 0.75em;
    font-size: 1.1rem;
  }
  dialog form {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
  }
  dialog label, dialog fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    margin: 0;
    padding: 0;
    border: 0;
    font-weight: bold;
  }
  dialog legend { padding: 0; margin-bottom: 0.25em; }
  dialog input[type="text"], dialog input[type="url"], dialog textarea,
  dialog select {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    font-weight: normal;
    padding: 0.35em 0.5em;
    color: inherit;
    background: var(--background-color-base, #fff);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 2px;
  }
  dialog textarea { min-height: 5em; resize: vertical; }
  dialog .hint, dialog .status {
    font-weight: normal;
    font-size: 0.8rem;
    color: var(--color-subtle, #54595d);
  }
  dialog .status.bad { color: var(--color-error, #d73333); }
  dialog .status.good { color: var(--color-success, #14866d); }
  dialog .picture {
    display: flex;
    gap: 0.5em;
    align-items: center;
    flex-wrap: wrap;
    font-weight: normal;
  }
  dialog .picture img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 2px;
    background: var(--background-color-interactive, #eaecf0);
  }
  dialog .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25em;
  }
  dialog .chips button {
    font-size: 0.8rem;
    padding: 0.1em 0.5em;
    border-radius: 1em;
  }
  dialog .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    justify-content: flex-end;
  }
  dialog .buttons .delete { margin-right: auto; }
  dialog button {
    font: inherit;
    padding: 0.35em 0.9em;
    cursor: pointer;
    color: var(--color-base, #202122);
    background: var(--background-color-interactive-subtle, #f8f9fa);
    border: 1px solid var(--border-color-base, #a2a9b1);
    border-radius: 2px;
  }
  dialog button.primary {
    color: #fff;
    background: var(--color-progressive, #36c);
    border-color: var(--color-progressive, #36c);
  }
  dialog button:disabled { opacity: 0.5; cursor: default; }
  @media (pointer: coarse) {
    dialog button, dialog input, dialog select { min-height: 2.5em; }
  }
`;

/**
 * @typedef {Partial<import("../shared/myTimeline.js").Entry>} Draft
 * What the form opens with: an entry to edit, or the fields of a new one
 * read from a page. Its date fields (`start`, `end`, `approximate`) stand as
 * long as the date written in the form is still `written`.
 */

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
 * A field: its label, the control, and a hint below it.
 *
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string | HTMLElement} [hint]
 * @returns {HTMLLabelElement}
 */
function field(label, control, hint) {
  const element = make("label", {}, label, control);
  if (hint) {
    element.append(
      typeof hint === "string"
        ? make("span", { className: "hint" }, hint)
        : hint,
    );
  }
  return element;
}

/**
 * Opens the form in a modal dialog and waits for the reader to close it.
 *
 * @param {Node} root where the dialog is put: a shadow root, or the body
 * @param {object} options
 * @param {Draft} options.draft
 * @param {boolean} options.isNew whether saving adds an entry rather than
 *   replacing one
 * @param {string[]} options.languages the languages a typed date is read in
 *   first: the page's, the reader's
 * @returns {Promise<{ entry: import("../shared/myTimeline.js").Entry,
 *   layer: import("../shared/myTimeline.js").Layer } | null>} what was
 *   saved, null when nothing was (cancelled, or deleted)
 */
export async function openEntryForm(root, { draft, isNew, languages }) {
  const [layers, { entries }] = await Promise.all([
    layersOrDefault(),
    loadTimeline(),
  ]);
  const now = new Date().getFullYear();

  const dialog = make("dialog");
  dialog.setAttribute("aria-labelledby", "entry-form-title");
  const form = make("form", { method: "dialog" });

  // Date: read as the reader types, as a page would write it.
  const dateInput = make("input", {
    type: "text",
    value: draft.written ?? "",
    required: true,
  });
  const dateStatus = make("span", { className: "status" });
  const readTyped = () => {
    const text = dateInput.value.trim();
    if (draft.start && text === draft.written) {
      return {
        start: draft.start,
        end: draft.end ?? null,
        approximate: draft.approximate ?? false,
        written: draft.written,
      };
    }
    return text ? readDate(text, { languages, now }) : null;
  };

  const titleInput = make("input", { type: "text", value: draft.title ?? "" });
  const linkInput = make("input", {
    type: "url",
    value: draft.link ?? "",
    placeholder: "https://",
  });
  const description = make("textarea", {
    value: formatRichText(draft.description ?? { text: "", links: [] }),
  });

  // Picture: the article's, a picture online, or a photo of the device.
  let image = draft.image ?? null;
  let photo = null;
  const preview = make("img", { alt: "" });
  const showImage = () => {
    preview.hidden = !image;
    removeButton.hidden = !image;
    if (photo) {
      preview.src = photo;
    } else {
      pictureOf(image).then((url) => {
        if (url) preview.src = url;
        else preview.removeAttribute("src");
      });
    }
  };
  const imageUrl = make("input", {
    type: "url",
    placeholder: "https://",
    value: image && "url" in image ? image.url : "",
  });
  imageUrl.addEventListener("change", () => {
    const url = safeUrl(imageUrl.value.trim());
    if (!url) return;
    image = { url };
    photo = null;
    showImage();
  });
  // Hidden: a button of the form's own style opens it.
  const photoInput = make("input", {
    type: "file",
    accept: "image/*",
    hidden: true,
  });
  const chooseButton = make(
    "button",
    { type: "button" },
    chrome.i18n.getMessage("choosePhoto"),
  );
  chooseButton.addEventListener("click", () => photoInput.click());
  const photoStatus = make("span", { className: "status bad", hidden: true });
  photoInput.addEventListener("change", async () => {
    const [file] = photoInput.files;
    if (!file) return;
    try {
      photo = await photoFromFile(file);
      image = { photo: newId() };
      photoStatus.hidden = true;
      showImage();
    } catch {
      photoStatus.textContent = chrome.i18n.getMessage("photoFailed");
      photoStatus.hidden = false;
    }
  });
  const removeButton = make(
    "button",
    { type: "button" },
    chrome.i18n.getMessage("removeImage"),
  );
  removeButton.addEventListener("click", () => {
    image = null;
    photo = null;
    imageUrl.value = "";
    showImage();
  });
  const picture = make(
    "fieldset",
    {},
    make("legend", {}, chrome.i18n.getMessage("fieldImage")),
    make(
      "div",
      { className: "picture" },
      preview,
      chooseButton,
      photoInput,
      removeButton,
    ),
    field(chrome.i18n.getMessage("fieldImageUrl"), imageUrl),
    photoStatus,
  );
  // Layer: one of the reader's, or a new one named here.
  const NEW_LAYER = "";
  const layerSelect = make(
    "select",
    {},
    ...layers.map((layer) => make("option", { value: layer.id }, layer.name)),
    make(
      "option",
      { value: NEW_LAYER },
      chrome.i18n.getMessage("newLayerOption"),
    ),
  );
  layerSelect.value = draft.layer ?? layers[0].id;
  const layerName = make("input", {
    type: "text",
    placeholder: chrome.i18n.getMessage("newLayerName"),
    hidden: true,
  });
  layerSelect.addEventListener("change", () => {
    layerName.hidden = layerSelect.value !== NEW_LAYER;
    if (!layerName.hidden) layerName.focus();
    check();
  });
  layerName.addEventListener("input", () => check());

  // Tags: typed with commas, or picked among those already used.
  const tagsInput = make("input", {
    type: "text",
    value: (draft.tags ?? []).join(", "),
  });
  const chips = make("span", { className: "chips" });
  for (const tag of tagsOf(entries)) {
    const chip = make("button", { type: "button" }, tag);
    chip.addEventListener("click", () => {
      const tags = parseTags(`${tagsInput.value},${tag}`);
      tagsInput.value = tags.join(", ");
    });
    chips.append(chip);
  }

  const save = make(
    "button",
    { type: "submit", className: "primary" },
    chrome.i18n.getMessage("save"),
  );
  const cancel = make(
    "button",
    { type: "button" },
    chrome.i18n.getMessage("cancel"),
  );
  cancel.addEventListener("click", () => dialog.close());
  const buttons = make("div", { className: "buttons" });
  if (!isNew) {
    const remove = make(
      "button",
      { type: "button", className: "delete" },
      chrome.i18n.getMessage("deleteEntry"),
    );
    remove.addEventListener("click", async () => {
      if (!confirm(chrome.i18n.getMessage("confirmDeleteEntry"))) return;
      await deleteEntry(draft.id);
      dialog.close();
    });
    buttons.append(remove);
  }
  buttons.append(cancel, save);

  /** Says whether the date is read, and lets the form be saved only then. */
  const check = () => {
    const read = readTyped();
    dateStatus.textContent = read
      ? chrome.i18n.getMessage("dateRead")
      : chrome.i18n.getMessage("dateNotRead");
    dateStatus.className = `status ${read ? "good" : "bad"}`;
    const named = layerSelect.value !== NEW_LAYER || layerName.value.trim();
    save.disabled = !read || !named;
  };
  dateInput.addEventListener("input", check);

  form.append(
    field(chrome.i18n.getMessage("fieldDate"), dateInput, dateStatus),
    make(
      "span",
      { className: "hint" },
      chrome.i18n.getMessage("fieldDateHint"),
    ),
    field(chrome.i18n.getMessage("fieldTitle"), titleInput),
    field(chrome.i18n.getMessage("fieldLink"), linkInput),
    field(
      chrome.i18n.getMessage("fieldDescription"),
      description,
      chrome.i18n.getMessage("fieldDescriptionHint"),
    ),
    picture,
    field(chrome.i18n.getMessage("fieldLayer"), layerSelect, layerName),
    field(
      chrome.i18n.getMessage("fieldTags"),
      tagsInput,
      chrome.i18n.getMessage("fieldTagsHint"),
    ),
    chips,
    buttons,
  );
  dialog.append(
    make(
      "h2",
      { id: "entry-form-title" },
      isNew
        ? chrome.i18n.getMessage("addToMyTimeline")
        : chrome.i18n.getMessage("editEntry"),
    ),
    form,
  );
  root.append(dialog);
  showImage();
  check();

  return new Promise((resolve) => {
    let saved = null;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const date = readTyped();
      if (!date) return;
      save.disabled = true;
      let layer = layers.find(({ id }) => id === layerSelect.value);
      if (!layer) {
        layer = newLayer({
          id: newId(),
          name: layerName.value.trim(),
          count: layers.length,
          now: Date.now(),
        });
        await saveLayer(layer);
      }
      const entry = {
        id: draft.id ?? newId(),
        layer: layer.id,
        ...date,
        title: titleInput.value.trim(),
        link: safeUrl(linkInput.value.trim()),
        description: parseRichText(description.value.trim()),
        image,
        tags: parseTags(tagsInput.value),
        source: draft.source ?? null,
        updated: Date.now(),
      };
      await saveEntry(entry, photo);
      saved = { entry, layer };
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(saved);
    });
    dialog.showModal();
    dateInput.focus();
  });
}
