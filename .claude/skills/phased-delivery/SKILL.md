---
name: phased-delivery
description: >-
  How a long task is delivered in this repository: one phase per session,
  carried to the commit, then a hand-off prompt for a fresh session. Use
  whenever a task has phases (a phased plan in a backlog file, a feature too
  large for one sitting, a run of backlog items), when a phase has just been
  implemented and checked, or when the user says "commit", "on valide", "phase
  suivante" or asks what is left. The user must never have to remind you of
  any step below.
---

# Phased delivery

A task too large for one session is cut into phases. Each session delivers
**one** phase, all the way to the commit, and ends by handing the user a prompt
that a cold session can start from. The user asked for this loop and should
not have to ask for any step of it again.

## The loop

1. **Name the phases.** At the start, list them briefly in chat. The written
   plan lives in the backlog file the items come from
   (`management/backlog/frise.md`...), never in a new plan file at the root.
   **A plan the user details, write down as soon as it outgrows a hand-off
   prompt**: their own words and every decision, the asides they add
   mid-phase ("et aussi…") included, go into a section of its own in that
   backlog file, kept up to date as decisions land. A design too long for that
   section gets a file of its own beside it, which the section points at. The
   hand-off prompt then points at that section rather than summarising it.
   **Estimate the model every phase needs** and write it in every phase
   heading (`### P2. … (Fable)`, `### P1. … (Sonnet)`), with the reason in a
   few words when it is not Opus. Sonnet for a phase that is mechanical or
   follows a pattern already in the code; Opus by default; Fable for a phase
   that needs a design nobody has written yet or reasoning across many parts.
2. **Do the current phase only.** Do not start the next one, even if it looks
   small. After two or three committed backlog items, when the next one is
   heavier, propose switching sessions yourself.
3. **Finish it.** CLAUDE.md rule 9: `npm test`, `npm run lint`,
   `npm run format:check` clean, both languages, docs. Apply the `fix-across`
   skill. Say what was not verified in a browser (the extension loaded in
   Chrome and in Firefox, the timeline drawn on a real page).
4. **Ask for validation, then commit when the user says so.** Present what
   shipped and what was not verified; when the user validates ("commit", "ok",
   "valide"), stage files explicitly (rule 10) and commit (rule 11). A
   validation asked for up front counts once the checks are green.
5. **Clean the backlog.** The delivered phase leaves the plan (rule 15):
   deleted, never ticked. Update CLAUDE.md's _Current state_ if the phase
   changed what it says (rule 16).
6. **Hand off.** End the session's last message with the prompt for the next
   phase, unprompted.

## A management session

Some sessions write no code: the user calls them **management sessions**
(« séance de cadrage »). You discuss how a feature will work, the plan or the
backlog, and settle them together. Its deliverable is what was settled,
written down in `management/`, with the user's decisions in their words, the
options weighed, and what is left to decide. No code, no test run, no commit —
only a tracked file the discussion changed (a rule in `docs/CONVENTIONS.md`,
this skill) is committed, when the user says so. It still hands off.

## The hand-off prompt

A fenced block the user pastes into a new session. **The line just above the
block names the model to open the next session with** (« Session suivante :
Opus »), and the block's first line says it again. The block stands alone:

- the goal of the whole task in one or two sentences;
- what earlier phases shipped, with the commit hashes;
- **no list of decisions**: a decision is written where it belongs the moment
  it is taken (the plan's section in the backlog file, `docs/CONVENTIONS.md`,
  the JSDoc); the prompt points at those places;
- the next phase, pointing at the plan in the backlog file rather than copying
  it;
- the model the next phase needs, and why when it is not Opus;
- the phases after it, one line each, each with its model;
- the instruction to follow this skill (`phased-delivery`) for that phase.

Write it in the language the user writes to you in.
