import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { TARGETS, manifestFor, scriptsOf, sourceOf } from "../src/manifest.js";

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

  test(`${target}: injects into Wikipedia articles in every language`, () => {
    const [cs] = manifestFor(target, "0.0.0").content_scripts;
    assert.deepEqual(cs.matches, ["https://*.wikipedia.org/wiki/*"]);
  });
}

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
