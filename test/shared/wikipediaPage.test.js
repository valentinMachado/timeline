import { test } from "node:test";
import assert from "node:assert/strict";
import { isArticleView } from "../../src/shared/wikipediaPage.js";

test("an article being read is an article view", () => {
  // Vector 2022's body classes on an article, trimmed.
  const vector =
    "skin--responsive skin-vector skin-vector-search-vue mediawiki ltr " +
    "sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Paris " +
    "rootpage-Paris skin-vector-2022 action-view";
  assert.equal(isArticleView(vector), true);
  // Minerva, the mobile skin.
  const minerva =
    "mediawiki ltr sitedir-ltr ns-0 ns-subject page-Paris " +
    "skin-minerva action-view skin--responsive";
  assert.equal(isArticleView(minerva), true);
});

test("another namespace is not an article", () => {
  assert.equal(isArticleView("mediawiki ns-1 ns-talk action-view"), false);
  assert.equal(isArticleView("mediawiki ns-14 action-view"), false);
});

test("an edit or a history is not a view", () => {
  assert.equal(isArticleView("mediawiki ns-0 action-edit"), false);
  assert.equal(isArticleView("mediawiki ns-0 action-history"), false);
});

test("a class merely starting with ns-0 does not count", () => {
  assert.equal(isArticleView("ns-01 action-view"), false);
  assert.equal(isArticleView(""), false);
});
