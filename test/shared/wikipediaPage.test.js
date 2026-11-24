import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articleIn,
  articleTitle,
  articleUrl,
  historyUrl,
  isArticleView,
  isBackMatter,
  pageLanguage,
  parseUrl,
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

test("an article's address is written as MediaWiki writes its links", () => {
  assert.equal(
    articleUrl("fr", "Révolution française"),
    "https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise",
  );
  // MediaWiki keeps these as they are; an address built otherwise would
  // not equal the article's links to itself.
  assert.equal(
    articleUrl("en", "AC/DC: Live, 1992 (album)"),
    "https://en.wikipedia.org/wiki/AC/DC:_Live,_1992_(album)",
  );
  assert.equal(articleTitle(articleUrl("en", "C++")), "C++");
});

test("a shared text leads to the article whose address it holds", () => {
  assert.deepEqual(articleIn("https://fr.wikipedia.org/wiki/Rome_antique"), {
    language: "fr",
    title: "Rome antique",
    fragment: "",
  });
  // Chrome on Android may share the title, then the address.
  assert.deepEqual(
    articleIn(
      "French Revolution - Wikipedia https://en.m.wikipedia.org/wiki/French_Revolution#Causes",
    ),
    { language: "en", title: "French Revolution", fragment: "Causes" },
  );
  assert.deepEqual(
    articleIn(
      "https://fr.wikipedia.org/wiki/R%C3%A9volution_fran%C3%A7aise#La_Terreur_(1793-1794)",
    ),
    {
      language: "fr",
      title: "Révolution française",
      fragment: "La_Terreur_(1793-1794)",
    },
  );
});

test("a shared text without an article leads nowhere", () => {
  assert.equal(articleIn("Rome antique"), null);
  assert.equal(articleIn("https://example.org/wiki/Rome"), null);
  assert.equal(articleIn("https://fr.wikipedia.org/wiki/Catégorie:Rome"), null);
  assert.equal(articleIn(""), null);
});

test("an article's text is asked of the Action API, open to every origin", () => {
  const url = new URL(parseUrl("fr", "Rome antique"));
  assert.equal(url.origin + url.pathname, "https://fr.wikipedia.org/w/api.php");
  assert.equal(url.searchParams.get("action"), "parse");
  assert.equal(url.searchParams.get("page"), "Rome antique");
  assert.equal(url.searchParams.get("origin"), "*");
  assert.equal(url.searchParams.get("redirects"), "1");
});

test("an article's authors are in its history", () => {
  const url = new URL(historyUrl("en", "French Revolution"));
  assert.equal(url.hostname, "en.wikipedia.org");
  assert.equal(url.searchParams.get("title"), "French_Revolution");
  assert.equal(url.searchParams.get("action"), "history");
});
