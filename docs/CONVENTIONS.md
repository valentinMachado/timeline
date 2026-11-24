# Conventions

The rules a change is expected to follow, and the reason behind each, so that a
contributor who has never seen the codebase — a person or a model — does not
reintroduce a shape the project already paid to remove. The root
[CLAUDE.md](../CLAUDE.md) is the short form of this file; when the two
disagree, this file wins and CLAUDE.md is stale.

Three meta-rules cover everything below:

- **The code is the truth.** A rule here that the code no longer follows is a
  bug in this file. Fix the file in the same change.
- **A rule is broken out loud or not at all.** Deviating is sometimes right.
  Say so in the commit body, with the reason.
- **Prefer the mechanism that makes the bug unrepresentable** over the patch
  that fixes this instance of it.

---

## 1. Language, comments, documentation

**Everything tracked by git is in English**: identifiers, JSDoc, comments,
commit messages, documentation. The owner often writes in French; that changes
nothing about the output. `management/` is the single exception: French and
gitignored, so it never leaves the machine.

**JSDoc on every declaration another file can reach**, and on any private
member whose purpose is not obvious from its name. The block says _why_ the
thing exists and its contract: inputs, outputs, what it throws.

**Inside a function body, comment only a line a careful reader would otherwise
get wrong**, in one or two lines. Do not narrate what the code does.

Solved problems are removed from the docs and the backlog, not ticked: git
history is the record of what was done, and a list of dead items hides the
live ones. An item only partly done is rewritten down to what is left.

---

## 2. Repository layout and module systems

Everything is ESM (`"type": "module"`).

| Path                | Runs in                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `src/shared/`       | anywhere: content script, service worker, popup, Node             |
| `src/content/`      | a web page, as a content script (DOM + `chrome.*`)                |
| `src/ui/`           | DOM, in a content script, a page or the site alike (see below)    |
| `src/web/`          | the installable site (PWA): its page, its worker, its manifest    |
| `src/pages/`        | the extension's own pages (`pages/x.html` + `x.js`)               |
| `src/background.js` | the background script: a worker (Chrome), an event page (Firefox) |
| `src/manifest.js`   | Node, at build time; pure, so the tests reach it                  |
| `src/_locales/`     | copied into the built extension; bundled into the site            |
| `scripts/`          | Node: the build                                                   |
| `test/`             | Node (`node:test`), mirroring `src/`                              |
| `dist/<browser>/`   | the built extension, gitignored                                   |
| `dist/web/`         | the built site, gitignored; published by `.github/workflows/`     |

**One source, specialised per browser.** `src/manifest.js` writes the
manifest once; what only Chrome or only Firefox needs is a row of its
`TARGETS` table, and `scripts/build.js` builds every target into
`dist/<browser>/`. Two hand-kept manifests would drift apart. The build finds
its entry points in the manifest itself: a script the manifest loads at
`content/x.js` is bundled from `src/content/x.js`, and a page of `PAGES` at
`pages/x.html` is copied and loads `pages/x.js`, so a new script or page is
added in one place. Both browsers expose the extension API as `chrome.*`, so the code
uses that name and needs no polyfill.

**The installable site is a third target, not a second codebase.** Chrome
on Android takes no extension, so the same article timeline is also built
into `dist/web/` (`src/web/manifest.js` lists its files), a site that
fetches an article from Wikipedia's Action API (`action=parse`, the site's
own HTML, which the extension's reading takes unchanged) and draws it with
the same `src/ui/articleTimeline.js`. What differs between the two is chosen
at build time, never tested at run time: a module that must differ is
imported by a `#name` of `package.json`'s `imports`, whose `web` condition
the site's build sets (`#i18n`: `chrome.i18n` in the extension, the bundled
`messages.json` on the site). Code in `src/ui/` touches `chrome.*` only
inside a function the site never calls, never when its module loads.

**A content script draws in a shadow root**, so that the page's styles do not
reach the extension's markup and its own do not leak into the page. On
Wikipedia it takes its colours from the site's design tokens
(`var(--color-base, …)`), which cross the shadow boundary, so it follows the
reader's light or dark theme.

**Every user-visible string is in `src/_locales/{en,fr}/messages.json`**,
English and French for now. `test/locales.test.js` fails on a key missing
from one language, a key the code asks for that does not exist, or a key
nobody uses.

**`src/shared/` is pure.** No DOM, no `chrome.*`/`browser.*`, no Node module.
It is what the tests reach without a browser, so the more of the logic lives
there — date parsing, layout arithmetic, the reader's timeline and its
backups — the more of it is tested. ESLint gives that folder no globals but
`URL`, which every place it runs has, so a stray `document` fails the lint.

**Every user-visible string goes through a literal `message("key")`**,
imported from `#i18n`, never a key picked at run time: the locales test
finds the keys the code uses by that call, and the `__MSG_key__` of the
extension's and the site's manifests.

**What works with a mouse works with a finger.** Firefox for Android runs the
extension: a gesture has its touch form (a pinch for the wheel, a press for
a hover), a control grows under `@media (pointer: coarse)`, and an API the
mobile browser lacks (`menus`) is not used for something the reader needs.

**Split by topic, never by line count.** A long file holding one coherent
topic is fine.

---

## 3. Formatting and lint

Prettier (`.prettierrc.json`: 80 columns, double quotes, trailing commas, LF)
and ESLint (`eslint.config.js`, flat config, `recommended`) are the whole style
guide. Both must be clean before a change is done.

- Do not reformat a file you are not otherwise changing; it buries the diff.
- Do not add an `eslint-disable` without a one-line reason next to it.
- No `debugger` statements, no debug `console.log`. `console.warn` is for a
  soft failure the developer must see.

---

## 4. The state a class holds

**A class holds the least state it can.** Every field is one more thing to
initialise, to keep in step with the others and to reset on teardown. A field
is kept for one of three things:

- **what somebody set** and nothing else remembers;
- **a resource to release**: a timer, a listener, an element to reach again;
- **an edge to detect**: what was last seen, to tell a change from a repeat.

Everything else is read where it lives: what can be worked out from another
field is a method; two fields that only make sense together are one; a copy
of what another object owns is asked of its owner each time.

---

## 5. Dates

`TimelineDate` is a day on the proleptic Gregorian calendar with astronomical
years (year 0 is 1 BC), from `MIN_YEAR` (about the Big Bang) to `MAX_YEAR`.
`Date` stops at ±273,790 years, which a page on geology or cosmology overruns;
inside that range `Date` is the tests' oracle. Months are 0-based like
`Date`'s. An invalid date throws a `RangeError` rather than being logged: a
date found on a page that does not exist must be refused where it is read.

**Reading dates from text** (`dateExtraction.js`) is one algorithm for every
language; what a language writes — months, eras, cue words, units, range
connectors — is an entry of `GRAMMARS` in `dateGrammars.js`. A new language
or a new spelling is a row in that table, never a branch in the algorithm.
The extraction prefers missing a date to inventing one: a bare number is a
year only with a cue, because a false event on a timeline is worse than a
missing one, which the reader can add. Every rule is tested on real excerpts
of Wikipedia, both languages alike.

**Drawing a timeline** is decided in `src/shared/` and only carried out in
`src/ui/`: where a date falls and how the window zooms
(`timeScale.js`), which events get a card at a zoom and where
(`timelineLayout.js`). An event's weight — what earns it a card when room
is short — is a function of its fields (`WEIGHTS`, a table), never a stored
field, so that a change of the rule reaches every event at once. Pictures
come from Wikipedia's REST API, asked only for the cards on screen, a few at
a time and once per page: the API is shared and asks for restraint. The
page's timeline and the reader's own are one view (`TimelineView`) fed with
items; what differs between them (colour, the button on a card, where a
picture comes from) is a field of the item or an option, not a second view.

**The reader's timeline** (`myTimeline.js`, stored by `src/ui/store.js`)
lives in `chrome.storage.local`, one key per entry, layer and photo, so that
two tabs never overwrite each other and listing never loads the photos. An
entry is in one layer; tags cut across. A date the reader types or selects
is read by the same extraction, leniently (a bare year is accepted). What
comes from a file — an imported backup — is checked field by field, and a
link is kept only when it is `http(s)`. Importing merges: the newer copy of
an object wins, nothing is deleted, so a phone's backup reaches a computer
without losing what is there.

---

## 6. Tests

`node:test`, files named `*.test.js` under `test/`, mirroring `src/`. A test
exercises the public API. Where an oracle exists (`Date` for dates), compare
against it over seeded random inputs rather than a handful of hand-picked
cases. What only a browser can show — layout, an injected page, the extension
loading — is said explicitly as not verified.

---

## 7. Git and workflow

- **Stage explicitly**: `git add <paths>`, never `git add -A` or `git add .`.
  If `git status` shows a change you did not make, ask before including it.
- Commit only when asked. Subject: short, imperative, English. Body: the _why_
  for anything a reader could not reconstruct from the diff. AI-assisted
  commits carry the `Co-Authored-By` trailer.
- Never commit `.env`, `dist/`, `database/`, `management/`.
- **Adding, removing or upgrading a dependency is a decision for the owner**,
  not a side effect of a fix.
- Plans and scratch notes go in `management/` (gitignored), never in a tracked
  file at the root.
- A task too long for one session follows the `phased-delivery` skill; a change
  on one item follows the `fix-across` skill.

---

## 8. Definition of done

- [ ] `npm test`, `npm run lint`, `npm run format:check` are clean.
- [ ] New behaviour has tests in the same change.
- [ ] Every new user-visible string exists in both languages.
- [ ] The same change landed on the item's siblings (`fix-across`).
- [ ] Docs are updated where the change moved what they describe.
- [ ] Every backlog entry the change finished is deleted.
- [ ] What could not be verified in a browser is stated, not implied.
- [ ] Only the files this change touched are staged.
