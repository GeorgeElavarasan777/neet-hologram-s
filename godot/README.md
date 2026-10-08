# HoloStudy — Godot edition

The HoloStudy app rebuilt in Godot 4.7 (GDScript, Compatibility renderer), exported for the browser.
Home → subjects → chapters, Listen (voice notes with the spoken word highlighted, grouped by section),
Read (page by page, tappable key terms, read-aloud that follows the voice), Hologram (124 NCERT
figures in 3-D with labels, label quiz and the take-apart / motion slider), Summary (key points,
recall quiz, every chapter's progress), Hologram Room, and Practice (Tap & answer rounds that resume
where you left off, and the Space shooter).

## Build for the browser

```
node tools/godot-content.mjs        # 1. content from the web app → godot/content (books, holograms, practice)
python tools/godot-fonts.py         # 2. fonts cut to the characters the content uses (after content changes)
node tools/godot-build.mjs --serve  # 3. export → build/godot-web, preview on http://127.0.0.1:8060
```

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

On the web, open `index.html?autotest`: the same walk-through runs in the browser and writes its
results to `window.__holo`. `tools/gdcheck.sh` compiles every script and lists errors.

## Layout

- `scripts/app.gd` — content loading (HTTP on the web, files elsewhere), progress, navigation, browser Back
- `scripts/speech.gd` — text-to-speech (Web Speech API in browsers): natural voice choice, word position
- `scripts/main.gd` — page stack, bottom sheets, toasts, UI scale (follows the device pixel ratio)
- `scripts/ui.gd` — colours, fonts, theme, line icons, widget builders
- `scripts/screens/*` — Home, Subject, Lesson, Hologram, Hologram Room, Practice
- `scripts/lesson/*` — Listen, Read, Hologram and Summary tabs, the note player
- `scripts/holo/holo_view.gd` — the 3-D stage (GLB loading, hologram shader, orbit, labels, slider)
- `scripts/practice/*` — question picking and the Space shooter
- `web/shell.html` — the loading page around the game; `export_presets.cfg` — the Web preset
