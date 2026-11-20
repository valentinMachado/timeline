---
name: fix-across
description: >-
  After fixing, changing or extending one item — a date format the parser
  reads, a language, a browser, a site, a kind of timeline event, a layer, a
  piece of UI — find every sibling the same reasoning applies to and do the
  same there, in the same change, unasked, so the user never has to ask twice.
  Use whenever work lands on one item: a bug report ("sur cette page la date
  X n'est pas reconnue"), a feature request ("ça serait bien que..."), "corrige
  ça", "ce réglage ne sert à rien"... Runs before the work is reported done.
---

# Fix across

A remark the user makes about one item is almost never about that item alone.
The extension is built from a few families whose members share their
reasoning, so what is true of one is usually true of its siblings. **Every
change to an item ends with the same change on its look-alikes**, unasked.
This holds for a new feature exactly as for a bug fix.

**Doing it is the default; offering it is the failure.** Ending with "je peux
aussi le faire sur Y si vous voulez" when the same reasoning plainly applies
to Y is what this skill exists to prevent. Ask only when the sibling has a
real reason to differ that you can name.

## The families

- **Date formats**: a full date, a month and year, a year, a range, a
  century, "av. J.-C." / "BC", "il y a 65 millions d'années", a decade... A
  fix to one pattern is checked against every other.
- **Languages**: French and English at least — the date patterns, the month
  names, the UI strings (`_locales/*`). A pattern fixed in one language is
  fixed in the other.
- **Browsers**: Chrome and Firefox (`chrome.*` vs `browser.*`, manifest keys,
  permissions). What changes for one is checked on the other.
- **Sites**: Wikipedia's languages and skins first, other sites later. A
  selector or an extraction rule fixed on one page layout is checked on the
  others.
- **Timeline views**: the timeline generated for a page and the reader's own
  timeline with its layers — an event, a picture, a link, a zoom behaviour
  fixed on one is fixed on the other.

## The loop

1. **Do the work on the item the user named**, as usual.
2. **Name the pattern, not the instance.** One sentence, in general terms: "a
   date pattern that misses a non-breaking space", "a string shown without
   its translation", "a link that opens in the same tab". That sentence is
   what is searched for.
3. **Build it at the root when there is one.** If the siblings share a piece
   (a pattern table, a shared helper in `src/shared/`, one i18n file), put the
   change there once rather than item by item, and let each item override only
   what truly differs. Then check the items that override that piece.
4. **Sweep the siblings** with `Grep` on the code shape (the function, the
   key, the regular expression, the CSS class); for a broad sweep, one
   `Explore` agent with the pattern sentence.
5. **Decide each hit.**
   - The same reasoning holds → do it in the same change, adapted to the
     sibling. "The user only named X" is not a reason to differ.
   - The sibling has a reason to differ you can state in one sentence → leave
     it and say why.
   - Only when the difference is genuinely the user's taste → ask, once, in
     the report, after doing every other hit.
6. **Test** each item changed, as for the first, and run `npm test`.
7. **Report** in the reply, in French, a short section: the pattern in one
   line; the other items changed with it (or "aucun autre élément concerné",
   after having actually looked); the ones left alone and why.

## What does not count

- A change truly specific to one item still gets step 2, but the sweep may be
  one search that finds nothing. Say so in one line.
- Do not widen the change into a refactor the user did not ask for. A shared
  root that would need a new abstraction is proposed, not built.
