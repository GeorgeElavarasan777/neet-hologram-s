# EGM Stage 7: Critic Review

*   **Target:** `E:\lms\docs\egm\design_draft.md`, FeatureRange lines 1–458
*   **Reviewers (fresh contexts, run in parallel):**
    *   egm-design, against `feature-spec-standard.md`: completed
    *   egm-structural, against `feature-spec-standard.md` and the design-doc
        template: completed
    *   egm-style, using its persona's rules: completed
*   **Totals:** design 1 Blocker, 14 Major, 4 Nit · structural 0 Blocker,
    4 Major, 9 Nit · style 0 Blocker, 7 Major, 18 Nit
*   **Overlap:** several findings repeat Stages 5 and 6. They are marked "(also
    S5/S6)" and merged in the consolidated report.

Finding ids are `<reviewer>-7-<n>`.

## 🔴 Blockers

| Id | Lines | Finding | Recommendation |
|---|---|---|---|
| design-7-1 | 307–317, 75–77, 136–138, 183 | **Practice never reads built-in packs, so G4 delivers nothing.** `PracticeBank.chapters()` reads only `Library.practice_chapters()` (student-added books, `user://books/<id>.mcq.json`) and `practice.json` (practice_bank.gd:7–8, library.gd:334–357). Built-in packs are fetched one at a time on demand (app.gd:87–104). Even with new code, MCQs inside packs would make Practice download all six full-text packs. (also S5) | Write the kept MCQs to `practice.json` (or a small separate file) in the bank's shape `{id, title, color, group, gens:[[{q,o,a,h,t,p}]], book:true}`, one group per pack (`safe_hint` needs `book` and `p`). State plainly what game code changes, if any. |

## 🟡 Majors

| Id | Lines | Finding | Recommendation |
|---|---|---|---|
| design-7-2 | 169–186, 183, 277–317 | **The data flow is circular and leaves steps out.** MCQs are made after verdicts are applied, but T4 verdicts must exist first. `makeMCQs` needs in-memory fields (`c.sentences`, `t.def`, `t.defScore`, `t.score`; driver.js:741–744) that the export drops (terms are `{t,d,p,n}`, godot-content.mjs:132). The "next candidate" doesn't exist (cut to 4 at driver.js:765). The recall quiz (`Analytics.quiz`, study.html:1587–1607), the intro's "Key ideas" line and `keyNotes` (a copy of the summary, study.html:1377) are never rebuilt. Verdict keying isn't stated, and `godot/content/` is rebuilt each time. (also S5, S6) | Two phases: review base items (T1–T3), apply them in the page, rebuild quiz, MCQs and intro, run T4 on the rebuilt items, then write packs. Key verdicts by (pack, chapter, item type, hash of normalised text); a verdict that matches no item is an open failure. |
| design-7-3 | 196–199, 205–207, 66–67 | **"Compares like with like" is false, and the reference isn't independent.** `tidyBook`, `mend` and `unbold` exist only in driver.js, so the built-in packs never had that clean-up. `words.txt` is built from the packs under review (godot-import.mjs:65–73). G1 relies on `headingsIn` heuristics, which can miss the same heading on both sides. `tidyBook` removes the contents box. The 79th PDF isn't addressed. | Use raw pdf.js text (`HoloImport._test.read`) with a small documented normaliser. Take headings from the contents box plus a plain numbered-heading regex. Measure the reference's heading recall on a hand-checked sample. Name the non-clean chapter and how it's checked. |
| design-7-4 | 68–70, 137, 48, 205–214 | **No page numbering is defined.** Pack pages count through the whole book (biology11 chapter 2 is 10–22); each PDF starts at 1; the pack already mixes systems (`p:1` in a chapter on 10–22). Which page does CUJ 1 mean? (also S5) | A per-chapter offset confirmed by text matching. Check citations against the pack's own blocks first (what students see), then the PDF. State which page students see. |
| design-7-5 | 44, 66–67, 205–214, 151, 341–342 | **Stage A finds but can't fix.** For 2.2.2 the text is present (a p:14 block starts "Dinoflagellates These organisms…") and only the heading is missing. Adding a section isn't an action, and it would shift notes' `s` indices and Listen grouping. Glued words ("atthe vertices ofan" in physics11) and running heads are only listed. "Open failures" is undefined. (also S5, S6) | Add Stage A actions: a committed file of heading insertions and word-for-word text patches from the reference PDF. State which Stage A results block publishing. |
| design-7-6 | 255–261, 294–296, 47, 66–74, 114–118 | **The T3 candidate pool is undefined, and the rule inflates summaries.** Key points and summary points are the same items. "At least one per section" gives Biology 11 chapter 2 at least 18 points vs 4–9 today. Scoring every sentence (about 30k) breaks the 5M-token estimate. (also S5) | Define the candidates, the expected length and the effect on Listen key notes; rebuild the cost estimate from item counts. (Stage 5 suggests dropping T3.) |
| design-7-7 | 233–245, 279–284 | **A re-label isn't re-checked and can create duplicates**; the re-labelled term keeps a definition that fails stand-alone ("This kingdom…"). (also S6) | Re-ask `defines_term` after a re-label; merge into the existing term; add `stands_alone` for definitions shown in Key terms. |
| design-7-8 | 71–74 | **G3's sample is too small and biased.** 2 or fewer errors in 50 allows a true error rate of about 12–14% (95% bound). It's pooled across types, and removed items are never sampled. | Stratify by item type and subject; about 150 samples with 0 errors (or about 315 with 2) for 2% or less at 95%. Cap removals and sample removed items too. |
| design-7-9 | 75–77, 319–321 | **No evidence 20 questions per chapter is reachable.** `makeMCQs` caps at 30, 2 per term and the top 24 terms, and rejects math-heavy or digit-heavy sentences (driver.js:727–747), which hits Physics and Chemistry hardest. Existing tests ask for at least 5 (test-import.mjs:107) or at least 8 (pdfsuite:115). (also S6) | Report per-chapter counts before T4; add candidate sources or raise caps; say whether G4 blocks release. |
| design-7-10 | 84–86 | **Breaks `tools/test-import.mjs` by construction**: it compares converter output with the packs (test-import.mjs:46–81). It's missing from G7. (also S5) | Keep a raw (pre-verdict) export as its reference; add it to G7. |
| design-7-11 | 81–83, 337–340, 348–349, 397–402 | **G6 depends on host compression the plan never measures.** At 10 Mbit/s the uncompressed engine takes about 31 s. Pages has no custom headers or pre-compressed files, and whether it compresses `.wasm` and `.pck` is unknown. The test server sends `no-store` and no compression. Phone wasm compile time is hidden. Alt F's reason ignores headers and compression. (also S5, S6) | Measure on the published URL (or a server that copies Pages' behaviour); record the `Content-Encoding` of index.wasm and index.pck; re-assess Alt F (Cloudflare Pages or Netlify with `_headers`). |
| design-7-12 | 152–154, 345–347, 429–430 | **The "new version on next reload" claim has no support.** The PWA is on (export_presets.cfg:35). Godot's worker serves from cache first, and a new worker waits until every tab closes unless the app calls `JavaScriptBridge.pwa_update()`; nothing in `godot/` does. `content/*.json` and `*.glb` aren't precached and have no version in their URLs, so engine and content can come from different builds. Rollback is delayed the same way. (also S5) | Handle `pwa_update_available` (prompt, or auto-update at Home); version content URLs; test the update path. |
| design-7-13 | 104–113, 88–92, 130–138, 337 | **Q1's options don't survive the hosting choice.** `holostudy-demos.js` (full NCERT text) is committed. Pages on a Free plan needs a public repo, so the text is already published. A github.io address isn't really unlisted. Under (b), none of G1–G4 reaches students. (also S6) | State the repo's visibility. For (b) or (c), say how the repo's text is handled (a private source repo plus a site-only repo, or a paid plan). Make G1–G4 and CUJ 1 conditional on Q1. |
| design-7-14 | 404–431 | **No Risks & Mitigations section.** Missing: Pages' 100 GB/month bandwidth (a few thousand new students at 12–45 MB each), single-vendor dependence and the pinned model's retirement, Jev false passes, copyright, ncert.nic.in being down. | Add the section, with a mitigation for each risk. |
| design-7-15 | 149–162, 341–343 | **The publish gate parses Markdown for an undefined term**, and nothing ties the report to the content built. (also S5) | Gate on machine-readable status in `verdicts.json`, with hashes of the inputs (holostudy-demos.js, scanner code, ncert-sources.json, questions.mjs) and of the output packs. Refuse on mismatch; an item with no verdict is an open failure. |
| structural-7-1 | 166–199, 207–209, 309–317 | **The diagram doesn't match the text:** there's no edge from `ncert-src/*.pdf` to `content-review.mjs`; the MCQ pass is missing (one pass shown); `ncert-sources.json` is drawn only as an input, though fetch writes to it. | Redraw with the PDF-to-review edge and an explicit two-pass MCQ loop, or add a numbered run order. |
| structural-7-2 | 300–305, 607–608 | **The T4 table doesn't cover every case:** right yes, wrong unsure/yes, `stands_alone` unsure/no matches no row; "one is" leaves out two or more. (also S6, style-7-7) | Test `stands_alone` first; "one or more are"; add a catch-all "otherwise remove". |
| structural-7-3 | 406–430 | **The standard's Risks & Limits requirement isn't met:** TypeSafe's 64k/32k limits aren't tied to request grouping; there are no Pages traffic limits; there's no mitigation for wrong removals (G3 samples only passing items); copyright is only Q1. (merges with design-7-14) | Add a "Risks and limits" group inside NFR, each risk with a mitigation; cross-reference Q1. |
| structural-7-4 | 266 | **`'<option>'` isn't in a code span**, so it renders as an empty HTML tag and the T4 prompt loses its variable. | Backticks, or `&lt;option&gt;`. |
| style-7-1 | 68–70, 213–214 | **G2's "every / 99% / fixed" describe one goal ambiguously.** (also S6) | For example: "99% or more on their cited page before correction; after Stage A, 100% on their cited page or removed." |
| style-7-2 | 28, 218–221, 227, 361–369, 449–450 | **TypeSafe, Jev, "typed questions" and "state" are used before they're defined**; what kind of model Jev is goes unsaid, which weakens Alt B. (also S6) | Add one clause at first use (line 28); define "state" once, or say "inputs". |
| style-7-3 | 227–229, 233–264 | **"Every question's state includes…" is contradicted by T1–T4's lists.** (also S6) | Drop the universal statement or make the lists match. |
| style-7-4 | 34–35, 149, 151–152, 342 | **The publish gate is described four ways; "open failure" is never defined.** | Define it once (for example: a Stage A failure with no verdict, any failed request, a chapter under 20 MCQs) and use it everywhere. |
| style-7-5 | 15, 46, 69, 72, 76, 183, 211, 263, 282, 309–317 | **Quiz terms are inconsistent** (recall quiz / quiz item / MCQ / practice questions). (also S6) | Name the two types once ("recall quiz item", "practice MCQ"), say which checks apply to each, and use the names throughout. |
| style-7-6 | 236–238 | **T1's "true" example doesn't fit its rule**: "Fungi are cosmopolitan…" says where fungi occur, not what they are. This text goes to the model word for word. | Use a sentence that actually defines its term. |
| style-7-7 | 300–305 | T4 column header and "one is" wording (merges with structural-7-2). | "Wrong options `fits`"; "one or more are"; "otherwise remove". |

## 🟢 Nits

| Id | Lines | Finding |
|---|---|---|
| design-7-16 | 68–70 | Is the 99% measured before fixes? (merges with style-7-1) |
| design-7-17 | 114–118, 417–423 | The 5M-token estimate has no working shown; a paragraph-level cache invalidates whole batches; the cache (the only evidence) isn't committed; is Jev deterministic? |
| design-7-18 | 188–194 | `holostudy-demos.js` may already differ from today's PDFs; no archived copy of the old edition; say what the run does in each case. |
| design-7-19 | 120–122, 183–185, 343 | Pages needs admin rights, not just write. Font subsetting (`python tools/godot-fonts.py`) is missing from the data flow. The dependence on a prior `build/godot-web/import` isn't shown. The force-push should refuse any branch other than gh-pages. |
| structural-7-n1 | 233–298 | T1–T4 and the table titles are bold text, not headings; use H4. |
| structural-7-n2 | 275, 113 | "(see Verification)" should be "Verification Plan"; "held-out" isn't the term used there; "Step 9" should name `tools/godot-publish.mjs`. |
| structural-7-n3 | 196–197 | Name the source file (`godot/web/import/driver.js`) and say `build/…/holostudy-import.js` is generated (and gitignored). |
| structural-7-n4 | 107–112 | Make Q1's (a)/(b)/(c) a nested list. |
| structural-7-n5 | many | The colon inside or outside bold labels is inconsistent. |
| structural-7-n6 | 207–208, 323, 349 | Goal tags (G1, G5, G6…) are applied unevenly to headings. |
| structural-7-n7 | 235–269 | Criteria are uneven (T2 has only false, T4 none); `stands_alone` names two different questions, so use `point_stands_alone` and `mcq_stands_alone`. |
| structural-7-n8 | 169, 184–185 | Diagram lines are about 110 characters wide; a connector is misaligned. |
| structural-7-n9 | 3–5 | Author field and Status ("In Review"). |
| style-7-n1 | 1 | The title's "full practice" isn't measurable. |
| style-7-n2 | many | Format UI labels; say once that Tap & answer and Space shooter are Practice modes. |
| style-7-n3 | 17 | "Made by machine" could suggest AI; say "generated by scripts". |
| style-7-n4 | 22–23, 445 | "Nobody has checked…" vs `data/review.md`; say how they relate. |
| style-7-n5 | 46–47, 71, 137, 247, 250 | One idea phrased five ways; use "stands alone". |
| style-7-n6 | 50–52, 356–357, 374 | Count the "several thousand" items; replace the rhetorical absolutes with costs. |
| style-7-n7 | 59–60, 114–115 | "This PC" should be "the developer's PC". |
| style-7-n8 | 73–74 | Define what counts as an "error" in the G3 sample. |
| style-7-n9 | 80 | G5: who decides, and the possible outcomes (keep / add / remove). |
| style-7-n10 | 115–117 | Stacked hedges; "output tokens are not billed"; give a basis for $2. |
| style-7-n11 | 111 | "Convert cleanly" should be "pass `godot-pdfsuite`". |
| style-7-n12 | 120–122 | Make Q3's options parallel. |
| style-7-n13 | 123 | Name the source of the Q4 quote. |
| style-7-n14 | 144, 151, 180–181, 319 | Name outputs by file name (`REPORT.md`, `verdicts.json`). |
| style-7-n15 | 160–161, 177, 271 | Use the defined stage names (Stage A/B/C). |
| style-7-n16 | 169–170, 192, 198–210 | Diagram edges; define "glued words", "running heads", "fake bold", "Leftovers", "word-shingle overlap" (with a threshold). |
| style-7-n17 | 220, 244, 273–275, 294–296, 315, 319–329, 338 | Small precision gaps: threshold boundaries, tie-break for 4 per section, the `q,o,a,p,s` fields, who reviews, "have been removed", name COOP/COEP. |
| style-7-n18 | 25, 92, 94, 292, 365–430, 434, 447 | Wording: "three things" vs seven goals; "no student data is sent anywhere" should be "this plan sends none"; merged/join; absolutes; "repo"; "closes" should be "mitigates" for the CVE; "returns the old content"; H3 nesting (inherited from the template). |

## Checked and correct (structural)

*   Section order and separators match the template; no skipped heading levels;
    tables and code fences are well formed.
*   Every file path cited in lines 1–458 exists under `E:\lms`.
*   "See Future Improvements" and "Step 9" point at real sections; the provenance
    footer is present.
