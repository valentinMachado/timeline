import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatRichText,
  parseRichText,
  richTextPieces,
  safeUrl,
} from "../../src/shared/richText.js";

describe("safeUrl", () => {
  it("keeps web addresses", () => {
    assert.equal(
      safeUrl("https://fr.wikipedia.org/wiki/X"),
      "https://fr.wikipedia.org/wiki/X",
    );
    assert.equal(safeUrl("http://example.org"), "http://example.org/");
  });

  it("refuses everything else", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "/wiki/X",
      "not a url",
      "",
    ]) {
      assert.equal(safeUrl(href), null, href);
    }
  });
});

describe("parseRichText", () => {
  it("reads plain text as is", () => {
    assert.deepEqual(parseRichText("La prise de la Bastille."), {
      text: "La prise de la Bastille.",
      links: [],
    });
  });

  it("reads links written [text](url), offsets into the text", () => {
    const rich = parseRichText(
      "La [Bastille](https://fr.wikipedia.org/wiki/Bastille) tombe, voir [ici](https://example.org/a).",
    );
    assert.equal(rich.text, "La Bastille tombe, voir ici.");
    assert.deepEqual(rich.links, [
      { start: 3, end: 11, href: "https://fr.wikipedia.org/wiki/Bastille" },
      { start: 24, end: 27, href: "https://example.org/a" },
    ]);
  });

  it("leaves a link that is not a web address as written", () => {
    const source = "Un [piège](javascript:alert(1)) ici.";
    assert.deepEqual(parseRichText(source), { text: source, links: [] });
  });
});

describe("formatRichText", () => {
  it("is the inverse of parseRichText", () => {
    for (const source of [
      "",
      "Rien.",
      "[A](https://a.org/) et [B](https://b.org/x?y=1)",
      "Avant [lien](https://example.org/) après",
    ]) {
      assert.equal(formatRichText(parseRichText(source)), source);
    }
  });

  it("writes the sentence of a page with its links", () => {
    const sentence = {
      text: "La Bastille est prise le 14 juillet 1789.",
      links: [
        { start: 3, end: 11, href: "https://fr.wikipedia.org/wiki/Bastille" },
      ],
    };
    assert.equal(
      formatRichText(sentence),
      "La [Bastille](https://fr.wikipedia.org/wiki/Bastille) est prise le 14 juillet 1789.",
    );
  });

  it("drops a link it could not draw", () => {
    const text = "abcdef";
    const links = [
      { start: 0, end: 2, href: "javascript:x" },
      { start: 1, end: 3, href: "https://a.org/" },
      { start: 2, end: 4, href: "https://b.org/" },
      { start: 5, end: 9, href: "https://c.org/" },
    ];
    assert.equal(formatRichText({ text, links }), "a[bc](https://a.org/)def");
  });
});

describe("richTextPieces", () => {
  it("cuts the text into plain pieces and links", () => {
    assert.deepEqual(richTextPieces(parseRichText("a [b](https://b.org/) c")), [
      { text: "a ", href: null },
      { text: "b", href: "https://b.org/" },
      { text: " c", href: null },
    ]);
    assert.deepEqual(richTextPieces({ text: "", links: [] }), []);
  });
});
