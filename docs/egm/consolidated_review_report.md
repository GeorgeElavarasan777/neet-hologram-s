# EGM Consolidated Review: HoloStudy (Godot) checked NCERT content, full practice, online release

*   **Target:** `E:\lms\docs\egm\design_draft.md` (648 lines). FeatureRange
    1–458, DetailedRange 459–648 (split at "## Detailed Implementation Plan").
*   **Mode:** consolidated report with all review rubrics (Stages 5 → 9, run in
    order, no pauses). The draft was not edited between stages.
*   **Date:** 2026-11-01

## Reviewer status

| Stage | Reviewer | Status | Blocker / Major / Nit | Report |
|---|---|---|---|---|
| 5 Initial Zoom Out | egm-zoom-out | completed | 1 / 7 / 10 | [zoom_out_report.md](zoom_out_report.md) |
| 6 Comprehension | egm-comprehension | completed | 2 / 9 / 14 | [comprehension_report.md](comprehension_report.md) |
| 7 Critic | egm-design | completed | 1 / 14 / 4 | [critic_report.md](critic_report.md) |
| 7 Critic | egm-structural | completed | 0 / 4 / 9 | [critic_report.md](critic_report.md) |
| 7 Critic | egm-style | completed | 0 / 7 / 18 | [critic_report.md](critic_report.md) |
| 8 Intermediate Zoom Out | egm-zoom-out | completed | 0 / 4 / 7 | [intermediate_zoom_out_report.md](intermediate_zoom_out_report.md) |
| 9 Readiness | egm-implementation-readiness | completed | 4 / 14 / 9 | [implementation_readiness_report.md](implementation_readiness_report.md) |
| 9 Readiness | egm-codebase-details | completed (no shell) | 4 / 13 / 6 | [implementation_readiness_report.md](implementation_readiness_report.md) |
| 9 Readiness | egm-style | completed | 0 / 8 / ~20 | [implementation_readiness_report.md](implementation_readiness_report.md) |

**Raw total:** 12 Blocker, 80 Major, about 97 Nit. Many repeat across
reviewers.

**After deduplication:** 6 Blocker actions, 17 Major actions and 6 Nit groups,
listed below.

**Overall verdict: not ready to implement.**
*   **What holds up:**
    *   TypeSafe runs only while the content is built, so no student data is
        sent.
    *   "TypeSafe judges, code decides" is the right split.
    *   NCERT's PDFs are the reference.
    *   GitHub Pages fits the single-threaded build.
*   **What is wrong:** the content pipeline is wired wrong in four places:
    *   where the source text gets fixed
    *   how verdicts are applied
    *   where the practice questions are made
    *   where Practice reads them

Stage 8 ruled on which recommendations are needed and which are scope creep.
This report follows those rulings.

--------------------------------------------------------------------------------

## 🔴 Blockers (fix before any implementation)

### CB1. Fix the source text itself: rebuild `holostudy-demos.js` from the official PDFs

*   **Problem:** the missing section 2.2.2 (Dinoflagellates) is a defect in
    `engines/study/holostudy-demos.js`. Its heading was lost; the paragraph is
    there. The plan's verdicts can only keep, remove, re-label, join or fix
    pages, so G1 and CUJ 1 can never be met, and the publish gate can never
    pass.
*   **Action:**
    *   Add a checked-in rebuild script that writes `holostudy-demos.js` from
        the 79 official PDFs, using the Add-a-PDF converter. 78 of 79 already
        convert cleanly.
    *   Use a frozen, committed word list (Z8-4). The current `words.txt` is
        built from the packs being rebuilt, so each rebuild would feed on the
        last one.
    *   Accept the rebuild only after a one-time "nothing lost" comparison with
        the current text (Z8-3).
    *   Keep the current text for the one chapter that doesn't convert cleanly,
        and name it.
    *   Decide which page number students see. The printed page is the one a
        student can look up, so take it from the running head (Z8-6).
*   **Removes the need for:** a patch file, page-offset mapping, an old-edition
    archive, the "fix page" action, and the recurring "Text present" and
    "Leftovers" checks.
*   **Sources:** S5-1, S6-2, design-7-5, ir-9-B3; S5-2, design-7-4, cd-9-M4,
    Z8-6; Z8-3, Z8-4; S6-6.

### CB2. One pipeline, run once: review and make the practice questions in Node through `bundle()`

*   **Problem:**
    *   T4 verdicts are needed before the MCQs exist, so the order is circular.
    *   `mcqsFor(chapter, bookTerms)` can't work on exported packs: `makeMCQs`
        needs the scanner's in-memory chapter, the whole book's `termForms`, and
        helpers that exist only in the bundle.
    *   The check reads the same pack files that step 7 overwrites, so a second
        run gives different results.
    *   The judged items and the shipped items come from two different scanner
        runs that are known to differ (Z8-2).
*   **Action:**
    *   `content-review` loads `bundle()` from `tools/godot-import.mjs` in a
        Node `vm`, the way `tools/test-import.mjs` already does. It runs the
        scanner on the rebuilt text and judges the base items.
    *   It then makes the MCQs with the already-public
        `HoloImport._test.makeMCQs` and `termForms` (driver.js:889), judges
        them, and writes the results.
    *   It always starts from the raw text, never from reviewed packs.
    *   Delete Step 6 (no new `HoloImport` API, no driver.js change).
*   **Sources:** S5-3, S5-13, S6-1, design-7-2, structural-7-1, ir-9-B2,
    cd-9-B1, cd-9-B2, cd-9-B3, ir-9-M1, Z8-2.

### CB3. Verdicts only keep or remove, as a filter after the rules choose, in the shared scanner

*   **Problem:**
    *   Every derived item is picked by ranking, so rebuilding after verdicts
        promotes items nobody judged: the next definition, the 21st term, the
        9th quiz term.
    *   The re-label, join and option-swap actions each need payloads and a
        re-check.
    *   `verdicts.json` has no schema.
*   **Action:**
    *   Verdicts are `keep` or `remove`. They are applied after the rules have
        chosen, and the rules never choose again.
    *   Drop re-labelling (`main_subject`, the 0.6 rule), joining (the 45-word
        rule), "fix page" and the T4 retry loop.
    *   Define the schema: key (pack, chapter, item kind, SHA-256 of the
        normalised text, question version), action, and the answers it came
        from.
    *   Apply the filter in the shared scanner path, so the web console, the
        Android app and Godot all agree.
    *   Exactly two judging passes: base items, then MCQs.
*   **Sources:** Z8-1, ir-9-B1, style-9-M3, S5-8, design-7-7, ir-9-M4.

### CB4. Practice reads the built-in questions from `practice.json`, not from packs

*   **Problem:**
    *   Practice never reads the built-in packs. Packs load one at a time on
        demand, while `PracticeBank` works synchronously over `practice.json`
        and the student's own books.
    *   Built-in chapters have no Practice button.
    *   The plan gets the question fields wrong (they are `q,o,a,h,t,p`).
    *   It wrongly says the source sentence is never shown. It is shown after
        answering, by design.
*   **Action:**
    *   `godot-content.mjs` writes six NCERT groups into `practice.json`, with
        chapters in the existing bank shape
        `{id, title, color, group, gens, book: true}`.
    *   Keep a small Step 8:
        *   edit the "Class 10 maths" labels (home.gd:78, practice.gd:75);
        *   add a Practice entry to built-in chapter sheets (subject.gd), or
            reword CUJ 1 to "open Practice, choose Biology 11 chapter 2".
    *   Fix the answer leak: when a question has no section, its topic tag
        falls back to the answer (`t: sec || right`, driver.js:772).
*   **Sources:** design-7-1, S5-4, ir-9-B4, cd-9-M1, cd-9-M7, cd-9-B4,
    ir-9-N3, Z8-5, cd-9-M12.

### CB5. Settle copyright and hosting before planning the release (owner decision)

*   **Problem:**
    *   `holostudy-demos.js`, the full NCERT text, is already committed.
    *   GitHub Pages on a Free plan needs a public repository, so the text is
        effectively published whatever Q1 says, and a github.io address isn't
        really unlisted.
    *   Option (b) needs unplanned work: `app.gd:10` hard-codes `PACK_IDS`, and
        the build copies all content.
*   **Action:** the owner chooses one of:
    *   (a) get NCERT's permission;
    *   (b) a site without the built-in text, where students add the NCERT PDFs
        themselves;
    *   (c) a private source repository plus a separate site-only repository,
        or a paid plan.

    Then plan only the chosen option. G1–G4 and CUJ 1 depend on (a).
*   **Sources:** design-7-13, S6-23, ir-9-M10, cd-9-M8, Q1.

### CB6. Re-scope the summary work: drop T3

*   **Problem:**
    *   No goal asks for importance scoring.
    *   "Key points" and "summary points" are the same sentences
        (study.html:1377).
    *   The per-section rule would give Biology 11 chapter 2 at least 18 points
        instead of 4–9.
    *   Scoring every sentence breaks the cost estimate.
*   **Action:** remove T3 and the re-selection rule. Run the stand-alone check
    once, on one item kind.
*   **Sources:** S5-5, design-7-6.

*CB6 is one reviewer's Major (S5-5), raised to Blocker here because design-7-6
shows the rule can't work as written.*

--------------------------------------------------------------------------------

## 🟡 Majors

| # | Action | Sources |
|---|---|---|
| CM1 | **Stage A reuses existing code.** Run `LEANS`/`LEAD` (driver.js:695–696) before T2: they already catch "This…", "Hence…". Check G1 headings from **raw pdf.js text** (contents box plus a numbered-heading regex), because the converter's contents parser reads only two-level numbers and 2.2.2 is third-level. Reuse test-import's quiz-mechanics checks (test-import.mjs:88–98). Extract the pdfsuite logic into a module rather than copying it. | S5-6, Z8-3, design-7-3, cd-9-M4, ir-9-M2, cd-9-M5, S5-13 |
| CM2 | **Recall quiz coverage.** Keep a quiz item only if its term and definition are kept, and it passes the mechanics check. No new question type. | S6-4, S5-18, style-7-5, cd-9-M6, Z8 dispositions |
| CM3 | **Pin the TypeSafe request shape.** One full example request and response; one state shape per question; a per-item question naming scheme (`<kind>_<hash8>_<question>`); fix T1's "true" example (the fungi sentence doesn't define fungi). | S6-3, style-7-3, ir-9-M3, style-7-6 |
| CM4 | **Simpler T4 rule that covers every case.** Drop wrong options judged unsure or fits; keep the question if 2 or more remain; otherwise remove it. Name the two stand-alone questions differently. | S5-8, structural-7-2, S6-14, style-7-7, structural-7-n7 |
| CM5 | **Keep `tools/test-import.mjs` working.** After the rebuild, require exact equality and pass it the same verdict filter. Add it to G7 and Verification; drop `test-practice-bank.mjs` from this plan's checks (it covers only the maths generators). | S5-7, design-7-10, ir-9-M8, cd-9-M2, Z8-2 |
| CM6 | **Measure G4 now, with no API.** Print per-chapter MCQ counts via `bundle()`. Caps are 30 per chapter, 2 per term and 24 terms; Physics and Chemistry lose math-heavy sentences. Decide whether under-20 blocks release, and raise caps or add sources only if short. | design-7-9, S6-11, ir-9-M7, cd-9 possible |
| CM7 | **Machine-readable publish gate.** Refuse to publish if `verdicts.json` is missing, or any judged item in the packs being built has no verdict for the current question version. Apply it only when built-in text ships. Define "open failure" once. No input-hash manifest. | S5-16, design-7-15, Z8-11, ir-9-M9, style-7-4, style-9-M4 |
| CM8 | **PWA and caching: correct the claim; build nothing new.** Godot already stamps a new `CACHE_VERSION` on every export, so drop the cache-name step. CUJ 3 should say a new release appears on the next launch after the app is fully closed. Optional: `JavaScriptBridge.pwa_update()` at Home. | S5-10, design-7-12, Z8-9, cd-9-M8, ir-9-M9 |
| CM9 | **Measure G6 at the public address only.** Record the `Content-Encoding` of `index.wasm` and `index.pck` (the engine is about 38 MB raw, about 9 MB compressed). Drop the throttled test-harness run. Re-assess Netlify or Cloudflare (Alt F) only if G6 fails. | S5-17, S6-7, design-7-11, ir-9-M12, cd-9-M9 |
| CM10 | **Phases with checkpoints.** For example: (0) security patch and `.gitignore`, then commit the pending work; (1) source rebuild, code checks and MCQ counts (no key); (2) TypeSafe judging and Practice; (3) release, gated on Q1 and Q3. Each phase ends with named commands that must pass. | ir-9-M14, style-9-M1, S6-10, Z8-7, S5-14 |
| CM11 | **ncert-fetch reuses existing rules.** Derive codes from `NCERT_PACK`/`NCERT_PART1` and the committed `data/curriculum.js` (not the gitignored `godot/content/curriculum.json`). Name files `<code>.pdf`. Count pages with the browser bundle (no new Node PDF dependency). One clear rule: detect changes by local hash, and re-fetch only on request. | S5-12, ir-9-M5, cd-9-M3, ir-9-N2 |
| CM12 | **Client failure handling and tests.** Retry cap and a fallback without `retry-after`; handle network rejects and a missing key; an injectable `fetch` or base URL; a local mock server like `tools/mock-claude-api.mjs`. Write the Stage A report before Stage B can fail. Drop the budget flag or give it a default. | ir-9-M6, cd-9-M10, S5-11, S6-24 |
| CM13 | **Take Analytics rule changes out of this plan,** or bound them: a threshold for "repeated", a full re-review afterwards, tests in test-import. Any rule change changes every item hash. | S5-14, ir-9-M11, cd-9-M11, style-9-M5 |
| CM14 | **Tuning and person check.** Give the 60 held-out labelled items a pass bar (about 20 each for T1, T2 and T4). The 50-item end-to-end check is stratified by item type **and includes removed items**. Reject the 150–315 item sample. | Z8-8, design-7-8, S6-15, style-9-M7 |
| CM15 | **Returning students' key-point progress.** Ticks are stored by index (`k<i>`, app.gd:220), so removing summary points moves them. Re-key by item text hash, or accept a one-time reset and say so. | ir-9-N7 *(raised from Nit: it affects real students)* |
| CM16 | **Explicit pass criteria in Verification:** 79/79 sections, 83/83 desktop, the held-out bar, the G4 count, G6 seconds. The desktop command is `godot --headless --path godot -- --autotest`. pdfsuite's pass check is its printed "N of 79 clean" line, not its exit code. | style-9-M6, S6-9, ir-9-N1, cd-9-N1, cd-9-N2 |
| CM17 | **Short Risks & limits list inside NFR, with no new mechanisms:** TypeSafe's 64k/32k limits vs request grouping; Pages' 100 GB/month; pinned-model retirement (affects only re-runs); false removals (covered by CM14); copyright (CB5). | design-7-14, structural-7-3, Z8-10 |

## 🟢 Nits (editorial; many go away when wording moves into `questions.mjs`)

| Group | Items | Sources |
|---|---|---|
| N1 Terms | Define TypeSafe and Jev at first use. Use one name each: "stands alone", "recall quiz item" vs "practice MCQ", Stage A/B/C, `REPORT.md` and `verdicts.json`, "the developer's PC". Define fake bold, running heads, glued words, scanner, Sweet System and the NCERT code scheme. | style-7-2, style-7-n5, n7, n14–n16, S6-12, S6-20 |
| N2 Measurable wording | G2's 99% (moot after CB1); G3's "error"; G5's decision outcomes; threshold boundaries; the title's "full practice"; replace rhetorical absolutes with counts. | style-7-1, n1, n6, n8, n9, ir-9-N4 |
| N3 Formatting | `'<option>'` renders as an empty HTML tag (line 266); bold pseudo-headings should be H4s; Q1 options as a nested list; colon placement in bold labels; uneven goal tags; diagram width and alignment. | structural-7-4, n1, n4–n6, n8 |
| N4 Cross-references | "Verification" should be "Verification Plan"; name the "Step 9" target; name the referenced subsections; anchor line numbers to a commit. | structural-7-n2, style-9 nits |
| N5 Housekeeping | The 4th pending file is `godot/scripts/capacity_test.gd.uid` (from `git status`); the font step after content changes (`python tools/godot-fonts.py`); the force-push refuses any branch but gh-pages; Pages needs admin rights; the `git worktree --orphan` version. | S6-8, cd-9-M13, design-7-19, cd-9-N3, cd-9-N6 |
| N6 Metadata | Author field, Status "In Review"; Alt B's rejection reason (the repo already uses structured output); "closes" should be "mitigates" for the CVE. | structural-7-n9, S5-15, style-7-n18 |

--------------------------------------------------------------------------------

## Traceability Matrix

| Consolidated action | Raw findings |
|---|---|
| CB1 source rebuild | S5-1, S5-2, S6-2, S6-6, design-7-4, design-7-5, design-7-18, ir-9-B3, cd-9-M4, Z8-3, Z8-4, Z8-6 |
| CB2 single pipeline | S5-3, S5-13, S6-1, S6-5, design-7-2, structural-7-1, ir-9-B2, ir-9-M1, cd-9-B1, cd-9-B2, cd-9-B3, Z8-2 |
| CB3 keep/remove filter | S5-8, S6-13, S6-18, design-7-7, ir-9-B1, ir-9-M4, style-9-M3, Z8-1 |
| CB4 Practice via practice.json | S5-4, design-7-1, ir-9-B4, ir-9-N3, cd-9-B4, cd-9-M1, cd-9-M7, cd-9-M12, style-9-M8, Z8-5 |
| CB5 copyright and hosting | S6-23, design-7-13, ir-9-M10, cd-9-M8 |
| CB6 drop T3 | S5-5, S6-17, design-7-6 |
| CM1 Stage A reuse | S5-6, S5-13, design-7-3, ir-9-M2, cd-9-M4, cd-9-M5, Z8-3 |
| CM2 recall quiz | S5-18, S6-4, style-7-5, cd-9-M6 |
| CM3 request shape | S6-3, style-7-3, style-7-6, ir-9-M3, ir-9-N8 |
| CM4 T4 rule | S5-8, S6-14, structural-7-2, structural-7-n7, style-7-7 |
| CM5 test-import | S5-7, design-7-10, ir-9-M8, cd-9-M2 |
| CM6 G4 measurement | S6-11, design-7-9, ir-9-M7, cd-9 (possible Major) |
| CM7 publish gate | S5-16, design-7-15, style-7-4, style-9-M4, ir-9-M9, Z8-11 |
| CM8 PWA claim | S5-10, design-7-12, cd-9-M8, Z8-9 |
| CM9 G6 at the public address | S5-17, S6-7, design-7-11, ir-9-M12, cd-9-M9 |
| CM10 phases | S5-14, S6-10, ir-9-M14, style-9-M1, Z8-7 |
| CM11 ncert-fetch reuse | S5-12, ir-9-M5, ir-9-N2, cd-9-M3 |
| CM12 client failures | S5-11, S6-24, ir-9-M6, ir-9-M13, cd-9-M10 |
| CM13 Analytics changes | S5-14, ir-9-M11, cd-9-M11, style-9-M5 |
| CM14 tuning and sample | S6-15, design-7-8, style-9-M7, Z8-8 |
| CM15 key-point progress | ir-9-N7 |
| CM16 pass criteria | S6-9, style-9-M6, ir-9-N1, cd-9-N1, cd-9-N2 |
| CM17 risks list | design-7-14, structural-7-3, Z8-10 |

Rejected as scope creep (Stage 8): design-7-5's patch file, design-7-6's T3
candidate pool, design-7-7's re-label merge, design-7-8's 150–315 sample and
removal cap, design-7-12's versioned content URLs and update-path test,
design-7-15's input-hash manifest, design-7-11's Pages-copying test server.

## The plan's shape after these changes

1.  **Phase 0:**
    *   Apply the pdf.js `isEvalSupported: false` patch.
    *   Add `.gitignore` entries.
    *   Commit the pending work (6 changed files and 4 new, including
        `capacity_test.gd.uid`).
    *   Push once Q3 is resolved.
2.  **Phase 1, no API key needed:**
    *   Fetch the 79 PDFs and rebuild `holostudy-demos.js` with a frozen word
        list.
    *   Run the "nothing lost" diff.
    *   Run the code checks (sections from raw PDF text, `LEANS`/`LEAD`, quiz
        mechanics).
    *   Print per-chapter MCQ counts.
3.  **Phase 2, needs `TYPESAFE_API_KEY`:**
    *   Judge base items with T1 and T2 via `bundle()`, filter with keep or
        remove, then make MCQs, judge them with T4, and filter.
    *   Write `verdicts.json`.
    *   Apply the same filter in the shared scanner path.
    *   Write the NCERT groups into `practice.json`.
    *   Add the Practice label and entry edits.
4.  **Phase 3, after Q1 and Q3:**
    *   Publish to gh-pages with the machine-readable gate.
    *   Measure G6 at the public address.
5.  **Separate track:** G5 syllabus comparison, done once.

*Drafted with EGM*
