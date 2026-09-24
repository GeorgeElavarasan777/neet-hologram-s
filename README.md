# HoloStudy LMS

A single learning space for **NCERT Class 11 & 12** (NEET + CBSE boards) that combines:

- **🔮 Hologram Room** — 124 figures · 276 sub-views · 1,624 labels. Every NEET-syllabus NCERT diagram rebuilt as a **real rotatable 3-D hologram** (orbit, zoom, explode, wireframe/x-ray, quiz mode).
- **📚 Study Console** — the full NCERT text (~600k words): **Listen** (~13,000 voice notes, karaoke highlighting), **Read** (page by page + re-read), **Summary** (confidence gauge + recall quiz), and an **AI study agent**.

Wired together by a curriculum map so each chapter opens straight to its Listen / Read / Summary / AI **and** its exact holograms.

It all sits inside a calm, distraction-free **study space**:

- **10 black-and-white themes** (Carbon Fiber Black, Rich Black, Ink Wash, Paper White, Slate Monochrome, Blueprint Inverse, Chalkboard, Marble Grey, Graphite Gradient, Duotone Sketch), each one swap of the same CSS variables (`--bg --surface --text --muted --accent --border`). Soft / Standard / High contrast, all verified at WCAG AA 4.5:1 or better (`node tools/check-contrast.js`).
- **Fonts**: Inter, IBM Plex Sans, Atkinson Hyperlegible, Source Serif 4, JetBrains Mono, Georgia. Size slider 14–22 px, line height 1.4–1.9. All fonts are bundled (SIL OFL).
- **Wallpapers** generated on the device (gradients, grain, geometric line art, greyscale nature scenes, ink washes, solid tones), or upload your own (max 5 MB, kept locally). You can apply them to the background, sidebar, header or cards, with an overlay slider. A wallpaper that would drop text below 4.5:1 is flagged and the overlay is raised automatically.
- **Focus Mode** (lesson + notes only), **Pomodoro timer**, **ambient sound** (rain / brown noise / silence, never autoplays), **warm light** filter, thin progress bars. No pop-ups and no badges.
- **Profiles**: every setting, note and progress bar is saved per profile in one JSON preferences object on the device.

---

## Android app (recommended on phones)

A native Android app in `android/` wraps the same web code in a WebView. Build it with `cd android && gradlew assembleRelease`, which produces `android/app/build/outputs/apk/release/app-release.apk`. You need JDK 17 and the Android SDK (platform 35). The web files at the repo root are copied into the APK at build time, so there is only one copy of the code.

What the app adds on top of the browser version:

- **Fully offline**: pdf.js, JSZip and the study-console fonts are served from the APK instead of CDNs.
- **Listen works on Android**: speech is routed to Android's text-to-speech engine, with word-by-word highlighting. Offline voices are preferred.
- **Refresh rate control**: *Adaptive* (the screen's top rate, e.g. 120 Hz, while you touch or scroll, then 60 Hz while you read), fixed 60/90/120 Hz, *Max* or *System*.
- **Focus Mode** hides the status and navigation bars and keeps the screen awake. The system bars follow the theme colours.
- Gentle vibration when a Pomodoro phase ends, notes export through the system file picker, a wallpaper picker, and the back gesture closing panels in order.
- Frees cached images on low memory and recovers by itself if the WebView renderer crashes.

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
├─ studyspace/                 themes, fonts, wallpapers, focus mode, timer, sound, notes
│  ├─ themes.js                the 10 themes as token sets + WCAG contrast maths
│  ├─ wallpapers.js            on-device wallpaper + theme-art generators
│  ├─ studyspace.js / .css     preferences, settings drawer, focus mode, Pomodoro, ambient sound
│  ├─ native-speech.js         Android app only: speechSynthesis → Android text-to-speech
│  └─ fonts/                   bundled OFL fonts + licences
├─ vendor/                     offline copies of pdf.js, JSZip, Google Fonts CSS (used by the app)
├─ tools/check-contrast.js     verifies all themes x contrast modes meet WCAG AA
├─ android/                    native Android app (WebView shell, refresh rate, TTS, focus mode)
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
- In a browser the study console loads pdf.js/DOCX reader from a CDN on first use. The Android app bundles them, and the hologram room bundles Three.js, so both are fully offline.
- Credits and licences for every outside asset are listed on the app's **About & credits** page.
