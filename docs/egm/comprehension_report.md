# EGM Stage 6: Comprehension Test

*   **Target:** `E:\lms\docs\egm\design_draft.md`. FeatureRange lines 1–458,
    DetailedRange lines 459–648.
*   **Reviewer:** egm-comprehension (fresh context; on purpose it did not open
    the project files, because this stage tests whether the document stands on
    its own)
*   **Verdict:** not ready. 2 Blocker, 9 Major, 14 Nit. Most named terms are
    defined. Both Blockers come from parts of the plan that don't connect.

## What this proposes

**Feature (lines 1–458).**
*   **The check:** the developer runs it on their own PC for HoloStudy's 79
    built-in NCERT chapters. It downloads the official chapter PDFs and gets
    their page text through the same converter that "Add a PDF" uses.
*   **Stage A, exact code checks:** sections present, each item on the page it
    cites, paragraphs present, extraction leftovers, quiz mechanics.
*   **Stage B, TypeSafe:** a pinned Jev model answers typed questions as
    probabilities, choices or scores. They cover whether a sentence defines its
    term, whether a point makes sense alone, how central a summary point is, and
    whether each multiple-choice option fits the blank.
*   **Stage C, decisions:** fixed tables in code turn the answers into keep,
    remove, relabel, join or fix-page verdicts. The verdicts are committed and
    applied when content is exported.
*   **Practice:** at least 20 checked fill-in-the-blank questions per chapter,
    from the existing Add-a-PDF question writer, shown in both Practice modes.
*   **Also:** a one-time syllabus comparison, and publishing to GitHub Pages as
    one force-pushed orphan gh-pages commit. Publishing is blocked while there
    are open failures, and each release gets a new service-worker cache name.

**Implementation plan (lines 459–648).** Steps in order:
*   Test and commit the pending work.
*   Add a PDF source list and a fetch script.
*   Add a TypeSafe client (hash-keyed cache, retry on 429, token budget) and one
    module holding the wording, model name and thresholds.
*   Add `content-review.mjs`: runs Stages A–C and writes `verdicts.json`,
    `REPORT.md` and an optional 50-item sample.
*   Wrap `makeMCQs` as `HoloImport.mcqsFor`.
*   Extend `godot-content.mjs` to apply the verdicts and attach the kept
    questions.
*   Make Practice list the built-in packs.
*   Add a publish script, and patch the two pdf.js calls in `study.html`.
*   Add walkthrough steps, a throttled timing run, the syllabus file, an
    offline unit test, and README and `.gitignore` updates.

Verification tunes the questions on 60 hand-labelled items and tests on 60
others. It then uses the 50-item person check, the existing regression suites
and the throttled timings.

## How the existing system works, per this document

*   **The app:** the Godot edition is a browser app built by
    `tools/godot-build.mjs`. Today it runs only at 127.0.0.1:8060.
*   **The books:** six built-in books (Class 11 and 12 Physics, Chemistry and
    Biology) are JSON packs in `godot/content/packs/`.
    *   The chapter text was extracted once into
        `engines/study/holostudy-demos.js`, by a script that no longer exists.
    *   Derived items (key terms, key points, summaries, quizzes) come from the
        rule-based `Analytics` code in `engines/study/study.html`.
    *   `tools/godot-content.mjs` exports the packs using headless Edge.
        (Inferred: it runs `study.html`'s Analytics; the document doesn't say
        so.)
*   **Add a PDF:** the converter is `godot/web/import/driver.js`, apparently
    built into `build/godot-web/import/holostudy-import.js` (also inferred). Its
    `makeMCQs` writes multiple-choice questions, which Practice shows in two
    modes.
*   **Practice for built-in content:** only Class 10 Maths and Algebra.
*   **Tests:** 90-step browser walkthrough, 83-step desktop walkthrough, and
    `godot-pdfsuite` (78 of 79 NCERT chapters convert cleanly).
*   **GitHub:** the latest commit is unpushed, because the signed-in account
    can't write to the repository.

## Findings

### Blockers

| # | Lines | Finding |
|---|---|---|
| 1 | 171–185, 263–269, 298–305, 309–321, 529–537, 548–557, 628–634, 145 | **The practice-question check never closes into a loop.** Questions are generated only in `godot-content.mjs`, *after* `verdicts.json` is written, so nothing ever creates T4 verdicts. "Replace the wrong option and ask again" changes a question, but no verdict action covers that, and regenerating via `mcqsFor` brings back the original (and its hash won't match). `content-review.mjs` reads the same `packs/*.json` that `godot-content.mjs` rewrites, so it's unclear whether the next run sees raw or corrected packs, which decides whether CUJ 2 ("no API calls, same result") can hold. Tuning labels T4 items before any built-in chapter has questions. Needs the real run order, which tool generates questions for checking, and an action for option replacement. |
| 2 | 44, 66–67, 135–136, 205–214, 534–537, 572, 18–20 | **Nothing fixes missing content.** Stage A only detects missing sections and paragraphs; every verdict action works on an existing derived item. A missing section has no action, so it blocks publishing with no way to clear it, while CUJ 1 still promises 2.2.2 appears. Needs to say how G1 reaches 79 of 79, and who adds the missing text and how. |

### Majors

| # | Lines | Finding |
|---|---|---|
| 3 | 227–231, 233, 247–248, 255, 263–264, 503–505, 518–519 | **What a TypeSafe request contains contradicts itself.** Line 227 says every state has chapter title, section, item, previous sentence and paragraph; T1 to T4 list different fields. Line 229 puts the item in the instructions, but T1 and T2 put it in the state. "Questions that share one paragraph's state go in one request" conflicts with item-level fields like `term` and with `ask()` taking one state. The request body is also the cache key, so it must be pinned down. |
| 4 | 14–15, 46, 71–74, 211, 282, 263 | **The recall quiz has no stated check or fix.** G3 covers "quiz question", but T1 to T3 don't cover quiz items, and T4 is for the new MCQs. Unclear whether the quiz is rebuilt when a term is relabelled, and which check catches "cannot be answered on its own". |
| 5 | 18–22, 171, 196–198, 309, 544–545, 580, 584–585, 622–623, 142 | **How the build pieces relate is never explained.** `holostudy-import.js` vs `driver.js` vs the `HoloImport` global; why `godot-content.mjs` needs headless Edge (does it run `Analytics`, so do Step 10 fixes reach the packs?); "scanner" undefined; a circular build dependency (the check needs `build/godot-web`, which needs the content); CUJ 2 doesn't list "build first". |
| 6 | 66–67, 85–86, 110–111, 188–199, 327–329, 482–488 | **Edition and PDF mapping are assumed.** Do today's ncert.nic.in PDFs match the edition the app was built from (some chapters removed or merged after 2023)? Who builds the 79 `code`/`url` entries, and how (the `kebo102` scheme isn't explained)? Which chapter is the 1 of 79 that doesn't convert cleanly, and where does its reference text come from? |
| 7 | 81–83, 338–340, 348–349 | **G6 conflicts with the stated build size.** At 10 Mbit/s (about 1.25 MB/s), the 38.8 MB engine alone takes about 31 s uncompressed, against a target of 20 s or less. Compression, or not loading content before Home, would explain it, but the document says neither. |
| 8 | 62, 472–476 | **Pending file count disagrees:** "four new files" vs three listed in Step 0. Risks leaving one file uncommitted. |
| 9 | 85, 470–471, 637–638 | **The desktop walkthrough has no command.** There's no way to start it, and `autotest.gd` isn't identified as that walkthrough. |
| 10 | 461; Steps 2, 3, 9–11, 13, 14 | **"Steps run in this order" clashes with dependencies.** Publishing (9) comes before the security fix (10), the new tests (11, 13) and `.gitignore` (14). Steps 2 and 3 create `tools/ncert-src/` (copyrighted PDFs) and the cache, which are ignored only in Step 14. Step 10 points ahead to Step 13. |
| 11 | 75–77, 319–321, 535–537, 544 | **A chapter with fewer than 20 questions has no defined fix and doesn't block release.** "MCQ writer settings are reviewed" doesn't say what the settings are, who reviews them, or where they live; `mcqsFor` has no settings parameter. Is G4 a release gate or a hope? |

### Nits

| # | Lines | Finding |
|---|---|---|
| 12 | 28, 218–221, 436–440 | TypeSafe and Jev are used before they're defined or linked. |
| 13 | 223, 517, 283, 292, 295, 303, 530, 220 | Thresholds sit outside the "one module" claim (0.6, 45 words, 4 per section, 2 retries, 48k). Does `choice` return a probability for each option? |
| 14 | 300–305, 607–608 | T4 table gap: right fits, a wrong option is unsure or fits, and `stands_alone` is unsure or no matches no row. |
| 15 | 274, 629–634 | "Tuned on a held-out set" is backwards. The held-out test has no pass bar. Two of the "five errors" aren't TypeSafe items. |
| 16 | 207–209, 315, 565–566, 556 | Pack shapes (`sections`, `blocks`, page fields) and question fields (`q`, `o`, `a`, `p`, `s`) aren't described; what `review.version` versions is unclear. |
| 17 | 14–15, 294 | The summary is per chapter or per section? Which 4 points win a tie? |
| 18 | 283 | Relabelling only to an existing term may create duplicates; would "Kingdom" be fixed or just removed? |
| 19 | 68–74, 282, 290 | G2's 99% population is unclear; does "unsure" count as passing for G3? |
| 20 | 199, 210, 580, 642, 191, 483, 625, 445 | Undefined: "fake bold", "scanner", "Sweet System", the NCERT file-code scheme, `test-practice-bank.mjs`, `data/review.md`. |
| 21 | 123–126 | Q4 quotes a request the document never cites. |
| 22 | 50, 356 | The roughly 12,000 voice notes are counted but no goal or check covers them. |
| 23 | 104–112, 339 | The effect of each Q1 answer isn't described: what does (b) ship? For (c), is the repository public? If so, the gh-pages branch exposes the text anyway. |
| 24 | 158–162, 424–428, 508–510, 418 | Failure handling: are REPORT/verdicts written when Stage B fails? A failed request has no cache file to name. `--budget-tokens` has no default. |
| 25 | 414–416, 578–583 | The pdf.js security fix isn't tied to the feature; does `study.html` ship in the public build? |
