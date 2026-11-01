# EGM Stage 8: Intermediate Zoom Out Review

*   **Target:** `E:\lms\docs\egm\design_draft.md`, lines 1–648 (unchanged since
    Stage 5)
*   **Reviewer:** egm-zoom-out (fresh context), with the Stage 5, 6 and 7
    reports
*   **Standard:** `resources/document_standards/zoom-out-standard.md`
*   **Verdict:** still not ready, because the Stage 5 Blocker (S5-1) stands. This
    stage adds 0 Blocker, 4 Major and 7 Nit findings.

**Answer to the focus question:**
*   **About a third** of the Stage 6 and 7 recommendations are necessary, and
    most of those are small.
*   **Several are scope creep:**
    *   the 150–315 item sample
    *   versioned content URLs
    *   the input-hash manifest
    *   the heading and text patch file
    *   re-checking and merging re-labelled terms
    *   defining a candidate pool for T3
    *   a server that copies GitHub Pages' behaviour
*   **The source rebuild (S5-1) makes about eight of them unnecessary**, and
    adds one requirement: a G1 check that does not rely on the converter.
*   **Two architecture gaps all three reports missed:** Z8-1 and Z8-2 below.

## Disposition of the Stage 6 and 7 recommendations

| Recommendation | Disposition | Why |
|---|---|---|
| design-7-1 / S5-4: MCQs into `practice.json` as `book: true` groups | **Necessary** | Uses the bank's existing shape (library.gd:354–355, practice_bank.gd:47–48). A few label edits are still needed (Z8-5). |
| design-7-2 / S6-1: two-phase verdict flow | **Necessary, in reduced form** | It closes only with Z8-1 (remove-only) and Z8-2 (one scanner run). Rebuilding quiz, key notes and intro then becomes filtering. |
| design-7-3: a reference independent of the converter | **Necessary, in reduced form; more so after the rebuild** | See Z8-3. "Measure heading recall on a sample" is optional. |
| design-7-4: per-chapter page offset | **Moot after rebuild** | Only the "which page do students see" decision remains (Z8-6). |
| design-7-5: committed heading and text patch file | **Reject if S5-1 is adopted** | The rebuild is the fix. Keep the current text for the one non-clean chapter and list it. |
| design-7-6: define T3's candidate pool | **Reject** | Drop T3 (S5-5). |
| design-7-7: re-check re-labels, merge duplicates | **Reject** | Drop re-labelling (Z8-1). `LEANS` on definitions is free and optional. |
| design-7-8: 150–315 item stratified sample, removal cap | **Reject the size; keep the core** | Sample removed items and stratify by type, using the existing held-out set (Z8-8). |
| design-7-9 / S6-11: can 20 MCQs per chapter be reached? | **Necessary: measure now** | No API needed: `bundle()` already builds every chapter's MCQs (test-import.mjs:88–107). Raise caps or add sources only if short. |
| design-7-10: `test-import` breaks | **Necessary** | Fix as in Z8-2 (same scanner run, same filter), not with a second raw export. |
| design-7-11 / S6-7: G6 depends on compression | **Necessary: measure at the public address and record `Content-Encoding`** | Reject the Pages-copying server. Re-assess Alt F only if G6 fails. |
| design-7-12: PWA updates | **Necessary: correct the claim. Optional: `pwa_update()` at Home. Reject: versioned content URLs and an update-path test** | Z8-9 |
| design-7-13 / S6-23: Q1 vs hosting | **Necessary** | Legal gate; private source repo plus site-only repo is the owner's choice (Z8-7). |
| design-7-14 / structural-7-3: Risks section | **Optional, as a short list inside NFR** | Add no new mechanisms (Z8-10). |
| design-7-15 vs S5-16: hash-gated publishing | **Necessary in S5-16's form; reject the input-hash manifest** | Z8-11 |
| design-7-17 | Optional | Documentation only. |
| design-7-18 | **Moot after rebuild** | The current edition becomes the source. |
| design-7-19 | Font subsetting **necessary**; force-push guard optional and cheap | The rebuild changes the character set (`python tools/godot-fonts.py`). |
| structural-7-1: redraw the diagram | Necessary | Simpler once it's one `content-review` run. |
| structural-7-2 / S6-14 / style-7-7: T4 table gaps | **Necessary** | S5-8's rule closes them: drop wrong options judged unsure or fits; keep the question if 2 or more remain. |
| S6-3 / style-7-3: request contents contradict each other | **Necessary, small** | The request body is the cache key; state its shape once. |
| S6-4 / S5-18 / style-7-5: recall-quiz coverage | **Necessary, no new question type** | `Analytics.quiz` builds items from term definitions (study.html:1587–1605). Keep a quiz item only if its term and definition are kept and it passes the mechanics check. |
| S6-5, S6-8, S6-9, S6-10 | Necessary, trivial | S6-10 matters: `.gitignore` must exist before the copyrighted PDFs are downloaded. |
| S6-6: edition, mapping, the 79th chapter | Edition **moot after rebuild**; mapping via S5-12; the 79th chapter is **necessary** | Name it and keep its current text. |
| style-7-1 / design-7-16 / S6-19: G2 "99%" wording | **Moot after rebuild** | G2 becomes 100% by construction, plus a regression check. |
| Other style and structural nits | Editorial | Many go away when wording moves into `questions.mjs` (S5-9); style-7-6's bad T1 example still needs fixing. |

## Findings

| Id | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| Z8-1 | 🟡 Major | draft 93–95, 242–245, 277–305, 532–534, 552–557; design-7-2, design-7-7, S5-3, S5-7, S6-1 | **Missed by all reports: verdicts must remove only, filtering after the rules choose, or the two-phase flow never closes.** Every derived item is chosen by ranking: summary by top-20-term density (study.html:1568–1576), quiz from the first 10 defined terms up to 8 (1589–1593), `makeMCQs` from the top 24 terms (driver.js:728, 741–743), key notes as a copy of the summary, intro with the top 5 terms (study.html:1374–1377). Rebuilding after verdicts promotes items nobody judged: the next definition, the 21st term, the 9th quiz term, the 25th MCQ term. | Verdicts are **keep / remove**, applied as filters after the rules choose; the rules never choose again. Only the MCQ pass needs a second judging round, so exactly two passes. **Drop re-labelling and joining** (`main_subject`, the 0.6 and 45-word rules) and, once pages come from the PDF, **"fix page"**. Apply the filter in the **shared scanner path**, so the web console, Android and Godot agree. |
| Z8-2 | 🟡 Major | draft 144–145, 171–183, 523–534, 548–557; S5-3, S5-13, design-7-15 | **Missed by all reports: the judged items and the shipped items come from two scanner runs known to differ.** Judging moves to Node `bundle()` (S5-3, S5-13), but packs are still made in headless Edge (godot-content.mjs:113–140). `test-import.mjs:56–79` tolerates 99% voice-note equality and one differing chapter per book, because the converter cleans Symbol-font and control characters before scanning while the packs are cleaned afterwards (`fixAll`, godot-content.mjs:137). Hash-keyed verdicts won't match some shipped items. | One scanner run produces both. S5-1 removes the cause (the rebuilt text is already clean). Then make `test-import` require exact equality and feed it the same verdict filter (this resolves design-7-10). If S5-1 is rejected, build the packs from the same `bundle()` run. |
| Z8-3 | 🟡 Major | draft 66–67, 196–214; S5-1, design-7-3, design-7-5 | **S5-1 overstates "G1 holds by construction."** pdfsuite's "clean" flags only fewer than 3 sections, glued words, running heads and contents leftovers (godot-pdfsuite.mjs:114–118). It never compares sections with the PDF, so a heading the converter misses is missed in both places. The contents-box parser reads only two-level numbers (driver.js:291), and 2.2.2 is third-level. | G1 check from **raw pdf.js text**: contents box plus a plain numbered-heading regex. Add a **one-time "nothing lost" diff** of rebuilt vs current `holostudy-demos.js` (word-shingle overlap). Drop the recurring "Text present" and "Leftovers" checks, and the new "Quiz mechanics" code (reuse test-import.mjs:88–98, extended to recall-quiz items). |
| Z8-8 | 🟡 Major (scope creep) | draft 71–74, 535–539, 628–635; design-7-8 | **Reject the 150–315 item sample**: "2% or less at 95%" is the reviewer's target, not a goal, and it adds hours of manual checking. The real flaws are pooling and never sampling removed items; the tables lean towards removal, so G3 can pass while good content is thrown away. | Give the 60 held-out labelled items (already stratified) a pass bar, covering T1, T2 and T4 at about 20 each. Keep the 50-item end-to-end check, stratified by type and including removed items. No removal cap. |
| Z8-4 | 🟢 Nit | draft 144–145, 196–199; S5-1 | **The rebuild feeds on its own output**: `words.txt` comes from `godot/content/packs` (godot-import.mjs:65–73) and splits glued words (driver.js:113–114, 507). Two rebuilds can differ, which changes item hashes and breaks CUJ 2. | Use a frozen, committed word list for the rebuild. |
| Z8-5 | 🟢 Nit | draft 130–138, 315–317, 559–566; S5-4, design-7-1 | **"No GDScript changes; drop Step 8" goes slightly too far.** Built-in chapters open `LessonScreen` (subject.gd:128), which has no Practice entry (only added books have one, book.gd:112). Hard-coded labels: home.gd:78 ("Class 10 maths MCQs"), practice.gd:75. | Keep a small Step 8 with the label edits, and either add a Practice button to built-in chapters or reword CUJ 1 to "open Practice and choose Biology 11, chapter 2". |
| Z8-6 | 🟢 Nit | draft 47–48, 68–70, 213–214; S5-2, design-7-4 | **S5-2's formula makes a third numbering scheme.** The converter strips running heads (including the printed page number) and keeps the PDF index (driver.js:234–284). | Decide which page students see. If it's the printed number (the one they can look up), take it from the running head in the rebuild. |
| Z8-7 | 🟢 Nit | draft 25–35, 104–113, 147–154, 568–576; design-7-13 | **The deliverables wait on different decisions:** release on Q1 and Q3, the check on Q2. Under Q1 (b) the publish gate does nothing. | Order the work so each part ships alone: (1) rebuild, code checks and MCQ counts (no key needed); (2) TypeSafe and Practice; (3) release. Gate only when built-in text ships. G5 stands apart. |
| Z8-9 | 🟢 Nit | draft 151–154, 345–347, 429–430, 573; design-7-12, S5-10 | **Correct the claim; build nothing new.** The worker is cache-first and waits for an "update" message (index.service.worker.js:158–162); nothing calls `pwa_*`. Each export stamps a new `CACHE_VERSION` (line 7). `content/` isn't precached. With S5-4 there's no schema change to break a mixed old/new load. | CUJ 3 and rollback: "appears on the next launch after the app is fully closed". Optional: `JavaScriptBridge.pwa_update()` at Home on `pwa_update_available`. |
| Z8-10 | 🟢 Nit | draft 404–431; design-7-14, structural-7-3 | Keep the Risks content short. Bandwidth is speculative while Q1 is open; model retirement affects only re-runs; ncert.nic.in being down affects only the one-time hash-checked fetch; false passes are covered by Z8-8; copyright by Q1. | A few lines inside NFR; no new mechanisms. |
| Z8-11 | 🟢 Nit | draft 149–152, 341–343, 535–537, 572; design-7-15, S5-16, S5-11 | **design-7-15's input-hash manifest is redundant**: any input change that matters changes an item hash, and `questions.mjs` changes are covered by a question version in the verdict key (S5-11). | S5-16's gate: refuse to publish if `verdicts.json` is missing, or any judged item has no verdict for the current question version. Needs Z8-2 fixed first. |

## What the rebuild (S5-1) makes unnecessary

*   design-7-5's patch file
*   design-7-4's page offset
*   design-7-18's old-edition archive
*   S6-6's edition question
*   the G2 "99%" wording debate (style-7-1, design-7-16, S6-19)
*   the "fix page" action
*   Stage A's recurring "Text present" and "Leftovers" checks
*   the main cause of Z8-2

The README already names this path: "Swap in updated NCERT text: replace
`engines/study/holostudy-demos.js`". The rebuild does **not** remove T1 or T4:
the `Analytics` rules are unchanged and would pick the "Kingdom" definition
again.

**It adds three things:** the G1 check that doesn't rely on the converter
(Z8-3), the one-time "nothing lost" diff (Z8-3), and a frozen word list
(Z8-4).

## Simplest combined shape after Stages 5–8

1.  **Rebuild the source.** Rebuild `holostudy-demos.js` from the PDFs with the
    converter and a frozen word list. Accept it only after the one-time
    "nothing lost" diff. Keep the current text for the one chapter that doesn't
    convert cleanly.
2.  **Run `content-review`** in Node via `bundle()` on the rebuilt text:
    *   Stage A: the heading check from raw PDF text, `LEANS` and `LEAD`, and
        test-import's mechanics checks.
    *   Stage B: T1 and T2 on what Stage A leaves, then T4 on the MCQs made
        after the T1 and T2 filters.
    *   Verdicts are keep or remove, applied after the rules choose.
3.  **Share the filter.** Apply the same filter in the shared scanner path, so
    the web console, Android, Godot and `test-import` agree. `godot-content`
    copies the kept MCQs into `practice.json` as `book: true` groups, plus the
    label edits.
4.  **Publish gate:** every judged item has a verdict for the current question
    version. It applies only when built-in text ships.
5.  **Measure G6** at the public address, and correct CUJ 3's update wording.

**This drops:** Step 6, most of Step 8, T3, re-labelling, joining, "fix page",
the T4 retry loop, the cache-name step, the throttled test-harness run, the
patch file, the input-hash manifest and versioned content URLs.
