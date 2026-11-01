# EGM Stage 5: Initial Zoom Out Review

*   **Target:** `E:\lms\docs\egm\design_draft.md`, lines 1–648 (full file)
*   **Reviewer:** egm-zoom-out (fresh context)
*   **Standard:** `resources/document_standards/zoom-out-standard.md`
*   **Verdict:** not ready. 1 Blocker, 7 Major, 10 Nit. The document says clearly
    what it is trying to do and why, so it passes the context-sufficiency check.

## Findings

| # | Severity | Lines | Finding | Simpler path suggested |
|---|---|---|---|---|
| 1 | 🔴 Blocker | 18–23, 66–67, 135–136, 201–214, 532–534, 552–553, 351–402 | **The root cause is left in place, so G1 cannot be met.** Section 2.2.2 is missing from the source text itself: `engines/study/holostudy-demos.js` goes from `### 2.2.1 Chrysophytes` to "…Dinoflagellates These organisms…" with no heading, then `### 2.2.3`. The verdict actions (keep, remove, relabel, join, fix page) cannot add a section or restore text. | Check in a script that rebuilds `holostudy-demos.js` from the 79 official PDFs, using the converter's cleaned output (78 of 79 already clean). G1 and most of G2 then hold by construction, for the web console, Android and Godot. If this is rejected, list it as an alternative and add a "patch source text" action. |
| 2 | 🟡 Major | 47–48, 68–70, 188–199, 208, 213–214, 482–488 | **Two page-numbering schemes, never reconciled.** Pack pages run through the whole book (biology11 chapter 2 is pages 10–22). Each chapter PDF starts at page 1. As written, almost every citation check falls back, and "fix page" would silently change the page numbers students see. | Define the mapping: book page = sum of earlier chapters' PDF page counts + local page. Or fix the numbering at the source (Finding 1). |
| 3 | 🟡 Major | 166–186, 307–317, 521–557 | **The MCQ data flow goes in a circle, and Step 6's wrapper is neither thin nor needed.** T4 verdicts come from content-review (Step 5), but the MCQs are created only in godot-content (Step 7). `makeMCQs` needs scanner state the exported pack doesn't have (`t.def`, `t.defScore`, `c.sentences`, `termForms(doc)`, `Analytics.stem`). `makeMCQs` and `termForms` are already on `HoloImport._test` (driver.js:889), and `tools/test-import.mjs` already runs the bundle in Node and gives every built-in chapter its `mcq`. | Create the MCQs inside content-review the way test-import does: drop answers T1 removed or marked unsure, judge the rest with T4, and write the kept questions out. godot-content copies them. No driver.js change. |
| 4 | 🟡 Major | 314–317, 554–566 | **Where Practice reads the questions breaks the existing pattern.** Built-in packs load on demand and asynchronously (`App.load_pack`), but `PracticeBank.groups()` and `chapters()` are synchronous. Library keeps MCQs out of packs on purpose (library.gd:142). `PracticeBank.make` already handles `book: true` chapters with a page `p`. | Write six NCERT groups with `book: true` chapters into `practice.json`. No GDScript changes; drop Step 8 and the pack `mcq` field. |
| 5 | 🟡 Major | 68–74, 247–261, 286–296, 532 | **T3 and the per-section summary rebuild are unrequested scope.** No goal is about importance. The current summary is per chapter (`Analytics.summarise`, study.html:1567–1585). The rule fails where a section has no scored point. Key points and summary points are the same sentences (`c.keyNotes = c.summary.map(...)`, study.html:1377). | Remove T3 and the re-selection rule. Run T2 once, on one item kind. |
| 6 | 🟡 Major | 45–47, 201–214, 247–253, 371–378 | **Existing rules already catch the main T2 cases.** `LEANS` and `LEAD` (driver.js:695–696) reject "This…", "It…", "Hence…", "Thus…". The cited examples match them. | Add a Stage A "leans on the sentence before" check reusing `LEANS`/`LEAD`; send only what's left to T2. |
| 7 | 🟡 Major | 84–86, 429–430, 548–557, 620–642 | **Editing packs with verdicts breaks an existing test and the Godot-matches-web promise.** `tools/test-import.mjs` checks the converter output equals `godot/content/packs/<id>.json`; it fails by design once verdicts are applied. Not in G7 or Verification. The web console and Android keep the wrong items. | Choose: (a) fix the source and the `Analytics` rules, which keeps every consumer and the test, or (b) make verdicts a Godot-only overlay, point test-import at the pre-overlay export, and say the web console is not corrected. |
| 8 | 🟡 Major | 300–305 | **The T4 "replace the option and ask again" loop is unnecessary.** `makeMCQs` gives 1 right option and 3–4 wrong ones; no mode shows more than 4 (practice.gd:187; shooter 2–4); there is no ranked candidate list to draw from. | Drop wrong options judged unsure or yes. Keep the question if 2–3 wrong options remain, otherwise remove it. |
| 9 | 🟢 Nit | 216–275, 292, 518–519, 529–530 | The exact question wording in the document will be stale after the first tuning pass. | Describe what each question decides; make `questions.mjs` the source of truth for wording and numbers. |
| 10 | 🟢 Nit | 151–154, 345–347, 573 | The cache-name step repeats what Godot does: every export stamps a new `CACHE_VERSION`. Its service worker doesn't cache `content/` or `import/`. | Drop the step; describe where stale copies really come from (HTTP caching of `content/`). |
| 11 | 🟢 Nit | 114–117, 412–423, 499–511 | The cache plus budget flag is heavier than needed at about $0.21 a run; the cache isn't committed, so a fresh clone re-runs anyway. | One store: verdicts keyed by item hash plus question version. Or keep the cache and drop the budget flag. |
| 12 | 🟢 Nit | 169, 479–488 | `ncert-sources.json` is a third copy of the NCERT code-to-chapter rule (already in driver.js:368–378 and godot-pdfsuite.mjs:29–38). | Derive code and URL from curriculum.json plus that rule; store only `sha256` and `pages`. |
| 13 | 🟢 Nit | 196–199, 210, 523–524 | Reference text: reuse pdfsuite (it has `--json`) rather than a third copy of the browser-control and server code. The "Leftovers" check *is* pdfsuite's scoring. pdfsuite needs a full Godot export first; `bundle()` doesn't. | Extend pdfsuite to dump converted packs; content-review runs as plain Node. |
| 14 | 🟢 Nit | 59–62, 84–86, 410–416, 466–477, 578–585 | Scope and housekeeping: the study.html `isEvalSupported` fix is worthwhile but separate (study.html isn't in the Godot web build). Step 0 and G7 are housekeeping, not design. Line 62 says "four new files" but Step 0 lists three. Step 10's open-ended rule fixes would invalidate verdicts and change Add a PDF output. | Ship the security fix as its own patch; bound Step 10 and add a re-review step plus `Analytics` tests. |
| 15 | 🟢 Nit | 361–369 | Alternative B's rejection reason doesn't hold: the repo already gets schema-structured output from Claude. | State the real reasons (typed probabilities, pinned model, cost, owner's choice). Reuse the `tools/mock-claude-api.mjs` stand-in-server pattern for Steps 3 and 13. |
| 16 | 🟢 Nit | 149–152, 341–344, 429–430, 535–537, 556–557, 572 | The publish gate can be bypassed: "open failures" almost never triggers, and a missing verdicts.json plus a stale REPORT.md still publishes. Nothing reads the pack's `review` field. | Gate on machine-readable state: verdicts must cover the hash of the content being built. |
| 17 | 🟢 Nit | 81–83, 348–349, 591–594, 641–642 | G6 measured on the wrong server: godot-webtest's server sends `no-store` and doesn't compress (engine about 38 MB raw, about 9 MB compressed). | Measure at the public address only; drop the test-harness change. |
| 18 | 🟢 Nit | 72–74, 211, 263–269, 298–305 | Unclear how the recall quiz (`Analytics.quiz`, 8 per chapter, built from definitions) is checked; T4 is written for Practice MCQs. | Say whether T4 covers both, or check quiz items via T1 on their definition. |

## What already fits the project

*   TypeSafe at build time only matches the README's "everything runs
    on-device".
*   Q1 gating publication matches the README's "get permission before public
    distribution".
*   Reusing the Add a PDF converter for reference text is right.
*   GitHub Pages fits: `.nojekyll` is already written, and the build is
    single-threaded.
*   The split "TypeSafe judges, code decides", and tuning on a held-out set, are
    sound.

## Simplest shape the reviewer proposes

1.  Rebuild the source text from the official PDFs.
2.  Run fixed code checks, reusing pdfsuite and `LEANS`/`LEAD`.
3.  Ask TypeSafe T1, T2 and T4 only.
4.  Make MCQs in content-review via `bundle()`, as test-import does.
5.  Write the kept MCQs to practice.json as `book: true` groups.
6.  Gate publishing on the content hash.

This drops Step 6, Step 8, T3, the T4 retry loop and the cache-name step.
