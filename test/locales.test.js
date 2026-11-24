import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TARGETS, manifestFor } from "../src/manifest.js";
import { WEB_MANIFEST } from "../src/web/manifest.js";

const LOCALES = "src/_locales";
const languages = readdirSync(LOCALES);
const messages = Object.fromEntries(
  languages.map((lang) => [
    lang,
    JSON.parse(readFileSync(path.join(LOCALES, lang, "messages.json"))),
  ]),
);

/** Every JavaScript file under `dir`, recursively. */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Every message key the code and the manifests ask for. */
function usedKeys() {
  const keys = new Set();
  for (const file of filesUnder("src")) {
    const source = readFileSync(file, "utf8");
    // `message` from `#i18n`, not a method of the same name.
    for (const [, key] of source.matchAll(/(?<![.\w])message\(\s*"(\w+)"/g)) {
      keys.add(key);
    }
  }
  const manifests = [
    ...Object.keys(TARGETS).map((target) => manifestFor(target, "0.0.0")),
    WEB_MANIFEST,
  ];
  for (const manifest of manifests) {
    const json = JSON.stringify(manifest);
    for (const [, key] of json.matchAll(/__MSG_(\w+)__/g)) keys.add(key);
  }
  return keys;
}

test("the extension speaks English and French", () => {
  assert.deepEqual(languages.sort(), ["en", "fr"]);
});

test("every language has the same keys", () => {
  const [first, ...rest] = languages;
  const expected = Object.keys(messages[first]).sort();
  for (const lang of rest) {
    assert.deepEqual(Object.keys(messages[lang]).sort(), expected, lang);
  }
});

test("every message has a text and a description", () => {
  for (const lang of languages) {
    for (const [key, entry] of Object.entries(messages[lang])) {
      assert.ok(entry.message?.trim(), `${lang}.${key}.message`);
      assert.ok(entry.description?.trim(), `${lang}.${key}.description`);
    }
  }
});

test("every key the extension asks for exists, and none is unused", () => {
  const used = usedKeys();
  for (const lang of languages) {
    const defined = new Set(Object.keys(messages[lang]));
    for (const key of used) assert.ok(defined.has(key), `${lang} lacks ${key}`);
    for (const key of defined) assert.ok(used.has(key), `${key} is unused`);
  }
});
