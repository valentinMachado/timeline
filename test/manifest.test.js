import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  PAGES,
  TARGETS,
  manifestFor,
  scriptOfPage,
  scriptsOf,
  sourceOf,
} from "../src/manifest.js";

const targets = Object.keys(TARGETS);

test("targets are Chrome and Firefox", () => {
  assert.deepEqual(targets.sort(), ["chrome", "firefox"]);
});

for (const target of targets) {
  test(`${target}: Manifest V3 with the given version`, () => {
    const manifest = manifestFor(target, "1.2.3");
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, "1.2.3");
    assert.equal(manifest.default_locale, "en");
  });

  test(`${target}: every script it loads has a source file`, () => {
    const scripts = scriptsOf(manifestFor(target, "0.0.0"));
    assert.ok(scripts.length > 0);
    for (const script of scripts) {
      assert.ok(existsSync(sourceOf(script)), `missing ${sourceOf(script)}`);
    }
  });

  test(`${target}: builds its background script and every page's script`, () => {
    const scripts = scriptsOf(manifestFor(target, "0.0.0"));
    assert.ok(scripts.includes("background.js"));
    for (const page of PAGES) assert.ok(scripts.includes(scriptOfPage(page)));
  });

  test(`${target}: keeps the reader's timeline on the device`, () => {
    const manifest = manifestFor(target, "0.0.0");
    assert.deepEqual(manifest.permissions, ["storage", "unlimitedStorage"]);
    assert.match(manifest.action.default_title, /^__MSG_\w+__$/);
  });

  test(`${target}: injects into Wikipedia articles in every language`, () => {
    const [cs] = manifestFor(target, "0.0.0").content_scripts;
    assert.deepEqual(cs.matches, ["https://*.wikipedia.org/wiki/*"]);
  });
}

test("every page has a source file, and loads its script", () => {
  for (const page of PAGES) {
    assert.ok(existsSync(sourceOf(page)), `missing ${sourceOf(page)}`);
    const html = readFileSync(sourceOf(page), "utf8");
    const script = scriptOfPage(page).split("/").at(-1);
    assert.match(html, new RegExp(`<script src="${script}"></script>`));
  }
});

test("Chrome runs the background as a worker, Firefox as an event page", () => {
  assert.deepEqual(manifestFor("chrome", "0.0.0").background, {
    service_worker: "background.js",
  });
  assert.deepEqual(manifestFor("firefox", "0.0.0").background, {
    scripts: ["background.js"],
  });
});

test("only Firefox carries gecko settings", () => {
  assert.equal(
    manifestFor("chrome", "0.0.0").browser_specific_settings,
    undefined,
  );
  const { gecko } = manifestFor("firefox", "0.0.0").browser_specific_settings;
  assert.match(gecko.id, /^[\w.-]+@[\w.-]+$/);
  assert.deepEqual(gecko.data_collection_permissions, { required: ["none"] });
});

test("an unknown target throws", () => {
  assert.throws(() => manifestFor("safari", "0.0.0"), RangeError);
  assert.throws(() => manifestFor("toString", "0.0.0"), RangeError);
});
