# EGM Stage 9: Implementation Readiness Test

*   **Target:** `E:\lms\docs\egm\design_draft.md`, DetailedRange lines 459–648
*   **Reviewers (fresh contexts, run in parallel):**
    *   egm-implementation-readiness, against
        `implementation-readiness-standard.md`: completed
    *   egm-codebase-details, against `implementation-readiness-standard.md`:
        completed (it had no shell, so step 0's git state was not checked)
    *   egm-style, using its persona's rules: completed
*   **Totals:** readiness 4 Blocker, 14 Major, 9 Nit · codebase 4 Blocker,
    13 Major, 6 Nit · style 0 Blocker, 8 Major, about 20 Nit
*   **Verdict:** not ready. The plan fails the Zero-Decision Rule: an
    implementer would still have to make several design decisions.

Ids are `ir-9-*` (readiness), `cd-9-*` (codebase), `style-9-*`.

**Confirmed correct by codebase-details:**
*   All 79 chapters are in `curriculum.json`.
*   Both `getDocument` calls sit at study.html:1261 and :2354, without
    `isEvalSupported`.
*   `makeMCQs` is at driver.js:726.
*   Every file the plan says exists does exist.
*   Every target path is marked Create, Modify or Commit.

## 🔴 Blockers

| Id | Lines | Finding |
|---|---|---|
| ir-9-B1 | 518–519, 532–534, 552–556 | **`verdicts.json` has no schema, yet two tools depend on it.** Missing: the item kinds (is the recall quiz one? `keyNotes`?), the hash algorithm and text normalisation, the file layout and schema version, each action's payload (new term, joined text, new page, swapped options), what happens when an item has two actions, and the merge rule for `--only` runs. Packs keep only `{t,p}` and `{t,d,p,n}`, so "the sentence before" must come from `blocks` plus `splitSentences` (which lives in study.html). |
| ir-9-B2 / cd-9-B1 / cd-9-B2 | 521–556, 183, 309–317 | **The MCQ pipeline can't run as written, and `mcqsFor` can't take a pack chapter.** The order is circular (T4 verdicts are needed before the MCQs exist). `makeMCQs(c, bookTerms, forms)` reads the in-memory shape (`t.def`, `t.defScore`, `t.defPage`, `t.score`, `c.summary[].text`, `c.sentences`, `c.blocks[].kind/.text`, `c.sections[].title/.page`, `c.text`; driver.js:707–775), but the packs hold `{t,d,p,n}`, `{t,p}`, `{k,t,p}` (godot-content.mjs:128–134). `forms` is dropped, yet `form()` calls `forms.get` (driver.js:734). `bookTerms` is the top 12 terms of each chapter (driver.js:828). It depends on bundle-only helpers (`Analytics.stem`, `GENERIC`, `isSpeakable`, …). `holostudy-import.js` is built after the export, while `--content` runs before it (godot-build.mjs:26–29 vs 36, 55). There's no candidate list for "replace option" (`.slice(0,4)`, driver.js:765). **Reuse:** `HoloImport._test.makeMCQs` and `termForms` are already public (driver.js:889); test-import.mjs:13–55 already runs `bundle()` in a Node `vm` and gives every built-in chapter `mcq`. |
| cd-9-B3 | 521–557, 171–174 | **The check won't give the same result twice (breaks CUJ 2).** content-review reads `godot/content/packs/*.json`, which step 7 overwrites with verdicts applied. The next run re-judges changed items and leaves verdicts with no item; `godot/content/` is gitignored, so the raw packs can't be recovered. Needs a raw (pre-verdict) export. |
| ir-9-B3 | 521–537, 548–557, 578–585 | **G1 and "Text present" failures can never be fixed**, so the publish gate can never pass. The pack really does jump from 2.2.1 to 2.2.3. No step adds a section or paragraph, edits holostudy-demos.js, or names a scanner rule. |
| ir-9-B4 / cd-9-M1 / cd-9-M7 | 548–566, 134, 315 | **Built-in MCQs stored in packs don't fit Practice.** Packs are whole-book files fetched on demand (app.gd:87–105). `PracticeBank.groups()` and `chapters()` are synchronous over `Library` plus `practice_data` (practice_bank.gd:7–12). The Practice screen loads only `practice.json` (practice.gd:35; app.gd:123–128). Step 8 touches `groups()` but `make()` uses `chapters()`. The chapter entry shape and id scheme are undefined. Missing targets: `practice.gd` (subtitle "Class 10 maths…", line 75), `home.gd:78`, and the built-in chapter sheet, which has only Listen, Read, Summary and Hologram (subject.gd:95; added books have `Act_practice`, book.gd:112). **Reuse:** godot-content.mjs:56–70 already writes `practice.json` in the right shape. |
| cd-9-B4 | 565–566, 315 | **The plan describes current behaviour wrongly.** The added-book path *does* show the source sentence after answering: `h: 'Page N: <sentence>'` (driver.js:772) goes to `hint` (practice_bank.gd:47) and is printed in feedback (practice.gd:302–303); the README says so (godot/README.md:38). Only the shooter's pre-answer hint uses `safe_hint`, and only with `book: true` (practice_bank.gd:54–56), which the plan never sets. The real fields are `q,o,a,h,t,p`, not `q,o,a,p,s`. |

## 🟡 Majors

| Id | Lines | Finding |
|---|---|---|
| ir-9-M1 | 526, 532, 552 | content-review's input and repeat runs are undefined (merges with cd-9-B3): review must read a raw export; say what step 7 does with items that have no verdict. |
| ir-9-M2 / cd-9-M4 | 528, 196–214 | **Stage A's extraction API, page mapping and "not found" outcome are open.** Name the call (`HoloImport.convertUrl`, or `_test.read` then `_test.tidyBook`). The converter removes the contents list, so G1 headings need raw text from `_test.read(url, pages)` (driver.js:890–895). Pack pages are printed book pages from `[[page N]]` markers (study.html:954, 962); the PDF uses indices from 1 (study.html:975–977). Give an offset rule and the outcome when an item isn't found. |
| ir-9-M3 | 499–519, 529–530, 218–231 | **No TypeSafe request or answer format.** How criteria, choice options and score levels are expressed; whether choice returns per-option probabilities and what score returns; contradictory state shapes; question names collide when items share a request. Give one full example and a naming scheme such as `<kind>_<itemHash8>_<question>`. |
| ir-9-M4 / cd-9-M6 | 531, 271–305, 242–245 | **Decision-table gaps.** Missing T4 rows; relabel always creates a duplicate; "unsure: never a quiz or MCQ answer" has no representation; the `main_subject` option extraction isn't specified; the T2 join needs fresh T2 and T3 calls; summary points have no section index (use the existing `sectionOf`, driver.js:716); is the recall quiz (`Analytics.quiz`, study.html:1587–1608) judged by T1 or T4? |
| ir-9-M5 / cd-9-M3 | 479–497 | **ncert-fetch is under-specified.** Recording `pages` in Node needs a PDF parser (the repo has only browser pdf.js), which is a dependency decision. "Download missing" vs "detect changes" contradict. HTTP failure, user-agent, exit code, accepting a new edition. Reuse the code rule (driver.js:366–373, godot-pdfsuite.mjs:29–34). Name files `<code>.pdf` (pdfsuite.mjs:33 relies on it). Use `data/curriculum.js`, which is committed, not the gitignored `godot/content/curriculum.json`. |
| ir-9-M6 / cd-9-M10 | 499–511, 526–531, 156–162, 602–610 | **Client failure handling is incomplete.** No budget default; estimate before sending; cache hits shouldn't count; is a stop an exception or an exit code? `ask()` can't take a budget or an injected `fetch`. 429 has no retry cap and no fallback without `retry-after`; network rejects aren't handled; no-key behaviour isn't stated. Write the Stage A report before Stage B can throw. Use `tools/mock-claude-api.mjs` as the mock pattern. |
| ir-9-M7 | 535–537, 319–321 | **G4 has no fix path or gate.** `makeMCQs` has only global caps (30 questions, 24 terms, 2 per term; driver.js:728, 747–748); there are no per-chapter settings; "reviewed before release" isn't a task; chapters under 20 don't block. |
| ir-9-M8 / cd-9-M2 | 548–557, 620–640 | **`tools/test-import.mjs` breaks and isn't in the plan.** It compares converter output with the packs in terms, summary and quiz, allowing one exception per book (test-import.mjs:50–81). It's documented (godot/README.md:78). Verification lists `test-practice-bank.mjs`, which tests only the Class 10 generators (test-practice-bank.mjs:2, 11). |
| ir-9-M9 / cd-9-M8 | 568–576 | **Publish mechanics are left to the implementer.** Parsing Markdown is fragile; gate on verdicts.json covering the packs. Service worker: `shell.html` has no `register` call; name the file and constant, or drop the step if Godot already stamps a version. Are `content/` files cached by the service worker or by HTTP? Does `--content` run? Worktree commands (`git worktree add --orphan` needs Git 2.42 or later), remote, cleanup, the one-time Pages setting, how the address is derived. `.nojekyll` already exists (godot-build.mjs:52). |
| ir-9-M10 / cd-9-M8 | 568–571, 104–113 | **Q1 (b) and (c) need unplanned work.** (b) means removing packs from the build: godot-build.mjs:51 copies all content and app.gd:10 hard-codes `PACK_IDS`. (c) needs noindex and still exposes the text in a public branch. |
| ir-9-M11 / cd-9-M11 / style-9-M5 | 584–585 | **Step 10's Analytics fixes are unbounded.** No threshold for "repeated" and no stop condition. Any rule change changes every item hash, because Analytics feeds both the packs and the converter (godot-import.mjs:22), and needs a full re-review. Tests belong in test-import.mjs. |
| ir-9-M12 / cd-9-M9 | 587–594, 641–642 | **The throttled run can't measure G6.** No flag, CDP settings or "Home reached" signal (`?autotest` runs the whole walkthrough; app.gd:33, autotest.gd:13–19). The server sends `no-store` without compression (godot-webtest.mjs:88), so it isn't representative of Pages. No chapter or node names for the new Practice steps. |
| ir-9-M13 | 602–610, 624–625 | **Test-plan gaps.** Fixture location and format (the PDFs are gitignored); what content-review exports for unit tests; how fetch is mocked. No tests for fetch change detection, step 7's apply step, the wrapper, PracticeBank listing built-ins, or the publish gate. |
| ir-9-M14 / style-9-M1 | 461–462, 464–618 | **No phases or checkpoints.** The standard requires them. "Steps run in this order" contradicts itself: step 9 publishes before the security fix (10) and the tests (11, 13); step 10 points ahead to step 13; after step 7, test-import fails. Group the steps into phases, each ending with named commands that must pass. |
| cd-9-M5 | 523–524 | **pdfsuite can't be "reused" as stated:** it exports nothing and has top-level side effects (argv, `process.exit`; lines 20–23, 135); its leftover checks are inline (76–96); the quiz-mechanics checks already exist in test-import.mjs:91–97. Choose between extracting a shared module and copying; state the build prerequisite (pdfsuite.mjs:23–25). |
| cd-9-M12 | 559–566 | **The answer can leak in Practice.** `makeMCQs` writes `t: sec \|\| right` (driver.js:772); when `sectionOf` returns empty (driver.js:718–724) the topic tag is the answer, shown before answering (practice.gd:232–239) and in `safe_hint` (practice_bank.gd:55–56). |
| cd-9-M13 / style-9-M2 | 466–477, 62 | "Four new files" vs three listed. *(Elephant note: `git status` on 2026-11-01 shows the fourth is `godot/scripts/capacity_test.gd.uid`.)* |
| cd-9 (possible Major) | 319–321 | G4 risk: at most 30, 2 per term, 24 terms; 20 after T4 isn't assured; decide the fallback now. |
| style-9-M3 | 533–534, 552, 555 | The verdict actions need exact enum strings ("relabel" vs "re-label"; "fix page" has a space; "action" vs "verdict"). |
| style-9-M4 | 535–537 | "Open failures" is unclear; suggested: "a failed check with no assigned action; publishing is blocked while any remains". |
| style-9-M6 | 626–642 | **Verification entries lack pass criteria:** G1/G2 targets, a held-out accuracy bar, 83/83 desktop, 20 s / 4 s, and no G4 entry at all. |
| style-9-M7 | 629–634 | The tuning set is imprecise: two of the "five errors" are Stage A items; "tune wording" vs freezing "thresholds and wording"; "held-out" is used inconsistently with line 274. |
| style-9-M8 | 559–566, 587–594 | Step 8 lists `library.gd` but changes nothing in it; step 11 doesn't split the work between webtest and autotest. |

## 🟢 Nits

| Id | Lines | Finding |
|---|---|---|
| ir-9-N1 / cd-9-N2 | 466–477, 637–638 | Desktop command: `godot --headless --path godot -- --autotest` (godot/README.md:71); add `tools/gdcheck.sh`; what to do if a test fails before committing. |
| ir-9-N2 | 479–488 | Give the ncert-sources.json shape; generate the 79 entries rather than typing them. |
| ir-9-N3 | 555, 315, 565 | Field names `q,o,a,h,t,p`; `book: true` is needed for "Look on page" (merges with cd-9-B4). |
| ir-9-N4 | 517 | Are 0.7 and 0.3 inclusive? |
| ir-9-N5 / cd-9-N4 | 556–557 | Define `review.version` and the date format; nothing reads `review`; no verdicts means no `mcq`. |
| ir-9-N6 | 538–539 | `--sample`: a seed; does "passing" include relabel and join; is sample.md committed? |
| ir-9-N7 | 552–553 | **Key-point progress is stored by index (`k<i>`, app.gd:220).** Removing or joining summary points moves returning students' ticks onto different points. |
| ir-9-N8 | 529–530 | The rule for splitting a group over 48k tokens; how many requests run in parallel. |
| ir-9-N9 | 596–600 | G5 can change the 79-chapter list: move it before step 1, or record decisions only. |
| cd-9-N1 | 639–640 | pdfsuite exits with the unclean count (exit code 1 at 78 of 79); pass on the printed "N of 79 clean" line. |
| cd-9-N3 | 622 | Add `python tools/godot-fonts.py` after content changes (godot/README.md:52). |
| cd-9-N5 | 506–507 | State the cache-key input (model plus exact body) in step 3. |
| cd-9-N6 | 574 | Name the git commands; the one-time Pages setting. |
| style-9 nits | 468–642 | Wording: "housekeeping" should be "Version control"; "settled" should be "resolved"; name the fetch tool; two different SHA-256 uses; budget flag naming; "single place for wording" understates the module; name the referenced subsections; `[--sample N]`; verbless bullets; "thin wrapper" is jargon; ambiguous "stored as `mcq`"; "titled by the pack"; "question path"; the `tools/` prefix; anchor line numbers to a commit; name the Practice modes; "40 ms latency"; "rows with unsure inputs"; "when verdicts.json changes"; `test-practice-bank` status; serial "and"; "90 existing steps plus…"; define "Sweet System". |
