import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { localize } from "../../src/shared/messages.js";
import {
  WEB_FILES,
  WEB_MANIFEST,
  WEB_SCRIPT,
  WEB_WORKER,
  shellOf,
  webManifestFile,
} from "../../src/web/manifest.js";

const languages = readdirSync("src/_locales");

test("every file and script of the site has a source", () => {
  for (const file of [...WEB_FILES, WEB_SCRIPT, WEB_WORKER]) {
    assert.ok(existsSync(`src/web/${file}`), file);
  }
});

test("every icon of the manifest is a file of the site", () => {
  for (const { src } of WEB_MANIFEST.icons) {
    assert.ok(WEB_FILES.includes(src), src);
  }
});

test("an icon of 192 and one of 512 pixels make the site installable", () => {
  const sizes = WEB_MANIFEST.icons.map(({ sizes }) => sizes);
  assert.ok(sizes.includes("192x192"));
  assert.ok(sizes.includes("512x512"));
});

test("every path is relative, so the site works wherever it is served", () => {
  const paths = [
    WEB_MANIFEST.id,
    WEB_MANIFEST.start_url,
    WEB_MANIFEST.scope,
    WEB_MANIFEST.share_target.action,
    ...WEB_MANIFEST.icons.map(({ src }) => src),
    ...shellOf(languages),
  ];
  for (const path of paths) assert.ok(!/^\/|:\/\//.test(path), path);
});

test("a page shared to the site arrives in the query the site reads", () => {
  const { share_target: share } = WEB_MANIFEST;
  assert.equal(share.method, "GET");
  assert.equal(share.params.url, "url");
  assert.equal(share.params.text, "text");
  const app = readFileSync(`src/web/${WEB_SCRIPT}`, "utf8");
  for (const name of [share.params.url, share.params.text]) {
    assert.match(app, new RegExp(`"${name}"`), name);
  }
});

test("the manifest is written in every language, every string filled", () => {
  for (const language of languages) {
    const messages = JSON.parse(
      readFileSync(`src/_locales/${language}/messages.json`),
    );
    const manifest = localize(WEB_MANIFEST, messages);
    assert.doesNotMatch(JSON.stringify(manifest), /__MSG_/, language);
    assert.ok(manifest.name && manifest.short_name, language);
    // A home screen shows about a dozen characters under an icon.
    assert.ok(manifest.short_name.length <= 12, language);
  }
});

test("the worker keeps the site's root and every file but itself", () => {
  const shell = shellOf(languages);
  assert.ok(shell.includes("./"));
  assert.ok(shell.includes(WEB_SCRIPT));
  assert.ok(!shell.includes(WEB_WORKER));
  for (const file of WEB_FILES) assert.ok(shell.includes(file), file);
  for (const language of languages) {
    assert.ok(shell.includes(webManifestFile(language)), language);
  }
  assert.equal(new Set(shell).size, shell.length, "each file once");
});
