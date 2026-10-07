/* Phone (portrait) shell for the study console: just the material, a slim app bar and a play/pause.
   · One slim app bar replaces the four stacked blocks (header ×2, chapter strip, tabs):
       [☰ chapters]  Chapter title · where you are  [⋯ settings]
     ☰ slides the chapter list in from the left; ⋯ drops the voice / speed / subject / library sheet.
   · The tabs become a bottom bar, like any phone app.
   · Read: the page fills the screen; a floating control at the bottom does ‹ page · ▶/❚❚ · page ›.
     Play reads the page aloud from where you are and the page follows the voice.
   · Loading: a calm card with one status line and a progress bar instead of the scanner animation.
   Tablets, desktop and landscape keep the full console. Depends on study.html (UI, HS, Player, $). */
(function () {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  // phones in portrait, and phones turned sideways (short landscape screens)
  const MQ = matchMedia('(max-width: 860px) and (min-height: 561px), (orientation: landscape) and (max-height: 560px)');
  const LAND = matchMedia('(orientation: landscape) and (max-height: 560px)');
  const ui = () => (typeof UI !== 'undefined' ? UI : null), hs = () => (typeof HS !== 'undefined' ? HS : null), pl = () => (typeof Player !== 'undefined' ? Player : null);
  const TAB = { listen: 'Listen', read: 'Read', holo: 'Hologram', summary: 'Summary', inside: 'Inside', agent: 'Agent' };
  let bar, scrim, mini, ready = false;
  const on = () => document.body.classList.contains('m-ui');

  function setup() {
    const app = q('#app'); if (!app || ready || !ui()) return; ready = true;
    bar = document.createElement('div'); bar.id = 'mBar';
    bar.innerHTML = `<button class="mb-btn" id="mChBtn" aria-label="Chapters">☰</button>
      <button class="mb-title" id="mTitleBtn" aria-label="Chapters"><b id="mTitle"></b><span id="mSub"></span></button>
      <button class="mb-btn" id="mSetBtn" aria-label="Voice, speed and more">⋯</button>`;
    app.insertBefore(bar, app.firstChild);
    scrim = document.createElement('div'); scrim.id = 'mScrim'; app.appendChild(scrim); // same stacking context as the sheets, so they stay tappable
    q('#mChBtn').onclick = () => sheet('m-ch'); q('#mTitleBtn').onclick = () => sheet('m-ch');
    q('#mSetBtn').onclick = () => sheet('m-set');
    scrim.onclick = () => sheet(null);
    q('#chapterRail').addEventListener('click', (e) => { if (e.target.closest('[data-ch]')) setTimeout(() => sheet(null), 60); });
    q('#btnHome').addEventListener('click', () => sheet(null));
    // listening options live in the ⋯ sheet on phones (the Listen tab keeps only the player and the notes)
    const opts = document.createElement('div'); opts.id = 'mOpts';
    opts.innerHTML = `<span class="mo-label">Listening</span><button class="m-opt" id="mKeyOnly" aria-pressed="false">Key points only</button><button class="m-opt" id="mAutoAdv" aria-pressed="false">Auto-advance</button>`;
    q('.hdr').appendChild(opts);
    q('#mKeyOnly').onclick = () => { const H = hs(), P = pl(); H.settings.keyOnly = !H.settings.keyOnly; saveSettings(); P.stop(); P.idx = 0; ui().renderListen(); ui().renderRail(); update(); };
    q('#mAutoAdv').onclick = () => { const H = hs(); H.settings.autoAdvance = !H.settings.autoAdvance; saveSettings(); update(); };
    // the floating reader control
    mini = document.createElement('div'); mini.id = 'mPlayer';
    mini.innerHTML = `<button class="mp-btn" id="mpPrev" aria-label="Previous page">‹</button>
      <label class="mp-where"><span id="mpPage"></span><small id="mpSec"></small><select id="mpJump" aria-label="Jump to section"></select></label>
      <button class="mp-play" id="mpPlay" aria-label="Read this page aloud">▶</button>
      <button class="mp-btn" id="mpNext" aria-label="Next page">›</button>`;
    q('#pane-read').appendChild(mini);
    q('#mpPrev').onclick = () => ui().gotoPage(hs().page - 1);
    q('#mpNext').onclick = () => ui().gotoPage(hs().page + 1);
    q('#mpJump').onchange = (e) => { if (e.target.value) ui().gotoPage(+e.target.value); e.target.value = ''; };
    q('#mpPlay').onclick = playPage;
    // Hologram tab: the model gets the screen; the Claude panel folds into a one-line bar until it is needed
    const cxBar = document.createElement('button'); cxBar.id = 'mCxBar'; cxBar.innerHTML = '<span>✦ Make a Claude hologram of this chapter</span><b>›</b>';
    q('#pane-holo').appendChild(cxBar);
    cxBar.onclick = () => { document.body.classList.toggle('m-cx-open'); holoLayout(); };
    hook();
    MQ.addEventListener ? MQ.addEventListener('change', apply) : MQ.addListener(apply);
    apply();
  }

  // Read: ▶ starts the voice at the first note on this page; ❚❚ pauses; the page follows the voice
  function playPage() {
    const P = pl(), H = hs(); if (!P) return;
    const list = P.list(), cur = list[P.idx];
    if (P.playing && !P.paused) return P.toggle();
    if (P.playing && P.paused && cur && cur.page === H.page) return P.toggle();
    let i = list.findIndex((n) => !n.intro && n.page >= H.page); if (i < 0) i = 0;
    P.play(i);
  }
  function hook() {
    const U = ui();
    const wrap = (name, after) => { const f = U[name].bind(U); U[name] = function (...a) { const r = f(...a); try { after(...a); } catch (e) { /* never break the app */ } return r; }; };
    wrap('setTab', (t) => { update(); if (t === 'holo') holoLayout(true); });
    if (U.renderHolo) wrap('renderHolo', () => holoLayout());
    wrap('renderHeader', () => update());
    wrap('selectChapter', () => update());
    wrap('gotoPage', () => update());
    wrap('renderRead', () => update());
    // every player change re-renders Listen: keep the Read control in step and turn the page with the voice
    wrap('renderListen', () => {
      const P = pl(), H = hs(); updatePlay(); if (H.tab === 'listen') update();
      if (on() && H.tab === 'read' && P.playing && !P.paused) { const n = P.note(); if (n && n.page && n.page !== H.page) U.gotoPage(n.page); }
    });
    // calmer loading card on phones
    const sc = U.scan, show = sc.show.bind(sc), step = sc.step.bind(sc);
    sc.show = (name) => { show(name); const h = q('.scan-box h2'); if (h) h.innerHTML = on() ? `<i></i> Opening ${String(name || 'your document').replace(/[<>&]/g, '')}` : '<i></i> Scanning document'; };
    const FRIENDLY = [[/^Target acquired: .*/, 'Getting ready…'], [/^Detecting chapters/, 'Finding chapters'], [/^Detecting subject/, 'Recognising the subject'], [/^Extracting key terms.*/, 'Picking out key terms'], [/^Building layers.*/, 'Preparing voice notes'], [/^Compiling holograms/, 'Almost ready'], [/^Scan complete/, 'Ready']];
    sc.step = (label, p) => { let l = String(label); if (on()) for (const [re, t] of FRIENDLY) l = l.replace(re, t); return step(l, p); };
  }
  // phones: the mini textbook card starts hidden (▤ shows it); the Claude panel is a bar unless a Claude scene is open
  function holoLayout(entering) {
    if (!on()) return; const CX = window.ClaudeHolo, H = hs();
    const scene = !!(CX && CX.on), open = scene || document.body.classList.contains('m-cx-open') || !!(CX && CX.busy);
    document.body.classList.toggle('m-cx-collapsed', !open);
    const bar = q('#mCxBar'); if (bar) { bar.hidden = scene; bar.querySelector('b').textContent = open ? '⌄' : '›'; }
    if (entering && !holoLayout._cardSet && H) { holoLayout._cardSet = true; H.holoCardVisible = false; const mc = q('#mainCard'); if (mc) mc.hidden = true; }
    requestAnimationFrame(() => { const U = ui(); if (U && U.holoMain && U.holoMain.resize) U.holoMain.resize(); });
  }
  function updatePlay() {
    if (!mini) return; const P = pl(), b = q('#mpPlay');
    const playing = P && P.playing && !P.paused;
    b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? 'Pause' : 'Read this page aloud'); b.classList.toggle('on', !!playing);
  }
  function update() {
    if (!ready) return; const U = ui(), H = hs(); if (!H || !H.doc) return;
    const c = U.chapter(); if (!c) return;
    const total = H.doc.pageCount || Math.max(...H.doc.chapters.map((x) => x.endPage));
    q('#mTitle').textContent = `${c.n}. ${c.title}`;
    let sub = `${TAB[H.tab] || ''} · ${H.doc.title || ''}`;
    if (H.tab === 'read') sub = `${TAB.read} · page ${H.page} of ${total}`;
    else if (H.tab === 'listen' && pl()) { const list = pl().list(), mins = Math.round(list.reduce((a, x) => a + (x.words || 0), 0) / 150 / (H.settings.rate || 1)); sub = `${TAB.listen} · ${list.length - 1} notes · ~${mins} min · ${U.heardCount(c)} heard`; }
    q('#mSub').textContent = sub;
    const ko = q('#mKeyOnly'), aa = q('#mAutoAdv');
    if (ko) { ko.setAttribute('aria-pressed', String(!!H.settings.keyOnly)); aa.setAttribute('aria-pressed', String(!!H.settings.autoAdvance)); }
    q('#mpPage').textContent = `Page ${H.page} / ${total}`;
    const secs = c.sections || [], cur = [...secs].reverse().find((s) => s.page <= H.page);
    q('#mpSec').textContent = cur ? cur.title : `Chapter ${c.n}`;
    const sel = q('#mpJump'), key = c.n + ':' + secs.length;
    if (sel.dataset.k !== key) { sel.dataset.k = key; sel.innerHTML = `<option value="">Jump to section…</option>${secs.map((s) => `<option value="${s.page}">${s.title.replace(/[<>&]/g, '')} · p. ${s.page}</option>`).join('')}`; }
    document.body.classList.toggle('m-pdf', !!H.pdf);
    updatePlay();
  }
  function sheet(name) {
    document.body.classList.remove('m-ch', 'm-set');
    if (name && on()) document.body.classList.add(name);
    scrim.classList.toggle('on', !!(name && on()));
    if (name === 'm-ch') { const a = q('.ch-btn.active'); if (a) a.scrollIntoView({ block: 'center' }); }
  }
  function apply() {
    document.body.classList.toggle('m-ui', MQ.matches);
    document.body.classList.toggle('m-land', MQ.matches && LAND.matches);
    if (!MQ.matches) sheet(null);
    update();
    requestAnimationFrame(() => { const U = ui(); if (U && U.holoMain && U.holoMain.resize) U.holoMain.resize(); });
  }
  // Back: close a sheet first
  const prevBack = window.StudyBack;
  window.StudyBack = () => { if (document.body.classList.contains('m-ch') || document.body.classList.contains('m-set')) { sheet(null); return true; } return prevBack ? prevBack() : false; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet(null); });
  document.body.classList.toggle('m-ui', MQ.matches); // before first paint, no layout jump
  document.body.classList.toggle('m-land', MQ.matches && LAND.matches);
  LAND.addEventListener ? LAND.addEventListener('change', () => apply()) : LAND.addListener(() => apply());
  window.PhoneUI = { setup, update, sheet };

  const css = document.createElement('style');
  css.textContent = `
  #mBar, #mScrim, #mPlayer, #mCxBar, #mOpts { display: none; }
  /* ⋯ sheet: listening options */
  body.m-ui #mOpts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; grid-column: 1 / -1; padding-top: 4px; border-top: 1px solid var(--border); margin-top: 2px; }
  .mo-label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
  .m-opt { min-height: 38px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--card); color: var(--text-2); font-size: 13px; }
  .m-opt[aria-pressed="true"] { color: var(--text); border-color: var(--chrome); background: var(--chrome-soft); }
  .m-opt[aria-pressed="true"]::before { content: '✓ '; color: var(--chrome); }
  /* Listen on phones: just the player and the notes (title, stats and options are in the app bar / ⋯ sheet) */
  body.m-ui #pane-listen .lhead { display: none; }
  body.m-ui .now-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr) auto; column-gap: 10px; row-gap: 8px; align-items: center; }
  body.m-ui .now-card > .meta { display: contents; }
  body.m-ui .now-card .hud { grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.m-ui .now-card .vu { display: none; }
  body.m-ui .now-card #markHeard { grid-column: 2; grid-row: 1; min-height: 32px; padding: 3px 12px; font-size: 12.5px; border-radius: 999px; }
  body.m-ui .now-card .now-text { grid-column: 1 / -1; grid-row: 2; align-self: stretch; }
  body.m-ui .now-card .eyebrow { display: none; } /* the card's top line already says which section (e.g. 1.2) */
  body.m-ui #mCxBar:not([hidden]) { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 12px 16px; border-top: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 14px; flex-shrink: 0; text-align: left; }
  body.m-ui #mCxBar b { color: var(--chrome); font-size: 18px; }
  body.m-ui.m-cx-collapsed #cxPanel { display: none; }
  body.m-ui #cxPanel { max-height: 48%; }
  body.m-ui #pane-holo.active { display: flex; flex-direction: column; }
  body.m-ui .holo-stage { flex: 1 1 auto; min-height: 0; }
  body.m-ui .holo-toolbar { z-index: 6; }
  /* finger-sized targets */
  body.m-ui .btn.icon, body.m-ui .holo-toolbar .btn, body.m-ui .st-head .btn { min-width: 42px; min-height: 42px; }
  body.m-ui .transport .btn.icon { width: 44px; height: 44px; }
  body.m-ui .now-card .meta .btn.sm, body.m-ui #pRead { min-height: 38px; }
  body.m-ui .toggle { min-height: 38px; padding: 0 4px; }
  body.m-ui .toggle input { width: 20px; height: 20px; }
  body.m-ui #sideHandle { width: 26px; }
  body.m-ui .model-chips { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; padding-bottom: 2px; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); }
  body.m-ui .model-chips::-webkit-scrollbar { display: none; }
  body.m-ui .model-chips .chip { flex-shrink: 0; min-height: 36px; }
  body.m-ui .holo-toolbar { top: 92px; }
  body.m-ui .app { padding: 0 0 calc(62px + env(safe-area-inset-bottom)); gap: 0; }
  body.m-ui .main { gap: 0; }
  body.m-ui .stage { gap: 0; }
  /* app bar */
  body.m-ui #mBar { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; gap: 4px; padding: 6px 8px; background: var(--panel); border-bottom: 1px solid var(--border); flex-shrink: 0; position: relative; z-index: 5; }
  .mb-btn { width: 44px; height: 44px; border-radius: 12px; font-size: 20px; color: var(--text); display: grid; place-items: center; }
  .mb-btn:active, .mb-title:active { background: var(--card); }
  .mb-title { min-width: 0; text-align: center; padding: 2px 4px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; }
  .mb-title b { font-family: var(--font-display); font-size: 16px; color: var(--text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mb-title span { font-size: 11.5px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* the full header and chapter strip become sheets */
  body.m-ui .hdr, body.m-ui .rail-left { display: none; }
  body.m-ui #mScrim { display: block; position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.45); opacity: 0; pointer-events: none; transition: opacity .2s; }
  body.m-ui #mScrim.on { opacity: 1; pointer-events: auto; }
  body.m-ui.m-set .hdr { display: grid !important; position: fixed; left: 8px; right: 8px; top: 8px; z-index: 61; border-radius: 16px; box-shadow: 0 16px 40px rgba(0, 0, 0, .5); padding: 12px; animation: mDown .2s ease; }
  body.m-ui.m-ch .rail-left { display: flex !important; flex-direction: column; position: fixed; left: 0; top: 0; bottom: 0; width: min(84vw, 340px); max-height: none; z-index: 61; border-radius: 0 16px 16px 0; overflow-y: auto; overflow-x: hidden; padding: 12px 8px; gap: 2px; animation: mLeft .22s ease; }
  body.m-ui.m-ch .rail-left .rail-title { display: flex; }
  body.m-ui.m-ch .ch-btn { width: 100%; border-bottom: 0; border-left: 3px solid transparent; padding: 10px 10px; flex-shrink: 0; }
  body.m-ui.m-ch .ch-btn.active { border-left-color: var(--subject); }
  body.m-ui.m-ch .ch-btn .t { white-space: normal; display: -webkit-box; max-width: none; }
  @keyframes mDown { from { transform: translateY(-12px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes mLeft { from { transform: translateX(-30px); opacity: 0; } to { transform: none; opacity: 1; } }
  /* bottom tab bar */
  body.m-ui .tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; border-radius: 0; border: 0; border-top: 1px solid var(--border); padding: 4px 4px calc(4px + env(safe-area-inset-bottom)); background: var(--panel); }
  body.m-ui .tabs button.active { background: transparent; border-color: transparent; }
  body.m-ui .tabs button.active .ti { transform: translateY(-1px); }
  body.m-ui .pane { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
  /* Read: just the material + the floating control */
  body.m-ui:not(.m-pdf) #readerBar { display: none; }
  body.m-ui #pane-read .reader-view { padding-bottom: 96px; }
  body.m-ui #mPlayer { display: grid; grid-template-columns: 44px minmax(0, 1fr) 56px 44px; align-items: center; gap: 6px; position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
    width: min(420px, calc(100% - 24px)); padding: 6px; border-radius: 22px; background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--border-2);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); z-index: 30; }
  .mp-btn { width: 44px; height: 44px; border-radius: 14px; font-size: 24px; color: var(--text); display: grid; place-items: center; }
  .mp-btn:active { background: var(--card); }
  .mp-where { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
  .mp-where span { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
  .mp-where small { font-size: 11px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mp-where select { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .mp-play { width: 52px; height: 52px; border-radius: 50%; background: var(--subject); color: #0b0f1a; font-size: 20px; display: grid; place-items: center; justify-self: center; box-shadow: 0 0 20px rgba(var(--subject-rgb), .4); }
  .mp-play.on { box-shadow: 0 0 0 4px rgba(var(--subject-rgb), .25), 0 0 20px rgba(var(--subject-rgb), .5); }
  body.m-ui #sideHandle { top: 38%; }
  /* calm loading card */
  body.m-ui .scan-overlay { background: var(--bg); -webkit-backdrop-filter: none; backdrop-filter: none; }
  body.m-ui .scan-box { box-shadow: none; gap: 16px; padding: 22px 20px; }
  body.m-ui .scan-box h2 { font-size: 18px; }
  body.m-ui .scan-doc { display: none; }
  body.m-ui .scan-lines { max-height: none; min-height: 20px; }
  body.m-ui .scan-lines div { display: none; }
  body.m-ui .scan-lines div:last-child { display: block; font-family: var(--font-ui); font-size: 13.5px; color: var(--text-2); }
  body.m-ui .scan-lines div::before { content: none; }
  body.m-ui #scanCancel { align-self: center !important; }
  /* ── landscape phones: same shell, the tabs become a slim rail on the left, one-line app bar ── */
  body.m-ui.m-land .app { padding: 0 0 0 calc(64px + env(safe-area-inset-left)); }
  body.m-ui.m-land #mBar { grid-template-columns: 40px minmax(0, 1fr) 40px; padding: 3px 8px; }
  body.m-ui.m-land .mb-btn { width: 40px; height: 36px; font-size: 18px; }
  body.m-ui.m-land .mb-title { flex-direction: row; justify-content: center; align-items: baseline; gap: 10px; }
  body.m-ui.m-land .mb-title b { font-size: 15px; flex: 0 1 auto; min-width: 0; }
  body.m-ui.m-land .mb-title span { flex: 0 0 auto; }
  body.m-ui.m-land .tabs { top: 0; bottom: 0; left: 0; right: auto; width: calc(64px + env(safe-area-inset-left)); display: grid; grid-template-columns: 1fr; grid-auto-rows: minmax(0, 1fr);
    padding: 4px 4px 4px calc(4px + env(safe-area-inset-left)); border-top: 0; border-right: 1px solid var(--border); gap: 2px; }
  body.m-ui.m-land .tabs button { flex-direction: column; gap: 1px; padding: 2px; font-size: 10px; line-height: 1.1; min-height: 0; position: relative; }
  body.m-ui.m-land .tabs button .ti { font-size: 16px; }
  body.m-ui.m-land .tabs button .k { display: none; }
  body.m-ui.m-land .tabs button.active { background: var(--chrome-soft); border-color: transparent; }
  body.m-ui.m-land .tabs .cnt { position: absolute; top: 1px; right: 2px; font-size: 9px; padding: 0 4px; }
  body.m-ui.m-land #pane-read .reader-view { padding-bottom: 76px; }
  body.m-ui.m-land .listen { flex-direction: row; }
  body.m-ui.m-land .notes-list { width: 42%; max-width: 380px; padding: 4px 8px; gap: 0; }
  body.m-ui.m-land .sec-notes { padding-left: 14px; margin-left: 10px; }
  body.m-ui.m-land .note-btn { padding: 6px 6px; font-size: 12.5px; }
  body.m-ui.m-land .note-btn .t { -webkit-line-clamp: 1; }
  body.m-ui.m-land .notes-list .sec-label { padding: 8px 6px 2px; font-size: 9.5px; }
  body.m-ui.m-land .listen .player { padding: 8px 12px 8px; gap: 8px; }
  body.m-ui.m-land .now-card { padding: 10px 14px; flex: 1 1 auto; min-height: 0; }
  body.m-ui.m-land .now-card .eyebrow { display: none; }
  body.m-ui.m-land .now-text { font-size: 16px; line-height: 1.5; }
  body.m-ui.m-land .transport { gap: 6px; }
  body.m-ui.m-land .transport .btn.icon { width: 42px; height: 42px; min-height: 42px; }
  body.m-ui.m-land .transport .big { width: 46px; height: 46px; }
  body.m-ui.m-land #mPlayer { bottom: 8px; padding: 4px; width: min(420px, calc(100% - 24px)); grid-template-columns: 40px minmax(0, 1fr) 46px 40px; }
  body.m-ui.m-land .mp-play { width: 44px; height: 44px; font-size: 17px; }
  body.m-ui.m-land .mp-btn { width: 40px; height: 40px; }
  body.m-ui.m-land #mCxBar:not([hidden]) { padding: 8px 14px; }
  body.m-ui.m-land .holo-toolbar { top: 56px; }
  body.m-ui.m-land .holo-bottom { right: 64px; } /* the mini textbook never covers the side buttons */
  body.m-ui.m-land #mainCard { max-height: 78%; }
  body.m-ui.m-land #pane-holo .cx-panel { width: auto; border-left: 0; border-top: 1px solid var(--border); max-height: 55%; }
  body.m-ui.m-land.m-set .hdr { max-width: 640px; margin: 0 auto; }
  body.m-ui.m-land.m-ch .rail-left { left: calc(64px + env(safe-area-inset-left)); width: min(60vw, 340px); border-radius: 0 16px 16px 0; }
  @media (prefers-reduced-motion: reduce) { body.m-ui.m-set .hdr, body.m-ui.m-ch .rail-left { animation: none; } }
  `;
  document.head.appendChild(css);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
