# HoloStudy LMS

A single learning space for **NCERT Class 11 & 12** (NEET + CBSE boards) that combines:

- **🔮 Hologram Room** — 124 figures · 276 sub-views · 1,624 labels. Every NEET-syllabus NCERT diagram rebuilt as a **real rotatable 3-D hologram** (orbit, zoom, explode, wireframe/x-ray, quiz mode).
- **📚 Study Console** — the full NCERT text (~600k words): **Listen** (~13,000 voice notes, karaoke highlighting), **Read** (page by page + re-read), **Summary** (confidence gauge + recall quiz), and an **AI study agent**.

Wired together by a curriculum map so each chapter opens straight to its Listen / Read / Summary / AI **and** its exact holograms.

---

## Run it — two ways

### 1. Just look at it now (desktop)
Double-click **`Start HoloStudy LMS.bat`**.
It starts a tiny local server and opens `http://localhost:8899/` in your browser.
(If Node.js isn't installed it falls back to opening `index.html` directly — most things work, but PWA install and audio-seeking need the server.)

### 2. On your Android phone (install like an app)
1. Make sure the phone and PC are on the **same Wi-Fi**.
2. Run `Start HoloStudy LMS.bat` — the small server window shows a line like
   `On your phone: http://192.168.x.x:8899/`.
3. Open that address in **Chrome on the phone**.
4. Chrome menu **⋮ → Add to Home screen / Install app**.
   HoloStudy now opens full-screen like a native app and works offline after first load.

> To host it as a public website later, upload the whole `HoloStudy-LMS` folder to any static host
> (GitHub Pages, Netlify, Vercel, Cloudflare Pages). It's all static files — no backend needed.

---

## Folder layout (clean, ready to update)

```
HoloStudy-LMS/
├─ index.html                  the LMS hub (dashboard, subjects, chapters, hologram room, search)
├─ manifest.webmanifest        PWA manifest (installable, icons, shortcuts)
├─ sw.js                       service worker (offline cache of app + engines)
├─ serve.js                    local static server (correct MIME + audio Range) — node serve.js
├─ Start HoloStudy LMS.bat     double-click launcher (Windows)
├─ data/
│  ├─ curriculum.js            the map: 79 chapters ⇄ 124 holograms (generated, matched by title)
│  ├─ build_curriculum.py      regenerates curriculum.js from the two source lists
│  ├─ FIGURES.md               full hologram catalogue
│  └─ review.md                NCERT chapter list (words/sections/pages)
├─ engines/
│  ├─ holograms/               the 3-D hologram engine (index.html + holo.js + vendor/three.min.js)
│  └─ study/                   the study console (study.html + holostudy-demos.js)
└─ assets/icons/               app icons (svg + png, normal + maskable)
```

## Updating / extending later

- **Add or fix a hologram:** edit `engines/holograms/` (see its `src/` split and `build/` scripts in the
  original NEET-Holo-Diagrams project), then it shows up wherever that figure is linked.
- **Re-map chapters ⇄ holograms:** edit and re-run `python data/build_curriculum.py`.
- **Swap in updated NCERT text:** replace `engines/study/holostudy-demos.js` (rebuilt from the HoloStudy project).
- The hub reads everything from `data/curriculum.js`, so new chapters/holograms appear automatically.

## Notes
- Everything runs **on-device** — nothing is uploaded. Progress is saved in the browser (localStorage/IndexedDB).
- NCERT text is bundled for personal study; get permission before public distribution.
- Study console loads pdf.js/DOCX reader from a CDN on first use; the hologram room bundles Three.js and is fully offline.
