/* Read tab on phones (portrait): the study tools beside the page — mini hologram, re-read, page note,
   key terms, mini textbook — move into a drawer on the LEFT edge, so the page text gets the whole screen.
   Drag the handle (or swipe from the left edge) to pull it out, drag/swipe left or tap outside to put
   it back. Inside, the tools are shown ONE AT A TIME (‹ › or the dots); steps with nothing to show on
   this page are skipped. Larger screens keep the side-by-side layout. Back closes the drawer first. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  // study.html's UI / HS are top-level consts (not window properties): reach them by name
  const ui = () => (typeof UI !== 'undefined' ? UI : null), hs = () => (typeof HS !== 'undefined' ? HS : null);
  const MQ = matchMedia('(max-width: 860px) and (min-height: 561px)');
  const STEPS = [
    { id: 'holo', label: 'Hologram', icon: '◎', has: () => true },
    { id: 'reread', label: 'Re-read', icon: '↻', has: () => !!$('#reread') },
    { id: 'note', label: 'Page note', icon: '✎', has: () => !!$('#pageNote') },
    { id: 'terms', label: 'Key terms', icon: '🏷', has: () => !!($('#pageTerms') && $('#pageTerms').textContent.trim()) },
    { id: 'card', label: 'Mini textbook', icon: '▤', has: () => !!($('#miniCard') && $('#miniCard').textContent.trim()) },
  ];
  let side, handle, scrim, body, step = 'holo', open = false, ready = false;
  try { step = localStorage.getItem('hs.sidetools.step') || 'holo'; } catch (e) { /* private mode */ }

  function setup() {
    side = $('.holo-side'); if (!side || ready) return; ready = true;
    const read = side.parentElement; // .read
    // wrap the existing tool blocks (ids stay the same, so the app keeps updating them)
    body = document.createElement('div'); body.className = 'st-body';
    while (side.firstChild) body.appendChild(side.firstChild);
    side.innerHTML = `<div class="st-head"><button class="btn sm icon" data-st="prev" aria-label="Previous tool">‹</button>
      <div class="st-title"><b id="stTitle"></b><span id="stDots" class="st-dots"></span></div>
      <button class="btn sm icon" data-st="next" aria-label="Next tool">›</button><button class="btn sm icon ghost" data-st="close" aria-label="Close tools">✕</button></div>`;
    side.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'st-foot'; foot.innerHTML = '<button class="btn sm" data-st="next" id="stNext"></button>'; side.appendChild(foot);
    side.id = side.id || 'sideTools'; side.setAttribute('aria-label', 'Study tools');
    handle = document.createElement('button'); handle.id = 'sideHandle'; handle.setAttribute('aria-label', 'Open study tools'); handle.innerHTML = '<span class="ic"></span><span class="tx">Tools</span><span class="ar">›</span>';
    scrim = document.createElement('div'); scrim.id = 'sideScrim';
    read.appendChild(scrim); read.appendChild(handle);
    side.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]'); if (b) { const a = b.dataset.st; if (a === 'close') toggle(false); else go(a === 'next' ? 1 : -1); return; }
      const d = e.target.closest('[data-dot]'); if (d) show(d.dataset.dot);
    });
    handle.addEventListener('click', () => { if (!handle._dragged) toggle(true); });
    scrim.addEventListener('click', () => toggle(false));
    drag(handle, true); drag(side, false);
    MQ.addEventListener ? MQ.addEventListener('change', apply) : MQ.addListener(apply);
    // tapping a key term in the text opens its mini-textbook card: on phones, bring the drawer out at that card
    const U = ui(); if (U && U.popTerm && !U.popTerm._st) {
      const pop = U.popTerm.bind(U);
      U.popTerm = (t, target = 'mini', o = {}) => { const r = pop(t, target, o); if (target === 'mini' && !o.quiet && document.body.classList.contains('st-mode') && hs() && hs().tab === 'read') { if (!open) toggle(true); show('card'); } return r; };
      U.popTerm._st = true;
    }
    apply();
  }
  const available = () => STEPS.filter((s) => s.has());
  function show(id) {
    const list = available(); if (!list.some((s) => s.id === id)) id = list[0].id;
    step = id; try { localStorage.setItem('hs.sidetools.step', id); } catch (e) { /* ok */ }
    side.dataset.step = id;
    const s = STEPS.find((x) => x.id === id), i = list.indexOf(s);
    $('#stTitle').textContent = `${s.icon}  ${s.label}`;
    $('#stDots').innerHTML = list.map((x) => `<button class="${x.id === id ? 'on' : ''}" data-dot="${x.id}" aria-label="${x.label}" title="${x.label}"></button>`).join('') + `<i>${i + 1}/${list.length}</i>`;
    handle.querySelector('.ic').textContent = s.icon;
    const nx = list[(i + 1) % list.length]; $('#stNext').textContent = i + 1 < list.length ? `Next: ${nx.icon} ${nx.label}  ›` : `Back to ${nx.icon} ${nx.label}  ›`;
    body.scrollTop = 0;
    if (id === 'holo') resizeHolo();
  }
  function go(d) { const list = available(), i = list.findIndex((s) => s.id === step); show(list[(i + d + list.length) % list.length].id); }
  function resizeHolo() { requestAnimationFrame(() => { const v = ui() && ui().holoMini; if (v) { if (v.resize) v.resize(); if (open && v.start) v.start(); } }); }
  function toggle(on) {
    if (!document.body.classList.contains('st-mode')) return;
    open = on; side.classList.toggle('open', on); scrim.classList.toggle('on', on); handle.classList.toggle('away', on);
    side.style.transform = ''; scrim.style.opacity = '';
    if (on) { show(step); } else { const v = ui() && ui().holoMini; if (v && v.stop && hs() && hs().tab === 'read') v.stop(); }
  }
  // phones in portrait → drawer; anything bigger → the original side-by-side panel
  function apply() {
    const on = MQ.matches; document.body.classList.toggle('st-mode', on);
    if (!on) { open = false; side.classList.remove('open'); scrim.classList.remove('on'); handle.classList.remove('away'); side.style.transform = ''; const v = ui() && ui().holoMini; if (v && v.resize) requestAnimationFrame(() => v.resize()); }
    else show(step);
  }
  // drag: from the handle to pull out, on the drawer to push back (horizontal moves only, so scrolling still works)
  function drag(el, fromHandle) {
    let x0 = null, y0 = 0, dx = 0, horiz = null, w = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!document.body.classList.contains('st-mode') || (!fromHandle && !open) || e.target.closest('button,input,textarea,select,canvas,a')) { if (!fromHandle) return; }
      if (!fromHandle && e.target.closest('canvas')) return; // the mini hologram uses drag to rotate
      x0 = e.clientX; y0 = e.clientY; dx = 0; horiz = null; w = side.getBoundingClientRect().width; handle._dragged = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0; const dy = e.clientY - y0;
      if (horiz == null && Math.hypot(dx, dy) > 8) horiz = Math.abs(dx) > Math.abs(dy);
      if (!horiz) return;
      handle._dragged = true; side.classList.add('dragging');
      const pos = fromHandle ? Math.min(0, -w + Math.max(0, dx)) : Math.min(0, dx);
      side.style.transform = `translateX(${pos}px)`; scrim.classList.add('on'); scrim.style.opacity = String(1 + pos / w);
      if (fromHandle && !side.classList.contains('open')) { side.classList.add('peek'); show(step); }
    }, { passive: true });
    const end = () => {
      if (x0 == null) return; side.classList.remove('dragging', 'peek');
      if (horiz) toggle(fromHandle ? dx > w * 0.3 : !(dx < -w * 0.3)); else { side.style.transform = ''; scrim.style.opacity = ''; }
      x0 = null; setTimeout(() => { handle._dragged = false; }, 0);
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  // Back (Android, via the hub) and Esc close the drawer before anything else
  const prevBack = window.StudyBack;
  window.StudyBack = () => { if (open) { toggle(false); return true; } return prevBack ? prevBack() : false; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  // keep the steps in sync when the page changes (new terms / card / note)
  const sync = () => { if (ready && document.body.classList.contains('st-mode')) show(step); };
  window.SideTools = { setup, toggle, show, sync, get open() { return open; } };

  const css = document.createElement('style');
  css.textContent = `
  .st-head, .st-foot { display: none; }
  .st-body { display: contents; }
  #sideHandle, #sideScrim { display: none; }
  body.st-mode .read { position: relative; }
  body.st-mode .holo-side { position: absolute; z-index: 40; left: 0; top: 0; bottom: 0; width: min(88%, 380px); max-height: none; margin: 0;
    border: 0; border-right: 1px solid var(--border-2); background: var(--panel); box-shadow: 10px 0 30px rgba(0, 0, 0, 0.45);
    transform: translateX(-104%); transition: transform 0.26s cubic-bezier(.2, .8, .2, 1); display: flex; flex-direction: column; overflow: hidden; }
  body.st-mode .holo-side.open { transform: none; }
  body.st-mode .holo-side.dragging { transition: none; }
  body.st-mode .st-head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  body.st-mode .st-title { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  body.st-mode .st-title b { font-family: var(--font-display); font-size: 16px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .st-dots { display: flex; align-items: center; gap: 6px; }
  .st-dots button { width: 7px; height: 7px; border-radius: 50%; background: var(--border-2); padding: 0; }
  .st-dots button.on { background: var(--chrome); width: 16px; border-radius: 4px; }
  .st-dots i { font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-left: 4px; }
  body.st-mode .st-body { display: block; flex: 1; min-height: 0; overflow-y: auto; }
  body.st-mode .st-foot { display: block; padding: 10px 12px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
  body.st-mode .st-foot .btn { width: 100%; justify-content: center; min-height: 40px; }
  body.st-mode .reader-view { padding-left: 26px; } /* room for the Tools tab on the left edge */
  body.st-mode .holo-side[data-step] .st-body > * { display: none; }
  body.st-mode .holo-side[data-step="holo"] .st-body > .holo-mini-wrap,
  body.st-mode .holo-side[data-step="reread"] .st-body > #pageTools,
  body.st-mode .holo-side[data-step="note"] .st-body > #pageTools,
  body.st-mode .holo-side[data-step="terms"] .st-body > #pageTerms,
  body.st-mode .holo-side[data-step="card"] .st-body > #miniCard { display: block; animation: stIn .22s ease; }
  body.st-mode .holo-side[data-step="reread"] #pageNote, body.st-mode .holo-side[data-step="note"] #reread { display: none; }
  body.st-mode .holo-side[data-step] #pageTools { border-bottom: 0; }
  body.st-mode .holo-mini-wrap canvas { aspect-ratio: 1 / 0.95; }
  body.st-mode .holo-side .reread .txt { max-height: 38vh; }
  @keyframes stIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
  body.st-mode #sideScrim { display: block; position: absolute; inset: 0; z-index: 39; background: rgba(0, 0, 0, 0.42); opacity: 0; pointer-events: none; transition: opacity .2s; }
  body.st-mode #sideScrim.on { opacity: 1; pointer-events: auto; }
  body.st-mode #sideHandle { display: flex; flex-direction: column; align-items: center; gap: 6px; position: absolute; left: 0; top: 42%; z-index: 38;
    padding: 10px 3px 8px 2px; width: 22px; border-radius: 0 10px 10px 0; background: var(--card-2); border: 1px solid var(--border-2); border-left: 0;
    color: var(--text); box-shadow: 4px 0 14px rgba(0, 0, 0, 0.35); touch-action: none; transition: opacity .2s, transform .2s; }
  body.st-mode #sideHandle .ic { font-size: 13px; line-height: 1; }
  body.st-mode #sideHandle .tx { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); }
  body.st-mode #sideHandle .ar { color: var(--chrome); font-size: 14px; line-height: 1; }
  body.st-mode #sideHandle.away { opacity: 0; pointer-events: none; transform: translateX(-100%); }
  @media (prefers-reduced-motion: reduce) { body.st-mode .holo-side, body.st-mode #sideScrim { transition: none; } .st-body > * { animation: none !important; } }
  `;
  document.head.appendChild(css);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
