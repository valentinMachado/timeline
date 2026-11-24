import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatMessage,
  localize,
  pickLanguage,
} from "../../src/shared/messages.js";

const fr = JSON.parse(readFileSync("src/_locales/fr/messages.json"));
const en = JSON.parse(readFileSync("src/_locales/en/messages.json"));

test("a message without placeholder is its text", () => {
  assert.equal(formatMessage(en, "zoomIn"), "Zoom in");
  assert.equal(formatMessage(fr, "bannerTitle"), fr.bannerTitle.message);
});

test("a placeholder takes the substitution its content names", () => {
  assert.equal(
    formatMessage(en, "bannerCount", ["42"]),
    "Dates read from this page: 42",
  );
  // A single substitution may be given bare, as chrome.i18n accepts it.
  assert.equal(
    formatMessage(en, "bannerCount", "7"),
    "Dates read from this page: 7",
  );
});

test("several placeholders each take their own substitution", () => {
  const messages = {
    span: {
      message: "From $FROM$ to $To$, $$5",
      placeholders: { from: { content: "$1" }, to: { content: "$2" } },
    },
  };
  assert.equal(
    formatMessage(messages, "span", ["1789", "1799"]),
    "From 1789 to 1799, $5",
  );
});

test("a missing substitution is empty, a missing key gives nothing", () => {
  assert.equal(formatMessage(en, "bannerCount"), "Dates read from this page: ");
  assert.equal(formatMessage(en, "noSuchKey"), "");
});

test("the reader's first language there are messages for is spoken", () => {
  assert.equal(pickLanguage(["fr-FR", "en-US"], ["en", "fr"], "en"), "fr");
  assert.equal(pickLanguage(["de-DE", "en-GB"], ["en", "fr"], "en"), "en");
  assert.equal(pickLanguage(["FR-ca"], ["en", "fr"], "en"), "fr");
  assert.equal(pickLanguage(["de", "it"], ["en", "fr"], "en"), "en");
  assert.equal(pickLanguage([], ["en", "fr"], "fr"), "fr");
});

test("a manifest is localised wherever its strings are", () => {
  const manifest = {
    name: "__MSG_zoomIn__",
    list: ["a __MSG_zoomOut__ b", 3],
    nested: { keep: true, label: "__MSG_zoomIn__" },
  };
  assert.deepEqual(localize(manifest, en), {
    name: "Zoom in",
    list: ["a Zoom out b", 3],
    nested: { keep: true, label: "Zoom in" },
  });
  assert.equal(manifest.name, "__MSG_zoomIn__", "the original is untouched");
});

test("a manifest asking for a missing message is refused", () => {
  assert.throws(() => localize({ name: "__MSG_noSuchKey__" }, en), RangeError);
});
