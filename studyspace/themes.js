/* Study-space themes — ten black-and-white themes as plain token sets.
   Every theme is one swap of the same CSS custom properties:
     --bg --surface --surface-2 --text --muted --accent --accent-2 --border --on-accent
   Max two accents per theme (accent, accent-2); everything else is neutral grey.
   Contrast modes (soft / standard / high) are derived from the base tokens and are
   guaranteed to keep text >= 4.5:1 (WCAG AA) against every surface — see resolve(). */
(function (root) {
  'use strict';

  // ---------- colour maths (sRGB, WCAG 2.x relative luminance) ----------
  function hexToRgb(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  function channel(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function luminance(c) { const [r, g, b] = Array.isArray(c) ? c : hexToRgb(c); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); }
  function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
  // composite a translucent white/black glass tint over a solid colour
  function over(base, tintHex, alpha) { return mix(base, tintHex, alpha); }

  // ---------- the ten themes ----------
  // `surfaces` lists every colour text can sit on (solid, or glass composited over the
  // darkest/lightest point of the background) — the contrast guard checks against all of them.
  const THEMES = [
    {
      id: 'carbon', name: 'Carbon Fiber Black', dark: true,
      note: 'Woven micro-texture, silver-grey type, faint diagonal sheen.',
      t: { bg: '#0A0A0B', surface: '#131315', surface2: '#1B1C1F', text: '#C9CCD1', muted: '#8E939B', accent: '#E4E7EB', accent2: '#7D838C', border: '#2A2C30', onAccent: '#0A0A0B' },
      art: { kind: 'css', layers: [
        'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.035) 47%, rgba(255,255,255,.05) 50%, transparent 66%)',
        'repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 4px)',
        'repeating-linear-gradient(-45deg, rgba(0,0,0,.45) 0 2px, transparent 2px 4px)'
      ], size: 'auto, 6px 6px, 6px 6px' },
    },
    {
      id: 'rich', name: 'Rich Black', dark: true,
      note: 'Pure black, warm off-white type, amber-tinted grey accents.',
      t: { bg: '#000000', surface: '#0D0C0B', surface2: '#161412', text: '#F2EFE9', muted: '#A8A196', accent: '#D8BC94', accent2: '#8A8176', border: '#27231F', onAccent: '#000000' },
      art: null,
    },
    {
      id: 'ink', name: 'Ink Wash', dark: true, divider: 'brush',
      note: 'Soft charcoal with a hand-painted white ink-wash landscape.',
      t: { bg: '#1C1E22', surface: '#23262B', surface2: '#2B2F35', text: '#EDEDEA', muted: '#AEB2B8', accent: '#F5F5F1', accent2: '#8C929B', border: '#3A3E45', onAccent: '#1C1E22' },
      art: { kind: 'gen', gen: 'inkLandscape', opacity: 0.16, position: 'center bottom', size: 'cover' },
    },
    {
      id: 'paper', name: 'Paper White', dark: false,
      note: 'Bright white, graphite type, hairline borders — a printed workbook.',
      t: { bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F6F6F4', text: '#111113', muted: '#55575C', accent: '#111113', accent2: '#8B8E94', border: '#E2E2DF', onAccent: '#FFFFFF' },
      art: null, flat: true,
    },
    {
      id: 'slate', name: 'Slate Monochrome', dark: true,
      note: 'Mid-grey surfaces on near-black, cool blue-grey highlights.',
      t: { bg: '#17191C', surface: '#3A3F44', surface2: '#444A50', text: '#F1F3F5', muted: '#C9D0D7', accent: '#B4CAE0', accent2: '#7E8C99', border: '#4E555C', onAccent: '#17191C' },
      art: null,
    },
    {
      id: 'blueprint', name: 'Blueprint Inverse', dark: true,
      note: 'Black with fine white grid lines and pale-blue technical line art.',
      t: { bg: '#000000', surface: '#090B0F', surface2: '#10141A', text: '#EEF2F7', muted: '#A3AEBC', accent: '#BCCDE6', accent2: '#6F8098', border: '#232A34', onAccent: '#000000' },
      art: { kind: 'css+gen', gen: 'blueprintArt', opacity: 0.22, position: 'right bottom', size: 'min(720px, 90vw) auto',
        layers: [
          'linear-gradient(rgba(255,255,255,.075) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(255,255,255,.075) 1px, transparent 1px)',
          'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)'
        ], layerSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px' },
    },
    {
      id: 'chalk', name: 'Chalkboard', dark: true, handwritten: true,
      note: 'Matte green-black with chalk-dust texture; handwritten headings optional.',
      t: { bg: '#101613', surface: '#16201B', surface2: '#1C2822', text: '#ECEFEA', muted: '#AAB5AE', accent: '#F2F0E6', accent2: '#8FA396', border: '#2B3931', onAccent: '#101613' },
      art: { kind: 'gen', gen: 'chalkDust', opacity: 0.55, position: 'center', size: 'cover' },
    },
    {
      id: 'marble', name: 'Marble Grey', dark: false, headingFont: '"Source Serif 4", Georgia, "Gelasio", serif',
      note: 'White with soft grey marble veining and elegant serif headings.',
      t: { bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F4F4F3', text: '#16171A', muted: '#54565C', accent: '#2A2C30', accent2: '#8D9096', border: '#E1E1DF', onAccent: '#FFFFFF' },
      // darkest vein, composited, is still very light; listed so the guard checks text over it
      extraSurfaces: ['#E9E9E8'],
      art: { kind: 'gen', gen: 'marble', opacity: 0.7, position: 'center', size: 'cover' },
    },
    {
      id: 'graphite', name: 'Graphite Gradient', dark: true, glass: true,
      note: 'Smooth vertical gradient, glassmorphism cards, no hard edges.',
      t: { bg: '#101114', surface: 'glass', surface2: 'glass2', text: '#ECEEF1', muted: '#AAB0B9', accent: '#D9DEE5', accent2: '#8E96A1', border: 'rgba(255,255,255,.10)', onAccent: '#101114' },
      bgGradient: 'linear-gradient(180deg, #101114 0%, #2A2D33 100%)',
      gradientEnd: '#2A2D33',
      art: null,
    },
    {
      id: 'duotone', name: 'Duotone Sketch', dark: false,
      note: 'White with black line doodles (books, lamps, plants) and one 20% grey.',
      t: { bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F5F5F5', text: '#0B0B0B', muted: '#555555', accent: '#0B0B0B', accent2: '#CCCCCC', border: '#CCCCCC', onAccent: '#FFFFFF' },
      art: { kind: 'gen', gen: 'doodles', opacity: 0.5, position: 'center', size: 'cover' },
    },
  ];

  // ---------- resolve a theme + contrast mode into final tokens ----------
  const AA = 4.5, BODY_TARGET = 7; // body text aims for AAA 7:1 where the theme allows; never below AA

  function glassColors(theme) {
    // glass surfaces are translucent white over the gradient: judge them over its lightest end
    const end = theme.gradientEnd || theme.t.bg;
    return { surface: over(end, '#FFFFFF', 0.06), surface2: over(end, '#FFFFFF', 0.10) };
  }

  function surfacesOf(theme, tok) {
    const list = [tok.bg, tok.surfaceSolid, tok.surface2Solid];
    if (theme.gradientEnd) list.push(theme.gradientEnd);
    (theme.extraSurfaces || []).forEach((c) => list.push(c));
    return list;
  }
  const worst = (fg, surfaces) => Math.min(...surfaces.map((s) => contrast(fg, s)));

  // push `fg` toward `goal` in small steps until it clears `min` against every surface
  function ensure(fg, surfaces, min, goal) {
    let c = fg, t = 0;
    while (worst(c, surfaces) < min && t < 1) { t += 0.04; c = mix(fg, goal, t); }
    return c;
  }
  // soften `fg` toward `bg` as far as possible (up to maxT) while keeping >= min
  function soften(fg, bg, surfaces, min, maxT) {
    let best = fg;
    for (let t = 0.02; t <= maxT + 1e-9; t += 0.02) {
      const c = mix(fg, bg, t);
      if (worst(c, surfaces) >= min) best = c; else break;
    }
    return best;
  }

  function resolve(themeId, mode) {
    const theme = THEMES.find((x) => x.id === themeId) || THEMES[0];
    const b = theme.t;
    const glass = theme.glass ? glassColors(theme) : null;
    const tok = {
      bg: b.bg,
      surfaceSolid: glass ? glass.surface : b.surface,
      surface2Solid: glass ? glass.surface2 : b.surface2,
      text: b.text, muted: b.muted, accent: b.accent, accent2: b.accent2,
      border: b.border, onAccent: b.onAccent,
    };
    const surfaces = surfacesOf(theme, tok);
    const extreme = theme.dark ? '#FFFFFF' : '#000000';

    if (mode === 'soft') {
      tok.text = soften(b.text, b.bg, surfaces, BODY_TARGET, 0.3);
      tok.muted = soften(b.muted, b.bg, surfaces, AA + 0.1, 0.25);
      if (!b.border.startsWith('rgba')) tok.border = mix(b.border, b.bg, 0.35);
    } else if (mode === 'high') {
      tok.text = extreme;
      tok.muted = mix(b.muted, extreme, 0.45);
      tok.accent = ensure(b.accent, surfaces, BODY_TARGET, extreme);
      if (!b.border.startsWith('rgba')) tok.border = mix(b.border, extreme, 0.3);
    }
    // safety net for every mode: nothing that renders as text may drop below AA
    tok.text = ensure(tok.text, surfaces, AA, extreme);
    tok.muted = ensure(tok.muted, surfaces, AA, extreme);
    tok.accent = ensure(tok.accent, surfaces, AA, extreme);
    if (contrast(tok.onAccent, tok.accent) < AA) tok.onAccent = theme.dark ? '#000000' : '#FFFFFF';

    // CSS values (glass themes keep translucent surfaces for the frosted look)
    tok.surface = glass ? 'rgba(255,255,255,.06)' : tok.surfaceSolid;
    tok.surface2 = glass ? 'rgba(255,255,255,.10)' : tok.surface2Solid;
    tok.report = {
      text: +worst(tok.text, surfaces).toFixed(2),
      muted: +worst(tok.muted, surfaces).toFixed(2),
      accent: +worst(tok.accent, surfaces).toFixed(2),
      onAccent: +contrast(tok.onAccent, tok.accent).toFixed(2),
    };
    return { theme, tok, surfaces };
  }

  const api = { THEMES, resolve, contrast, luminance, mix, hexToRgb, toHex, AA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SSThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
