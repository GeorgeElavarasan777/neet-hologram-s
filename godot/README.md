# HoloStudy — Godot edition

The HoloStudy app rebuilt in Godot 4.7 (GDScript, Compatibility renderer), exported for the browser.
Home → subjects → chapters, Listen (voice notes with the spoken word highlighted, grouped by section),
Read (page by page, tappable key terms, read-aloud that follows the voice), Hologram (124 NCERT
figures in 3-D with labels, label quiz and the take-apart / motion slider), Summary (key points,
recall quiz, every chapter's progress), Hologram Room, and Practice (Tap & answer rounds that resume
where you left off, and the Space shooter).

## Look

Three themes (☀ on Home, or ⋯ → Theme and text size in a lesson), defined in `scripts/ui.gd`:
**Calm** (default) — a ruled study notebook: cool paper, blue-black ink, a fountain-pen blue for actions,
Literata for everything you read, and the notebook's rose margin rule with chapter numbers written in
the margin; **Calm night** — the same notebook in deep slate for evening study; **Hologram** — the
original dark cyan look. The 3-D stage and the shooter stay dark in every theme.

## Your own PDFs

Home → Your books → **Add a PDF** turns a student's own textbook, chapter or notes (PDF, or a .txt / .md file)
into a book with the same tabs as the NCERT books: Listen, Read, Summary and Hologram, plus MCQs that join
Practice (Tap & answer and the Space shooter). It all happens in the browser; the file never leaves the device.

- **Reading:** pdf.js reads each page and the study console's own scanner (copied from `engines/study/study.html`
  at build time by `tools/godot-import.mjs`) builds chapters, sections, voice notes, key points, key terms, the
  summary and the recall quiz — exactly as for the NCERT books.
- **Textbook clean-up** (`web/import/driver.js`) for what printed textbooks leave in a PDF's text: running heads
  and page numbers, the chapter contents on page 1, fake-bold repeats, glued words (checked against the words of
  the NCERT books, `import/words.txt`), headings set in body-size capitals. NCERT file names (kebo102 = Class 11
  Biology chapter 2) give the chapter its title.
- **Holograms:** a chapter named like an NCERT chapter gets that chapter's figures; otherwise the library's
  figures whose titles and labels the text keeps using (tuned on the NCERT books).
- **MCQs:** fill-the-blank questions from the chapter's definitions, key points and sentences; the answer is a key
  term, wrong options are other key terms of the same shape; after answering, the book's own sentence and page.
- **Progress** works as for the NCERT books (notes heard, page, quiz, Continue on Home). Adding the same file
  again scans it afresh and keeps the progress; Delete removes the book, its files and its progress.
- Large PDFs ask which pages to scan (200 / 400 / 600 pages by device memory). Password-protected, damaged,
  scanned (no text), non-English and too-short files get a message saying what to do. The sheet shows each step
  with a progress bar; Cancel or closing the sheet stops it and adds nothing.

Books live in `user://books/` (IndexedDB in the browser), the list and all progress in `user://holostudy.json`.

## Build for the browser

```
node tools/godot-content.mjs        # 1. content from the web app → godot/content (books, holograms, practice)
python tools/godot-fonts.py         # 2. fonts cut to the characters the content uses (after content changes)
node tools/godot-build.mjs --serve  # 3. export → build/godot-web, preview on http://127.0.0.1:8060
```

Step 3 also builds the PDF converter into `build/godot-web/import/` (`tools/godot-import.mjs`).
`node tools/godot-build.mjs --content` runs step 1 and 3 together. The script looks for Godot in
`E:\tools\godot`; set `GODOT=<path to the Godot 4.7 console executable>` otherwise. The Web export
templates for 4.7.2 must be installed (Editor → Manage Export Templates, or only the `web_*.zip`
files in `%APPDATA%\Godot\export_templates\4.7.2.stable`).

`build/godot-web` is a plain static folder: put it on any web host (GitHub Pages, Netlify, a school
server). It is the single-threaded Web build, so it needs no special server headers and runs in
Chrome, Edge, Firefox and Safari on iPhone / iPad. Students can add it to the home screen
("Add to Home Screen" / "Install app") — it is a PWA. The engine (~38 MB, ~9 MB compressed) loads
once; each book and hologram is fetched when it is opened.

## Test

```
godot --headless --path godot -- --autotest     # desktop: a new student taps through every screen (exit code = failures)
```

```
node tools/godot-webtest.mjs                  # the walk-through in headless Edge (phone size, WebGL), with real taps and
                                              # the real file picker: adds a PDF it prints itself, studies, practises,
                                              # re-adds, rejects scanned/damaged files, cancels, deletes (exit code = failures)
node tools/test-import.mjs                    # the converter without a browser: each NCERT book's text gives the same
                                              # chapters, notes, terms, summary and quiz as its pack; MCQs well formed
node tools/godot-pdfcheck.mjs <file or folder>  # what "Add a PDF" makes of your own PDFs
```

`godot-webtest.mjs --fixture` also saves the converted sample book to `tests/sample-book.json`, which the desktop
walk-through uses in place of the browser converter. `tools/gdcheck.sh` compiles every script and lists errors.

## Layout

- `scripts/app.gd` — content loading (HTTP on the web, files elsewhere), progress, navigation, browser Back
- `scripts/library.gd` — your books: install (checked field by field), progress clean-up, delete, their MCQs
- `scripts/import_flow.gd` — the Add a PDF sheet: picker, progress, page range, result, errors
- `web/import/driver.js` — the converter's own part (clean-up, holograms, MCQs, the API the sheet calls)
- `scripts/speech.gd` — text-to-speech (Web Speech API in browsers): natural voice choice, word position
- `scripts/main.gd` — page stack, bottom sheets, toasts, UI scale (follows the device pixel ratio)
- `scripts/ui.gd` — colours, fonts, theme, line icons, widget builders
- `scripts/screens/*` — Home, Subject, Book, Lesson, Hologram, Hologram Room, Practice
- `scripts/lesson/*` — Listen, Read, Hologram and Summary tabs, the note player
- `scripts/holo/holo_view.gd` — the 3-D stage (GLB loading, hologram shader, orbit, labels, slider)
- `scripts/practice/*` — question picking and the Space shooter
- `web/shell.html` — the loading page around the game; `export_presets.cfg` — the Web preset
