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

| Path          | Runs in                                               |
| ------------- | ----------------------------------------------------- |
| `src/shared/` | anywhere: content script, service worker, popup, Node |
| `test/`       | Node (`node:test`), mirroring `src/`                  |

**`src/shared/` is pure.** No DOM, no `chrome.*`/`browser.*`, no Node module.
It is what the tests reach without a browser, so the more of the logic lives
there — date parsing, layout arithmetic — the more of it is tested. ESLint
gives that folder no globals at all, so a stray `document` fails the lint.

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
