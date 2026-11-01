# HoloStudy (Godot): checked NCERT study notes, practice for every chapter, and an online release

*   **Author:** HoloStudy project owner (drafted with Claude Code)
*   **Status:** In Review (v2, revised after the EGM review of 2026-11-01; see
    `docs/egm/consolidated_review_report.md`)
*   **Date:** 2026-11-01

--------------------------------------------------------------------------------

## Overview

HoloStudy is a study app for Class 11 and 12 NCERT Physics, Chemistry and
Biology, the NEET subjects. The project delivers **condensed study notes**
("crunched notes") for every chapter:
*   Listen voice notes
*   key points
*   key terms with definitions
*   a recall quiz
*   multiple-choice practice
*   3-D holograms

The Godot edition (`godot/`) runs in a web browser. This plan makes its six
built-in books (79 chapters) **correct against the official NCERT PDFs**,
gives **every chapter practice questions**, and **puts the app online**.

**Terms used in this plan**

| Term | Meaning |
|---|---|
| NCERT PDFs | The official chapter files kept on the developer's PC in `C:\Users\SSIG FAMILY\Documents\cbse\{biology\biologyyy, chemistry\chem, physics\phy}`. All 79 chapter files are byte-identical to the files at ncert.nic.in. The folders also hold `*ps.pdf` (each book's front pages and contents), `*an.pdf` (answers to exercises) and `*a1.pdf` (appendices). |
| NCERT file code | The NCERT file name, for example `kebo102` = Class 11 (`k`) Biology (`bo`) part 1, chapter 2. Part 2 files (`keph201`…) continue the chapter numbers. The rule already exists in `godot/web/import/driver.js` (`NCERT_PACK`, `NCERT_PART1`). |
| Source text | `engines/study/holostudy-demos.js`: the plain chapter text of all six books, with `[[page N]]` page markers and `##` / `###` section headings. Every other part of the app is made from it. |
| Scanner | The rule-based code in `engines/study/study.html` that turns source text into chapters, sections, voice notes and study items. Its `Analytics` part picks key terms, key points, the summary and the recall quiz. |
| Converter | The "Add a PDF" code: `godot/web/import/driver.js` plus the scanner, bundled by `tools/godot-import.mjs` (`bundle()`) into `build/godot-web/import/holostudy-import.js`. It exposes `window.HoloImport`. |
| Study items | The things a student reads or answers. **Key term** (a term and its definition sentence). **Key point**: a summary sentence. The summary and Listen's key points are the same sentences (`c.keyNotes` is a copy of `c.summary`). **Recall quiz item**: a fill-in-the-blank question built from a key term's definition (`Analytics.quiz`). **Practice MCQ**: a fill-in-the-blank question made by `makeMCQs` in driver.js, with fields `q, o, a, h, t, p` (question, options, answer index, after-answer hint with the source sentence, topic tag, page). |
| TypeSafe, Jev | TypeSafe is a hosted API (`POST https://api.typesafe.ai/v1/systemone`). Its model Jev reads text that code supplies (the **state**) and answers typed questions: a **noul** gives the probability (0–1) that a statement is true. Code makes the decisions from those probabilities. |

## The Problem

A check of Biology Class 11, chapter 2 ("Biological Classification") shows the
kinds of errors in the built-in content:

| What the app shows | What is wrong | Where it comes from |
|---|---|---|
| Sections 2.2.1, then 2.2.3 | The heading "2.2.2 Dinoflagellates" is missing. Its paragraph is there, starting "Dinoflagellates These organisms…" | The source text lost the heading |
| Key term "Kingdom", defined as "This kingdom is characterised by heterotrophic eukaryotic organisms that are multicellular and their cells lack cell walls." | The sentence is about Kingdom Animalia, not the word "kingdom" | Scanner rules picked the wrong term |
| Recall quiz: "This ______ is characterised by heterotrophic eukaryotic organisms…", answer "Kingdom" | The expected answer is wrong, and the question can't be answered on its own | Built from the wrong key term |
| Key point: "Hence the two kingdom classification used for a long time was found inadequate." | Starts with "Hence"; needs the sentence before it | Scanner rules |

The source text was made on 2026-09-24 by a script that is no longer in the
repository, so its errors can't be fixed where they started.

Two more gaps:
*   **No practice for the NEET subjects:** `godot/content/practice.json` has only
    Class 10 Maths and an Algebra drill.
*   **Not online:** the app runs only on the developer's PC
    (`http://127.0.0.1:8060`).

Ten files of finished work are not committed:
*   six changed files
*   `godot/scripts/capacity_test.gd` and `godot/scripts/capacity_test.gd.uid`
*   `tools/godot-capacity.mjs`
*   `tools/godot-pdfsuite.mjs`

## Goals

*   **G1, every section present:** each numbered section heading printed in an
    NCERT chapter PDF is in that chapter's section list. Target: 78 of 79
    chapters. The 79th, `lech104` (Chemistry 12, chapter 4), has a two-column
    layout the converter can't read cleanly; it keeps its current text and is
    listed in the report.
*   **G2, correct page numbers:** every study item shows the page it is printed
    on. The app's page number for a chapter equals the earlier chapters' PDF
    page counts plus the page within this PDF, which is the printed page number
    (checked for Biology 11: `kebo102.pdf` page 1 prints "10" and the app shows
    10).
*   **G3, study items that make sense:** every key term, key point, recall quiz
    item and practice MCQ the app ships has passed the checks in the Technical
    Plan. Measured two ways:
    *   On 60 hand-labelled items held out from tuning (20 each for T1, T2 and
        T4), the checks agree with the labels on at least 54 (90%) and wrongly
        remove at most 6.
    *   On a 50-item check against the PDF (40 kept items and 10 removed items,
        spread across item types and subjects), at most 2 of the 40 kept items
        are wrong and at most 3 of the 10 removed items were good.
*   **G4, practice for every chapter:**
    *   each chapter has at least 20 checked practice MCQs in Practice, in both
        Practice modes (Tap & answer and Space shooter);
    *   release requires at least 70 of 79 chapters at 20 or more, and every
        chapter at 10 or more.
*   **G5, the right chapters:** `data/syllabus-check.md` compares the app's
    chapter list with the books' own contents and "rationalised content" notes
    (in `*ps.pdf`), and with the NEET UG syllabus published by the National
    Medical Commission. Each difference gets a recorded decision: keep, add or
    remove.
*   **G6, fast online:** the app is served from a public address. On a 10 Mbit/s
    connection, a first visit reaches Home in 20 seconds or less and a repeat
    visit in 4 seconds or less, measured at that address.
*   **G7, nothing lost:**
    *   the ten pending files are committed;
    *   `node tools/test-import.mjs` passes with **exact** equality;
    *   the browser walkthrough (`node tools/godot-webtest.mjs`) passes all of
        its steps (90 today, plus the new ones);
    *   the desktop walkthrough (`godot --headless --path godot -- --autotest`)
        passes all of its steps (83 today, plus the new ones);
    *   `node tools/godot-pdfsuite.mjs` prints 78 of 79 or more clean.

## Non-Goals

*   TypeSafe inside the app. Every TypeSafe call runs on the developer's PC
    while content is built; no student data is sent anywhere by this plan.
*   Rewriting, re-labelling or joining NCERT sentences. Checks only **keep or
    remove** items.
*   Scoring how important a summary point is. Summary selection stays as it is.
*   Changing the scanner's selection rules (`Analytics`). Any rule change gets a
    plan of its own, because it changes every item and needs a full re-check.
*   Practice in the web console or the Android app (they get the corrected
    notes, not new practice).
*   NCERT exercise questions with the official answers from `*an.pdf` (see
    Future Improvements).
*   New holograms, Ask AI in Godot, search, an iOS app, app stores, Class 10
    Maths.

## Decisions Made

*   **Copyright (was Q1):** on 2026-11-01 the project owner decided to proceed
    with no copyright gate: "we just deliver crunched notes for every student to
    learn". See Risks for what is public.
*   **Reference sources (was Q4):** the owner supplied the NCERT PDFs. Chapter
    contents come from those files; the NEET syllabus comes from the National
    Medical Commission website, checked once.
*   **Progress after the update:** voice notes and key points are stored by
    position (`"<i>"`, `"k<i>"` in `godot/scripts/app.gd`). After the corrected
    content ships, the ticks of the built-in chapters are cleared once. Chapter
    position, quiz scores and added books are kept.
*   **App updates:** after a release, a returning student gets it the next time
    the app is opened after being fully closed (Godot's offline cache). No
    forced update is added.

## Open Questions (the owner is completing these)

*   **Q2, TypeSafe key:** create a key at https://console.typesafe.ai/keys and
    store it as the Windows user environment variable `TYPESAFE_API_KEY`. Cost
    estimate:
    *   about 2,200 requests (one per section per pass) at about 1,500 tokens of
        section text each, plus about 17,000 questions at about 60 tokens each;
    *   that is about 4.5 million input tokens, or about $0.19 at $0.042 per
        million (output tokens are not billed).

    Phases 0 and 1 don't need the key.
*   **Q3, GitHub access:** the repository `GeorgeElavarasan777/neet-hologram-s`
    is public. The PC's account `peaceprintables37-coder` can read but not push.
    Either the owner adds that account as a collaborator with Write access, or
    git on this PC signs in as `GeorgeElavarasan777`. Turning on GitHub Pages
    needs the repository owner (Admin) once. Phase 3 needs this.

## Critical User Journeys (CUJs)

### CUJ 1: A student studies a built-in chapter

*   **Given**: the student opens the public address on a phone.
*   **When**: they open Biology 11 › chapter 2, use Listen, Read and Summary,
    then tap **Practice** on the chapter sheet.
*   **Then**:
    *   "2.2.2 Dinoflagellates" is in the section list.
    *   Each key term's definition is about that term.
    *   Each key point makes sense on its own and shows its printed page.
    *   Practice opens with this chapter chosen and offers at least 20
        questions, each with one right answer. After answering, the student sees
        the book's sentence and page.

### CUJ 2: The developer checks the content

*   **Given**: the source text has been rebuilt, and `TYPESAFE_API_KEY` is set.
*   **When**: they run `node tools/content-review.mjs`.
*   **Then**:
    *   `data/content-review/verdicts.json` and `REPORT.md` are written.
    *   A second run with nothing changed makes no API calls and writes
        identical files.

### CUJ 3: The developer publishes

*   **Given**: the check is complete for the current content, and Q3 is done.
*   **When**: they run `node tools/godot-publish.mjs`.
*   **Then**: the tool refuses if any shipped item lacks a verdict; otherwise it
    publishes to the `gh-pages` branch and prints the public address.

### CUJ 4: TypeSafe can't be reached

*   **When**: the API fails or the key is missing.
*   **Then**:
    *   The code checks still run, and `REPORT.md` is written with their
        results.
    *   The tool then stops with the failed request's id. No failed request ever
        becomes a verdict.

## Technical Plan (Architecture)

### Data flow

```text
NCERT PDFs (Documents\cbse\…, 79 chapters)
  │
  ├─► tools/ncert-rebuild.mjs (converter in headless Edge, frozen word list)
  │     └─► engines/study/holostudy-demos.js  (rebuilt source text)
  │           └─ one-time "nothing lost" diff vs the old file
  │
  └─► pdftotext (independent of the converter) ──┐
                                                  ▼
tools/content-review.mjs (Node, bundle() in a vm, like tools/test-import.mjs)
  Pass 1: scanner on source text → key terms, key points, recall quiz
          Stage A code checks → Stage B TypeSafe T1, T2 → Stage C keep/remove
  Pass 2: practice MCQs from the filtered chapters → Stage A → T4 → keep/remove
  └─► data/content-review/verdicts.json  (committed)
      data/content-review/REPORT.md
                                                  │
engines/study/study.html: ReviewFilter applies verdicts after Analytics,
for built-in books only, in the web console, Android and the converter
                                                  │
tools/godot-content.mjs → packs (filtered) + practice.json (NCERT MCQ groups)
  → tools/godot-build.mjs → build/godot-web → tools/godot-publish.mjs → gh-pages
```

### Source rebuild (fixes G1 and G2 at the root)

*   **What it does:** `tools/ncert-rebuild.mjs` converts each NCERT chapter PDF
    with the existing converter in headless Edge, using the code that
    `tools/godot-pdfsuite.mjs` uses today. It then writes `holostudy-demos.js`
    in its existing format, one chapter after another, with book pages numbered
    as in G2.
*   **Frozen word list:** the converter splits glued words with a word list.
    Today `words.txt` is made from the packs, which the rebuild replaces, so
    each rebuild would feed on the last one. The current list is saved once as
    `data/words-frozen.txt`, and `tools/godot-import.mjs` uses that file from
    then on.
*   **"Nothing lost" check, run once before the old file is replaced:** every
    paragraph of the old source text must appear in the new one (at least 90%
    of its 5-word sequences found). Paragraphs below that are listed, and the
    rebuild is accepted only after each one is looked at.
*   **`lech104`** keeps its current text.
*   **Page check:** where a page shows a printed page number, the rebuild checks
    it against the computed book page and lists any differences.

### Stage A: checks in code

| Check | Applies to | Result |
|---|---|---|
| **A1 Sections** | Each chapter | Headings found by `pdftotext` with the pattern `^\d{1,2}\.\d{1,2}(\.\d{1,2})?\s+[A-Z]` must all be in the chapter's sections. A missing heading is an **open failure** (it blocks release). This check doesn't use the converter, so a heading the converter misses can't hide. |
| **A2 Leans on the sentence before** | Key-term definitions, key points, recall quiz items | The converter's existing `LEANS` and `LEAD` patterns (sentences starting "This", "It", "Hence", "Thus"…) mean **remove** |
| **A3 Question mechanics** | Recall quiz items, practice MCQs | The checks already in `tools/test-import.mjs`: one answer among distinct options, answer blanked, no option visible in the question. Failure means **remove**. |

### Stage B: TypeSafe questions

*   **Where the wording lives:** questions, criteria, thresholds and the model
    (`jev-1.14.0`, pinned) are in one module, `tools/typesafe/questions.mjs`.
    This plan states what each question decides; that module holds the exact
    wording.
*   **One request per chapter section.** The state is
    `{chapter, section, paragraphs: {p1: "...", p2: "..."}}`. Each question
    names its own item in its instructions and points at its paragraph by path.
    Question names are `<kind>_<hash8>_<question>`, where `hash8` is the first
    8 hex digits of the SHA-256 of the item's normalised text. A section over
    48,000 estimated tokens (4 characters per token) is split into several
    requests that each carry only their own paragraphs.

```json
{"model": "jev-1.14.0",
 "state": {"chapter": "Biological Classification", "section": "2.4 Kingdom Animalia",
           "paragraphs": {"p3": "This kingdom is characterised by heterotrophic eukaryotic organisms…"}},
 "questions": {"term_1a2b3c4d_defines": {"type": "noul",
   "instructions": "Does the sentence in `paragraphs.p3` explain what the term 'Kingdom' means?",
   "criteria": {"true": "The sentence says what the term is, for example 'Mitochondria are the sites of aerobic respiration' for 'mitochondria'.",
                "false": "The sentence describes one particular member of a group and the term is the general word for that group."}}}}
```
Response: `{"answers": {"term_1a2b3c4d_defines": {"type": "noul", "noul": 0.08}}, "usage": {"input_tokens": 212, "output_tokens": 9}}`

| Question | Asked about | Statement judged |
|---|---|---|
| **T1 `defines`** | Each key term left after Stage A | The definition sentence explains what the term means |
| **T2 `point_alone`** | Each key point left after Stage A | A student can understand the point without the sentence before it |
| **T4 `fits_<n>`** | Each option of each practice MCQ | This option in the blank makes the question true, according to its source paragraph |
| **T4 `mcq_alone`** | Each practice MCQ | A student can answer it without the sentence before it in the book |

### Stage C: keep or remove (decisions in code)

**Thresholds:** 0.7 or more counts as yes, 0.3 or less as no, and anything in
between as unsure.

**Verdict shape:** `{key, action, answers}`.
*   `key` is (pack, chapter, kind, sha256 of the normalised text, question
    version).
*   `action` is `keep` or `remove`.
*   Key terms also carry `answer: true | false`.
*   Practice MCQs also carry `options`: the option indexes kept, right answer
    first.

| Item | Rule |
|---|---|
| Key term | T1 yes → `keep`, `answer: true`. Unsure → `keep`, `answer: false`: stays in the Key terms list, but no quiz or MCQ may use it as the answer. No → `remove`. |
| Key point | T2 no → `remove`; otherwise `keep` |
| Recall quiz item | `keep` only if its key term is kept with `answer: true` and it passed A2 and A3; otherwise `remove` |
| Practice MCQ | `remove` if `mcq_alone` is not yes, or the right option's `fits` is not yes. Otherwise drop every wrong option whose `fits` is unsure or yes. `keep` with the remaining options if 2 or more wrong options remain; otherwise `remove`. |

**Rules for applying verdicts:**
*   Verdicts are applied **after** the scanner has chosen. The scanner never
    chooses again, so no unchecked item can take a removed item's place.
*   A shipped item with no verdict for the current question version is an
    **open failure**.

### One shared filter

`ReviewFilter.apply(doc, verdicts)` is added to `engines/study/study.html` and
runs right after `Analytics`, for built-in books only. Added PDFs have no
verdicts, so nothing changes for them.

**Where the verdicts reach:** they ship as
`engines/study/holostudy-review.js` (`window.DEMO_REVIEW`), next to
`holostudy-demos.js`. Because the converter bundles the scanner, the same
filter reaches:
*   the web console
*   the Android app
*   `tools/godot-content.mjs`
*   `tools/test-import.mjs`

`test-import` then compares like with like, and requires exact equality.

### Practice for the NEET subjects

*   **Where the questions go:** `tools/godot-content.mjs` adds six groups
    (`ncert-physics11` … `ncert-biology12`) to `practice.json`. Each chapter is
    in the existing bank shape:
    `{id: "<pack>-<n>", title, color: <subject color>, group, gens: [[{q,o,a,h,t,p}, …]], book: true}`.
    `book: true` gives the shooter's "look on page …" hint.
*   **Game code:** none. Practice already lists `practice.json` groups.
*   **Small UI edits:**
    *   the "Class 10 maths" labels in `home.gd` and `practice.gd`;
    *   a **Practice** button on built-in chapter sheets (`subject.gd`), as
        added books already have.
*   **Topic fix in `makeMCQs`:** when a question has no section, its topic tag
    falls back to the answer itself (`t: sec || right`). It now falls back to
    the chapter title.

### Chapter list check (G5)

A one-time task:
*   Read the contents and the "rationalised content" note in each `*ps.pdf`.
*   Read the NEET UG syllabus on the National Medical Commission website.
*   Write `data/syllabus-check.md` with a decision for each difference. A
    decision to add or remove a chapter is recorded only, and goes into a later
    plan.

### Online release

*   **Host:** GitHub Pages, from an orphan `gh-pages` branch that holds one
    commit with the build. Each publish replaces that commit with a force-push
    of that branch only.
*   **Headers:** the single-threaded web build needs no COOP or COEP headers.
*   **Size:** the build is about 86 MB, within Pages' 1 GB site and 100 MB file
    limits.
*   **G6 check:** measured at the public address with Edge DevTools set to
    10 Mbit/s and 40 ms latency. Also record the `Content-Encoding` of
    `index.wasm` and `index.pck` with `curl -sI`. The engine is about 38 MB raw
    and about 9 MB compressed, so G6 depends on Pages compressing it. If G6
    fails, revisit Alternative F.

## Alternatives Considered

### Alternative A: Review all content by hand
*   **Pros**: a person's judgment.
*   **Cons**: about 5,600 study items to check (about 1,900 key terms, 700 key
    points, 630 recall quiz items and 2,400 practice MCQs), plus about 12,000
    voice notes; must be repeated after every content change.
*   **Reason for Rejection**: too slow to repeat. A person still checks 50 items
    (G3).

### Alternative B: Ask a large language model to review and rewrite items
*   **Pros**: can fix items, not only judge them.
*   **Cons**: rewritten sentences are new, unchecked text, not NCERT's wording.
    Free-form judgments are harder to apply the same way twice than one pinned
    model's probabilities.
*   **Reason for Rejection**: this plan keeps NCERT's sentences and needs one
    probability per question that code compares with fixed thresholds.

### Alternative C: Improve the scanner rules only
*   **Pros**: no API.
*   **Cons**: "does this sentence define this word?" is a reading judgment, and
    every rule change shifts all items.
*   **Reason for Rejection**: rules still do the exact checks (Stage A); rule
    changes get their own plan.

### Alternative D: Patch the old source text instead of rebuilding it
*   **Pros**: smaller change.
*   **Cons**: needs a hand-kept file of heading insertions and text edits, and
    the script that made the text is gone.
*   **Reason for Rejection**: rebuilding from the PDFs fixes the cause for the
    web console, Android and Godot at once.

### Alternative E: Apply verdicts in the Godot build only
*   **Pros**: doesn't touch the web console.
*   **Cons**: the web console and Android would keep the wrong items, and
    `test-import` would break.
*   **Reason for Rejection**: one shared filter keeps every version the same.

### Alternative F: Host on Netlify or Cloudflare Pages
*   **Pros**: their header files (`_headers`) control compression and caching.
*   **Cons**: another account and service.
*   **Reason for Rejection**: GitHub Pages first, because the repository is
    already there. Revisit if G6 fails.

### Alternative G: TypeSafe inside the app for students' own PDFs
*   **Reason for Rejection**: no server to hold a key, and the student's text
    would leave the device. See Future Improvements.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy:**
    *   The key is read only from `TYPESAFE_API_KEY` (process, or Windows user
        environment). It is never written to a file, the repository or the
        build.
    *   The TypeSafe cache `tools/.typesafe-cache/` is gitignored.
    *   Phase 0 adds `isEvalSupported: false` to both `pdfjsLib.getDocument`
        calls in `engines/study/study.html`. This mitigates CVE-2024-4367 (a
        malicious PDF running code), as the Godot converter already does.
*   **Repeatability:**
    *   The cache key is the SHA-256 of the model name plus the exact request
        body; each cache file holds the request and the answer.
    *   `verdicts.json` keeps the answers behind every verdict, so a fresh clone
        can rebuild without new API calls.
*   **Failure handling:**
    *   HTTP 429 is retried up to 5 times, waiting `retry-after` seconds, or 2,
        4, 8, 16 and 32 seconds when the header is missing.
    *   Network errors, other HTTP errors or a missing key stop the run after
        `REPORT.md` has been written with the Stage A results.
*   **Risks and limits:**
    *   **Request size:** TypeSafe allows 64k tokens per request and 32k per
        question, which is why sections are split at 48k.
    *   **Traffic:** GitHub Pages has a soft limit of 100 GB of traffic a month,
        about 2,000 to 8,000 first visits.
    *   **Model retirement:** if the pinned model is retired, only re-runs are
        affected, because committed verdicts stay valid.
    *   **Over-removal:** the checks lean towards removing items. G3's removed-
        item sample and the held-out labels measure how many good items are
        lost.
    *   **What is public:** the repository is public and already contains the
        full chapter text (`holostudy-demos.js`). The Read tab shows the full
        text too, not only notes. The owner accepted this (Decisions Made).

--------------------------------------------------------------------------------

### Additional Resources

*   TypeSafe: https://docs.typesafe.ai/go/api.md,
    https://docs.typesafe.ai/go/models.md (pricing, limits),
    https://docs.typesafe.ai/introduction/quickstart.md (key)
*   EGM review reports: `docs/egm/*.md`
*   Existing code reused: `tools/test-import.mjs` (bundle in Node),
    `tools/godot-pdfsuite.mjs` (converter in Edge), `godot/web/import/driver.js`
    (`LEANS`, `LEAD`, `makeMCQs`, `termForms`, `HoloImport._test`),
    `godot/scripts/practice/practice_bank.gd`

### Future Improvements

*   **NCERT exercises with official answers:** Physics and Chemistry numericals
    from each chapter's exercises, checked against `*an.pdf`.
*   **Second opinion:** send only "unsure" items to a person or a larger model.
*   **TypeSafe for students' own PDFs:** optional, with their own key.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The work is in four phases. Each phase ends with a checkpoint: commands that
must pass before the next phase starts.

### Phase 0: safety and saving work (no key, no GitHub needed)

#### 0.1 `engines/study/study.html` (Modify)
*   **Type / Scope**: study console, security.
*   **Proposed Changes**: add `isEvalSupported: false` to the two
    `pdfjsLib.getDocument({ data: … })` calls: in the PDF reader, and where a
    stored file is reopened.

#### 0.2 `.gitignore` (Modify)
*   **Type / Scope**: config.
*   **Proposed Changes**: add `tools/.typesafe-cache/` and `tools/.edge-*/`.

#### 0.3 Pending work (Commit)
*   **Type / Scope**: version control.
*   **Proposed Changes**: commit the ten files listed in The Problem, with 0.1
    and 0.2. Run `git status` first; it is the source of truth for the list.

**Checkpoint 0:**
*   `node tools/godot-build.mjs`
*   `node tools/godot-webtest.mjs`: all steps pass
*   `godot --headless --path godot -- --autotest`: all steps pass
*   `node tools/test-import.mjs`: exit 0
*   `bash tools/gdcheck.sh`: no errors
*   commit made

### Phase 1: rebuild and code checks (no key needed)

#### 1.1 `tools/lib/edge-convert.mjs` (Create)
*   **Type / Scope**: Node module, taken out of `tools/godot-pdfsuite.mjs`.
*   **Proposed Changes**:
    *   `openConverter({ webRoot, wordList }) → { convert(pdfPath) → { pack, pageTexts, pageCount }, close() }`.
    *   It starts the static server and headless Edge (profile under
        `tools/.edge-convert/`) and calls `HoloImport` in the page.
    *   It needs only `build/godot-web/import/`, which
        `node tools/godot-import.mjs` builds without Godot.

#### 1.2 `tools/godot-pdfsuite.mjs` (Modify)
*   **Type / Scope**: test tool.
*   **Proposed Changes**: use `edge-convert.mjs`. The output and scoring stay
    the same.

#### 1.3 `data/words-frozen.txt` (Create) and `tools/godot-import.mjs` (Modify)
*   **Type / Scope**: data and build.
*   **Proposed Changes**:
    *   Copy today's generated `build/godot-web/import/words.txt` once into
        `data/words-frozen.txt`.
    *   `words()` in `godot-import.mjs` returns that file's contents when the
        file exists.

#### 1.4 `data/ncert-sources.json` (Create, written by 1.5)
*   **Type / Scope**: data.
*   **Proposed Changes**:
    *   `{ "roots": ["C:/Users/SSIG FAMILY/Documents/cbse/biology/biologyyy", ".../chemistry/chem", ".../physics/phy"], "files": { "<code>": { "sha256", "pages", "pack", "chapter", "firstPage" } } }`.
    *   Codes come from `data/curriculum.js` plus the `NCERT_PACK` and
        `NCERT_PART1` rule.

#### 1.5 `tools/ncert-rebuild.mjs` (Create)
*   **Type / Scope**: Node script.
*   **Proposed Changes**:
    *   `node tools/ncert-rebuild.mjs [--only <pack>] [--accept]`.
    *   It finds each chapter's `<code>.pdf` under `roots` and checks its
        SHA-256 against `ncert-sources.json`. A new file is recorded; a changed
        file stops the run unless `--accept` is given.
    *   It converts the PDF with `edge-convert.mjs` and writes
        `engines/study/holostudy-demos.new.js` in the existing format.
    *   It runs the "nothing lost" diff and the page check, writing
        `data/content-review/rebuild.md`.
    *   With `--accept`, it replaces `holostudy-demos.js`.
    *   `lech104` keeps its old text.

#### 1.6 `tools/content-review.mjs` (Create; Stage A only in this phase)
*   **Type / Scope**: Node script; loads `bundle()` in a `vm` the way
    `tools/test-import.mjs` does.
*   **Proposed Changes**:
    *   `node tools/content-review.mjs [--only <pack>] [--no-judge] [--sample N --seed S] [--verify]`.
    *   Exports `stageA(chapter, pdfHeadings)` and `decide(kind, item, answers)`
        for unit tests.
    *   Runs A1 on `pdftotext -layout` output (the `pdftotext` that comes with
        Git for Windows) and A2/A3 on the scanner's items.
    *   Pass 2 makes practice MCQs with `HoloImport._test.makeMCQs` and
        `termForms` on the filtered chapters, then runs A3 on them.
    *   Prints a per-chapter MCQ count.

**Checkpoint 1:**
*   `node tools/ncert-rebuild.mjs` (review `rebuild.md`), then `--accept`
*   `node tools/godot-build.mjs --content`, then `python tools/godot-fonts.py`
*   `node tools/test-import.mjs`: exit 0
*   `node tools/content-review.mjs --no-judge`:
    *   A1 passes on 78 of 79 chapters;
    *   the MCQ counts are recorded in `REPORT.md`;
    *   if fewer than 70 chapters reach 20 before T4, raise `makeMCQs`' caps
        (30 per chapter, 24 terms) for built-in books only, and record the
        change.
*   `node tools/godot-pdfsuite.mjs "<roots>"`: prints 78 of 79 or more clean
*   commit

### Phase 2: TypeSafe checks and Practice (needs `TYPESAFE_API_KEY`)

#### 2.1 `tools/typesafe/client.mjs` (Create)
*   **Type / Scope**: Node module.
*   **Proposed Changes**:
    *   `createClient({ apiKey, baseUrl = 'https://api.typesafe.ai', fetch = globalThis.fetch, cacheDir })`
        returns `ask(state, questions) → answers`.
    *   Cache, retries and errors as in Non-Functional Requirements.
    *   Each error names the request's `hash8`.

#### 2.2 `tools/typesafe/questions.mjs` (Create)
*   **Type / Scope**: Node module, the single source for question wording.
*   **Proposed Changes**:
    *   `MODEL`, `VERSION`, `YES = 0.7`, `NO = 0.3`.
    *   Builders `t1(term)`, `t2(point)`, `t4(mcq)` that return named questions
        for one section's request.

#### 2.3 `tools/content-review.mjs` (Modify)
*   **Type / Scope**: adds Stage B and Stage C.
*   **Proposed Changes**:
    *   Pass 1: T1 and T2, then `decide()`.
    *   Pass 2: T4 on the MCQs made from the pass-1-filtered chapters.
    *   Writes `data/content-review/verdicts.json` (`{version, model, items: {<key>: {action, answer?, options?, answers}}}`)
        and `REPORT.md` (counts, open failures, MCQs per chapter).
    *   `--verify` exits non-zero on any open failure.
    *   `--sample 50 --seed S` writes `sample.md` (40 kept, 10 removed, spread
        across item types and subjects).

#### 2.4 `engines/study/study.html` (Modify) and `engines/study/holostudy-review.js` (Create)
*   **Type / Scope**: the shared scanner.
*   **Proposed Changes**:
    *   `ReviewFilter.apply(doc, verdicts)` runs after `Analytics`, only when
        `window.DEMO_REVIEW` has the book.
    *   It removes items, applies `answer: false` and keeps MCQ options.
    *   `content-review` writes `holostudy-review.js` from `verdicts.json`.
    *   `ReviewFilter` is added to `FROM_STUDY` in `tools/godot-import.mjs`.

#### 2.5 `godot/web/import/driver.js` (Modify)
*   **Type / Scope**: converter.
*   **Proposed Changes**: in `makeMCQs`, the topic falls back to the chapter
    title instead of the answer.

#### 2.6 `tools/godot-content.mjs` (Modify)
*   **Type / Scope**: content export.
*   **Proposed Changes**:
    *   Load `holostudy-review.js` with `holostudy-demos.js`, so the packs come
        out filtered.
    *   Add the six `ncert-*` groups of kept practice MCQs to `practice.json`.
    *   Write `review: {version}` on each pack.

#### 2.7 `godot/scripts/app.gd`, `screens/home.gd`, `screens/practice.gd`, `screens/subject.gd` (Modify)
*   **Type / Scope**: GDScript.
*   **Proposed Changes**:
    *   `app.gd`: when a built-in pack's `review.version` differs from the saved
        one, clear that book's `heard` ticks once and save the new version.
    *   `home.gd` and `practice.gd`: change "Class 10 maths" in the labels to
        "NCERT and maths".
    *   `subject.gd`: add an `Act_practice` button to the chapter sheet that
        opens Practice with `<pack>-<n>` chosen.

#### 2.8 Tests (Create / Modify)
*   **Type / Scope**: tests.
*   **Proposed Changes**:
    *   `tools/test-content-review.mjs` (Create, no network):
        *   `stageA` on fixture pages in `tools/fixtures/review/` (short text
            files);
        *   every row of every Stage C table, including unsure answers;
        *   a cache hit makes no request (injected `fetch`);
        *   a failed request throws and writes no verdict.
    *   `tools/test-import.mjs` (Modify): exact equality.
    *   `godot/scripts/autotest.gd` (Modify): open Biology 11 › chapter 2 ›
        Practice and answer one question in each mode.
    *   `tools/godot-webtest.mjs` (Modify): run the new steps.

**Checkpoint 2:**
*   Tune the wording on 60 hand-labelled items from Physics 11 and Biology 11,
    then freeze it.
*   Score 60 held-out labelled items from Chemistry 11, Chemistry 12 and
    Biology 12: G3's first bar.
*   `node tools/content-review.mjs --verify`: exit 0, and G4's counts met.
*   `--sample 50`: G3's second bar.
*   `node tools/test-content-review.mjs` and `node tools/test-import.mjs`:
    exit 0.
*   Both walkthroughs pass all steps.
*   commit

### Phase 3: online release (needs Q3)

#### 3.1 `tools/godot-publish.mjs` (Create)
*   **Type / Scope**: Node script.
*   **Proposed Changes**:
    *   Runs `node tools/content-review.mjs --verify` and stops on failure.
    *   Runs `node tools/godot-build.mjs --content`.
    *   `git worktree add --orphan -b gh-pages <tmp>`; copies
        `build/godot-web`; commits "Publish <short sha of main>".
    *   `git push --force origin gh-pages`. It refuses any other branch name.
    *   Removes the worktree and prints
        `https://georgeelavarasan777.github.io/neet-hologram-s/`.

#### 3.2 `data/syllabus-check.md` (Create)
*   **Type / Scope**: G5 decisions (can run at any time).

#### 3.3 `godot/README.md` (Modify)
*   **Type / Scope**: docs.
*   **Proposed Changes**: rebuild, check, publish, and the one-time Pages
    setting (Settings › Pages › Deploy from branch › `gh-pages` / root).

**Checkpoint 3:**
*   The public address opens on Sweet System (the PC's Android emulator) in
    Chromium, and on a phone.
*   G6 is measured and recorded in `godot/README.md`, with the
    `Content-Encoding` results.

### Verification Plan

*   **Build**: `node tools/godot-build.mjs --content` and
    `python tools/godot-fonts.py`.
*   **Unit**: `node tools/test-content-review.mjs` (exit 0) and
    `node tools/test-import.mjs` (exit 0, exact).
*   **Content**:
    *   `node tools/content-review.mjs --verify` (exit 0)
    *   G1 at 78/79, plus `lech104` listed
    *   G4 at 70 or more of 79 chapters with 20 or more, all with 10 or more
*   **Quality (G3)**: held-out 54/60 or more agreement, 6 or fewer wrong
    removals; sample 2/40 or fewer wrong kept, 3/10 or fewer wrong removed.
*   **Regression**:
    *   both walkthroughs pass all steps;
    *   `node tools/godot-pdfsuite.mjs` prints 78 of 79 or more clean (its exit
        code is the unclean count, so read the printed line);
    *   `bash tools/gdcheck.sh` shows no errors.
*   **Online (G6)**: 20 s or less first visit, 4 s or less repeat, at the
    public address.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
