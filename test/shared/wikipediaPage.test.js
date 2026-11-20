import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articleTitle,
  isArticleView,
  isBackMatter,
  pageLanguage,
  summaryUrl,
} from "../../src/shared/wikipediaPage.js";

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

test("the language of a Wikipedia is its subdomain", () => {
  assert.equal(pageLanguage("fr.wikipedia.org"), "fr");
  assert.equal(pageLanguage("en.m.wikipedia.org"), "en");
  assert.equal(pageLanguage("simple.wikipedia.org"), "simple");
  assert.equal(pageLanguage("wikipedia.org"), null);
  assert.equal(pageLanguage("fr.wiktionary.org"), null);
});

test("a link to an article gives its title", () => {
  assert.equal(
    articleTitle(
      "https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise",
    ),
    "Révolution française",
  );
  assert.equal(
    articleTitle("https://en.m.wikipedia.org/wiki/Star_Wars:_A_New_Hope#Plot"),
    "Star Wars: A New Hope",
  );
});

test("a link elsewhere gives no title", () => {
  for (const href of [
    "https://fr.wikipedia.org/wiki/Fichier:Bastille.jpg",
    "https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Histoire",
    "https://en.wikipedia.org/wiki/Help:Contents",
    "https://en.wikipedia.org/wiki/Special:Random",
    "https://fr.wikipedia.org/w/index.php?title=X&action=edit&redlink=1",
    "https://www.example.org/wiki/Paris",
    "https://fr.wikipedia.org/wiki/%E0%A4%A",
  ]) {
    assert.equal(articleTitle(href), null, href);
  }
});

test("source sections are back matter, story sections are not", () => {
  assert.equal(isBackMatter("Notes_et_références"), true);
  assert.equal(isBackMatter("External_links"), true);
  assert.equal(isBackMatter("Histoire"), false);
});

test("an article's summary is asked of its Wikipedia's REST API", () => {
  assert.equal(
    summaryUrl("https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise"),
    "https://fr.wikipedia.org/api/rest_v1/page/summary/R%C3%A9volution_fran%C3%A7aise",
  );
  // The mobile site's articles are asked on the desktop host; a slash or a
  // colon in a title stays part of it.
  assert.equal(
    summaryUrl("https://en.m.wikipedia.org/wiki/AC/DC#History"),
    "https://en.wikipedia.org/api/rest_v1/page/summary/AC%2FDC",
  );
  assert.equal(
    summaryUrl("https://en.wikipedia.org/wiki/Star_Wars:_A_New_Hope"),
    "https://en.wikipedia.org/api/rest_v1/page/summary/Star_Wars%3A_A_New_Hope",
  );
});

test("a link elsewhere has no summary", () => {
  assert.equal(summaryUrl("https://fr.wikipedia.org/wiki/Fichier:X.jpg"), null);
  assert.equal(summaryUrl("https://www.example.org/wiki/Paris"), null);
});
