# CLAUDE.md

Working notes for an AI assistant (or any new contributor) on this repository.
Read it once; then read [docs/CONVENTIONS.md](docs/CONVENTIONS.md), which holds
every rule below with the reason behind it.

## What this is

A browser extension (Manifest V3, Chrome and Firefox) that reads the dates of
the page being read — Wikipedia first, any page later — and draws them as an
illustrated timeline, each event carrying the picture of its article and
leading back to it. A reader may also keep a timeline of their own, in layers,
filled from what they read. See [README.md](README.md).

## Read before editing

| Area                                        | Document                                   |
| ------------------------------------------- | ------------------------------------------ |
| Every rule below, with the reason behind it | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| Backlog and plan (French, gitignored)       | `management/README.md`                     |

When code and a document disagree, the code is the truth and the document is
a bug: fix the document in the same change.

## Commands

```bash
npm test               # node --test over test/**/*.test.js
npm run lint           # eslint . — must be clean
npm run format:check   # prettier — must be clean (npm run format to fix)
npm run build          # dist/chrome and dist/firefox, each loadable unpacked
npm run dev            # the same, rebuilt on every script change
```

Run one test file while iterating: `node --test test/shared/TimelineDate.test.js`.

## Non-negotiable rules

Language and style

1. Everything tracked by git is in **English**: code, JSDoc, comments, commit
   messages, docs. The user writes in French; the output language does not
   change. `management/` is the exception: French and gitignored.
2. Document with **JSDoc blocks** above declarations. Inside a function body,
   comment only a genuinely non-obvious line, in one line. Explain _why_, never
   restate _what_.
3. Prettier and ESLint are the style guide. Do not reformat files you did not
   otherwise touch. No `debugger`, no leftover `console.log`.

Code

4. Everything is **ESM**. `src/shared/` is pure: no DOM, no `chrome.*`, no
   Node module, so it runs in a page, a service worker and the tests alike.
5. Prefer the general mechanism over the local patch: one source of truth over a
   sync step, a table over a `switch` repeated in several places. A knowingly
   narrow fix is said out loud before it ships.
6. **A class holds the least state it can.** A field is kept for what somebody
   set, a resource to release, or an edge to detect; what can be worked out
   from another field is a method. CONVENTIONS §4.
7. Every user-visible string goes through the extension's i18n
   (`src/_locales/{en,fr}/messages.json`), in both languages; a test fails on
   a key missing from one language or unused.

Testing and delivery

8. Tests mirror `src/` under `test/`, use `node:test`, and exercise the public
   API. A feature ships with its tests in the same change. What only a browser
   shows is said explicitly as **not** verified.
9. Before reporting done: `npm test`, `npm run lint`, `npm run format:check`
   all clean, docs updated.

Git

10. **Stage files explicitly.** Never `git add -A` or `git add .`. If
    `git status` shows edits you did not make, ask before including them.
11. Commit only when asked. Short imperative English subject; a body explaining
    _why_ for anything non-trivial. Never commit `.env`, `dist/`, `database/`
    or `management/`.
12. Adding a dependency is a decision for the user, not a side effect of a fix.
13. **A task in phases follows the `phased-delivery` skill**: one phase per
    session, carried to the commit, then a hand-off prompt for the next,
    unasked.
14. **A change on one item follows the `fix-across` skill**: the same change
    lands on its siblings (date formats, languages, browsers, sites), unasked.
15. **A done item leaves the backlog.** Delete the entry, never tick it: git
    history is the record of what was done.
16. **The _Current state_ below says what is true now.** Replace a line when it
    stops being true; never append a dated account of a change.

## Where things live

```
src/manifest.js                the manifest, one source specialised per browser (Chrome, Firefox)
src/content/wikipedia.js       content script: article → events; the banner (shadow DOM); + on a card, the selection button
src/background.js              opens the reader's timeline (toolbar button, banner's button)
src/pages/mytimeline.{html,js} the reader's timeline: layers, tag filter, list, export / import
src/ui/timelineView.js         a timeline drawn: axis, marks, cards; wheel, drag, pinch, keys; page's or reader's
src/ui/entryForm.js            the form of an entry of the reader's timeline, in a modal dialog
src/ui/store.js                the reader's timeline in chrome.storage.local, one key per object
src/ui/summaries.js            article thumbnails from the REST API, only for cards on screen
src/ui/pictures.js, photos.js  an entry's picture (thumbnail, URL, local photo); a photo brought down to size
src/_locales/{en,fr}/          every user-visible string
src/shared/TimelineDate.js     a day from the Big Bang to a billion years ahead, beyond Date's range
src/shared/dateExtraction.js   a block of text and its links → timeline events (dates, precision, link)
src/shared/dateGrammars.js     how each language writes a date, as tables (fr, en)
src/shared/wikipediaPage.js    what a Wikipedia page is: article view, language, article links
src/shared/timeScale.js        a date as years; the window's zoom and pan; the graduations
src/shared/timelineLayout.js   an event's or an entry's weight; which events get a card at a zoom, and where
src/shared/myTimeline.js       the reader's timeline: entries, layers, tags, checks, backup merge
src/shared/richText.js         a description with links written [text](url), as { text, links }
test/shared/fixtures/          real Wikipedia excerpts (CC BY-SA), revision cited
scripts/build.js               esbuild: dist/chrome and dist/firefox; --watch for dev
test/                          mirrors src/
management/                    backlog and plan, French, gitignored
```

## Current state

**Where it stands.** A Manifest V3 extension built by esbuild for Chrome and
Firefox. On a French or English Wikipedia article it reads the dates of the
text (paragraphs and lists; not infoboxes nor tables) into events — date or
range, precision, sentence with its links, nearest article link, section —
and draws them in a banner above the text: a timeline zoomed with the wheel
or the buttons, panned by dragging or with the keys, where the heaviest
events get a card with the picture of their article (REST `page/summary`)
and the others a dot on the axis. A card scrolls the article to its date,
highlighted, and its ↗ opens the article it is about; every date read is
faintly highlighted in the text, and clicking one brings the banner back
centred on its event, its card drawn and set apart. A finger pans and
pinches. The + of a card, or the button shown below a selection of
the article (read leniently), opens a form that adds the event to the
reader's own timeline, typed by hand when no date is read. That timeline is
kept in `chrome.storage.local`: entries in layers (name, colour, shown or
hidden), with tags, a description with links, and a picture (the article's
thumbnail, a picture online, or a photo of the device). Its page, opened by
the toolbar button or the banner, draws it coloured by layer (a card opens
the page it was read in at its date, a text fragment), filters it by
tag, lists it, and exports it to a file (photos included) that another
device imports by merging. The plan, phase by phase, is
`management/backlog/frise.md`.
