/* =====================================================================
   NEET Holo-Diagram Room  —  holo.js
   Three.js r128 (cdnjs) · no build · no storage APIs
   Sections
     0  utils
     1  H   geometry / material toolkit (cached + disposable)
     2  registry
     3  figures — Biology class 11
     4  figures — Biology class 12
     5  figures — Chemistry
     6  figures — Physics
     7  app: scene, projector, orbit, margin labels, Maps-style UI
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------- 0. utils */
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const PI = Math.PI, TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
const deg = d => d * PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const vec = p => (p instanceof THREE.Vector3) ? p : V3(p[0], p[1], p[2]);

/* colour palette used across figures */
const C = {
  mem: '#7dd3fc', mem2: '#38bdf8', cyto: '#164e63', nuc: '#a78bfa', dna: '#f472b6', dna2: '#60a5fa',
  prot: '#fbbf24', lipid: '#22d3ee', xy: '#f87171', ph: '#60a5fa', green: '#4ade80', leaf: '#22c55e',
  dgreen: '#15803d', orange: '#fb923c', red: '#ef4444', blue: '#3b82f6', yellow: '#facc15',
  white: '#e5e7eb', grey: '#9ca3af', dgrey: '#4b5563', pink: '#f9a8d4', purple: '#c084fc',
  teal: '#2dd4bf', bone: '#f1e9c9', muscle: '#dc2626', blood: '#ef4444', vein: '#3b82f6',
  cyan: '#22d3ee', amber: '#f59e0b', lime: '#a3e635', brown: '#a16207', skin: '#fcd5b5', ink: '#0f172a'
};

/* ------------------------------------------------ 1. H  toolkit */
const H = (() => {
  const mats = new Map(), geos = new Map();
  let temp = [];                     // per-figure disposables

  function mat(color, o = {}) {
    const op = o.op ?? 1;
    const key = [color, op, o.side ?? 0, o.e ?? 0.2, o.wire ? 1 : 0, o.flat ? 1 : 0, o.dw ?? '', o.shine ?? 40].join('|');
    let m = mats.get(key);
    if (!m) {
      const c = new THREE.Color(color);
      m = new THREE.MeshPhongMaterial({
        color: c, emissive: c.clone().multiplyScalar(o.e ?? 0.2), shininess: o.shine ?? 40,
        specular: new THREE.Color(0x333333), transparent: op < 1, opacity: op,
        side: o.side ?? THREE.FrontSide, wireframe: !!o.wire, flatShading: !!o.flat,
        depthWrite: o.dw ?? (op >= 0.6)
      });
      mats.set(key, m);
    }
    return m;
  }
  function lineMat(color, o = {}) {
    const key = 'L|' + color + '|' + (o.dashed ? 1 : 0) + '|' + (o.op ?? 1);
    let m = mats.get(key);
    if (!m) {
      m = o.dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: o.dash ?? 0.12, gapSize: o.gap ?? 0.08, transparent: (o.op ?? 1) < 1, opacity: o.op ?? 1 })
        : new THREE.LineBasicMaterial({ color, transparent: (o.op ?? 1) < 1, opacity: o.op ?? 1 });
      mats.set(key, m);
    }
    return m;
  }
  function geo(key, make) {
    let g = geos.get(key);
    if (!g) { g = make(); g.userData.shared = true; geos.set(key, g); }
    return g;
  }
  function tmp(g) { temp.push(g); return g; }

  function place(m, pos, rot, o) {
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (o && (o.sx || o.sy || o.sz)) m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o && o.name) m.name = o.name;
    return m;
  }
  function mesh(g, color, pos, rot, o = {}) { return place(new THREE.Mesh(g, mat(color, o)), pos, rot, o); }

  const api = {
    begin() { temp = []; },
    disposeTemp() { temp.forEach(t => t.dispose && t.dispose()); temp = []; },
    mat, lineMat, rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; },

    /* primitives (geometry cached by parameters, shared across figures) */
    sphere(r, color, pos, o = {}) {
      const seg = o.seg ?? (r < 0.08 ? 10 : 24), hs = Math.max(6, Math.round(seg * 0.66));
      const g = geo(`sp|${r}|${seg}|${o.phi ?? ''}|${o.theta ?? ''}`, () =>
        new THREE.SphereGeometry(r, seg, hs, o.phiStart ?? 0, o.phi ?? TAU, o.thetaStart ?? 0, o.theta ?? PI));
      return mesh(g, color, pos, o.rot, o);
    },
    ell(rx, ry, rz, color, pos, o = {}) { return api.sphere(1, color, pos, Object.assign({}, o, { sx: rx, sy: ry, sz: rz })); },
    cyl(rt, rb, h, color, pos, rot, o = {}) {
      const seg = o.seg ?? 24;
      const g = geo(`cy|${rt}|${rb}|${h}|${seg}|${o.open ? 1 : 0}|${o.arc ?? ''}`, () =>
        new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open, 0, o.arc ?? TAU));
      return mesh(g, color, pos, rot, o);
    },
    rod(a, b, r, color, o = {}) {
      a = vec(a); b = vec(b);
      const d = b.clone().sub(a), len = d.length();
      const m = api.cyl(r, r, 1, color, null, null, Object.assign({ seg: o.seg ?? 12 }, o));
      m.scale.set(1, len, 1);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
      if (o.name) m.name = o.name;
      return m;
    },
    cone(r, h, color, pos, rot, o = {}) {
      const seg = o.seg ?? 20;
      const g = geo(`co|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
      return mesh(g, color, pos, rot, o);
    },
    box(w, h, d, color, pos, rot, o = {}) {
      const g = geo(`bx|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
      return mesh(g, color, pos, rot, o);
    },
    torus(R, r, color, pos, rot, o = {}) {
      const g = geo(`to|${R}|${r}|${o.seg ?? 12}|${o.tseg ?? 48}|${o.arc ?? ''}`, () =>
        new THREE.TorusGeometry(R, r, o.seg ?? 12, o.tseg ?? 48, o.arc ?? TAU));
      return mesh(g, color, pos, rot, o);
    },
    tube(pts, r, color, o = {}) {
      const curve = new THREE.CatmullRomCurve3(pts.map(vec), !!o.closed, o.type ?? 'catmullrom', o.tension ?? 0.5);
      const g = tmp(new THREE.TubeGeometry(curve, o.seg ?? Math.max(8, pts.length * 6), r, o.rseg ?? 8, !!o.closed));
      const m = mesh(g, color, o.pos, o.rot, o); m.userData.curve = curve; return m;
    },
    lathe(profile, color, pos, rot, o = {}) {
      const g = tmp(new THREE.LatheGeometry(profile.map(p => V2(p[0], p[1])), o.seg ?? 32, o.phiStart ?? 0, o.phiLen ?? TAU));
      return mesh(g, color, pos, rot, Object.assign({ side: o.phiLen ? THREE.DoubleSide : (o.side ?? THREE.FrontSide) }, o));
    },
    capsule(r, len, color, pos, rot, o = {}) {      // Cylinder + hemispheres via lathe (no CapsuleGeometry in r128)
      const prof = [];
      for (let i = 0; i <= 8; i++) { const a = -PI / 2 + (i / 8) * PI / 2; prof.push([r * Math.cos(a), -len / 2 + r * Math.sin(a)]); }
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI / 2; prof.push([r * Math.cos(a), len / 2 + r * Math.sin(a)]); }
      return api.lathe(prof, color, pos, rot, Object.assign({ seg: o.seg ?? 20 }, o));
    },
    disc(r, color, pos, rot, o = {}) {
      const g = geo(`di|${r}|${o.seg ?? 32}`, () => new THREE.CircleGeometry(r, o.seg ?? 32));
      return mesh(g, color, pos, rot, Object.assign({ side: THREE.DoubleSide }, o));
    },
    ring(ri, ro, color, pos, rot, o = {}) {
      const g = geo(`ri|${ri}|${ro}|${o.seg ?? 40}`, () => new THREE.RingGeometry(ri, ro, o.seg ?? 40));
      return mesh(g, color, pos, rot, Object.assign({ side: THREE.DoubleSide }, o));
    },
    plane(w, h, color, pos, rot, o = {}) {
      const g = geo(`pl|${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
      return mesh(g, color, pos, rot, Object.assign({ side: THREE.DoubleSide }, o));
    },
    annulus(rOut, rIn, h, color, pos, o = {}) {     // thick ring (T.S. tissue layer)
      if (rIn <= 0.001) return api.cyl(rOut, rOut, h, color, pos, null, o);
      return api.lathe([[rIn, -h / 2], [rOut, -h / 2], [rOut, h / 2], [rIn, h / 2], [rIn, -h / 2]], color, pos, null, Object.assign({ seg: o.seg ?? 48 }, o));
    },
    extrude(pts2, depth, color, pos, rot, o = {}) {
      const sh = new THREE.Shape(pts2.map(p => V2(p[0], p[1])));
      if (o.holes) o.holes.forEach(hp => { const p = new THREE.Path(hp.map(q => V2(q[0], q[1]))); sh.holes.push(p); });
      const g = tmp(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: o.cseg ?? 12 }));
      g.translate(0, 0, -depth / 2);
      return mesh(g, color, pos, rot, o);
    },
    icosa(r, color, pos, o = {}) {
      const g = geo(`ic|${r}|${o.detail ?? 0}`, () => new THREE.IcosahedronGeometry(r, o.detail ?? 0));
      return mesh(g, color, pos, o.rot, Object.assign({ flat: true }, o));
    },
    line(pts, color, o = {}) {
      const g = tmp(new THREE.BufferGeometry().setFromPoints(pts.map(vec)));
      const l = o.loop ? new THREE.LineLoop(g, lineMat(color, o)) : new THREE.Line(g, lineMat(color, o));
      if (o.dashed) l.computeLineDistances();
      return l;
    },
    arrow(a, b, color, o = {}) {
      a = vec(a); b = vec(b);
      const d = b.clone().sub(a), len = d.length(), dir = d.clone().normalize();
      const hl = Math.min(o.head ?? 0.22, len * 0.5), r = o.r ?? 0.03;
      const g = new THREE.Group();
      g.add(api.rod(a, a.clone().add(dir.clone().multiplyScalar(len - hl)), r, color, o));
      const c = api.cone(o.hr ?? r * 3, hl, color, null, null, { seg: 12 });
      c.position.copy(a).add(dir.clone().multiplyScalar(len - hl / 2));
      c.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
      g.add(c); return g;
    },
    /* curved arrow around an axis (y) from angle a0 to a1 */
    arc(R, a0, a1, color, o = {}) {
      const pts = []; const n = Math.max(6, Math.round(Math.abs(a1 - a0) * 12));
      for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([R * Math.cos(t), o.y ?? 0, -R * Math.sin(t)]); }
      const g = new THREE.Group();
      g.add(api.tube(pts, o.r ?? 0.03, color, { seg: n * 2, tension: 0 }));
      if (o.head !== false) {
        const end = vec(pts[n]), prev = vec(pts[n - 1]);
        const dir = end.clone().sub(prev).normalize();
        const c = api.cone((o.r ?? 0.03) * 3, o.hl ?? 0.2, color, null, null, { seg: 10 });
        c.position.copy(end); c.quaternion.setFromUnitVectors(V3(0, 1, 0), dir); g.add(c);
      }
      if (o.pos) g.position.set(...o.pos);
      if (o.rot) g.rotation.set(...o.rot);
      return g;
    },
    text(str, o = {}) {
      const size = o.size ?? 0.22, font = `${o.bold ? '700' : '500'} 44px system-ui, "Segoe UI", Roboto, sans-serif`;
      const cv = document.createElement('canvas'), cx = cv.getContext('2d');
      cx.font = font; const w = Math.ceil(cx.measureText(str).width) + 28, h = 64;
      cv.width = w; cv.height = h; cx.font = font; cx.textBaseline = 'middle'; cx.textAlign = 'center';
      if (o.bg) { cx.fillStyle = o.bg; cx.beginPath(); cx.moveTo(10, 4); cx.lineTo(w - 10, 4); cx.quadraticCurveTo(w - 4, 4, w - 4, 10); cx.lineTo(w - 4, h - 10); cx.quadraticCurveTo(w - 4, h - 4, w - 10, h - 4); cx.lineTo(10, h - 4); cx.quadraticCurveTo(4, h - 4, 4, h - 10); cx.lineTo(4, 10); cx.quadraticCurveTo(4, 4, 10, 4); cx.fill(); }
      cx.fillStyle = o.color ?? '#e8f4ff'; cx.fillText(str, w / 2, h / 2);
      const tex = tmp(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter;
      const m = tmp(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !o.top, depthWrite: false }));
      const s = new THREE.Sprite(m); s.scale.set(size * w / h, size, 1);
      if (o.pos) s.position.set(...o.pos);
      s.userData.isText = true;
      return s;
    },
    helix(R, height, turns, r, color, o = {}) {
      const n = Math.max(24, Math.round(turns * (o.ppt ?? 16))), pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = (o.phase ?? 0) + t * turns * TAU;
        const x = R * Math.cos(a), z = R * Math.sin(a), y = -height / 2 + t * height;
        pts.push(o.axis === 'x' ? [y, x, z] : o.axis === 'z' ? [x, z, y] : [x, y, z]);
      }
      return api.tube(pts, r, color, Object.assign({ seg: n, tension: 0.2 }, o));
    },
    /* sinuous / random-ish polyline points helper */
    wave(n, len, amp, o = {}) {
      const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-len / 2 + t * len, amp * Math.sin(t * (o.k ?? 2) * TAU + (o.ph ?? 0)), (o.z ?? 0)]); } return pts;
    },
    grp(children = [], pos, rot, scale) {
      const g = new THREE.Group(); children.forEach(c => c && g.add(c));
      if (pos) g.position.set(...pos); if (rot) g.rotation.set(...rot);
      if (scale) g.scale.setScalar(scale);
      return g;
    },
    ex(obj, x, y, z) { obj.userData.ex = V3(x, y, z); obj.userData.base = obj.position.clone(); return obj; },
    name(obj, n) { obj.name = n; return obj; },

    /* ---- composite: 3D graph plate ---- */
    graph(o = {}) {
      const w = o.w ?? 4, h = o.h ?? 2.8, xr = o.xr ?? [0, 1], yr = o.yr ?? [0, 1];
      const mx = x => -w / 2 + (x - xr[0]) / (xr[1] - xr[0]) * w, my = y => -h / 2 + (y - yr[0]) / (yr[1] - yr[0]) * h;
      const g = new THREE.Group();
      g.map = (x, y, z = 0.06) => [mx(x), my(y), z];
      if (o.plate !== false) g.add(api.plane(w + 0.6, h + 0.6, '#0b1f33', [0.15, 0.15, -0.04], null, { op: 0.55, e: 0.15 }));
      // grid
      const gl = [];
      const nx = o.nx ?? 8, ny = o.ny ?? 6;
      for (let i = 0; i <= nx; i++) { const x = -w / 2 + w * i / nx; gl.push(api.line([[x, -h / 2, 0], [x, h / 2, 0]], '#1e3a5f', { op: 0.8 })); }
      for (let i = 0; i <= ny; i++) { const y = -h / 2 + h * i / ny; gl.push(api.line([[-w / 2, y, 0], [w / 2, y, 0]], '#1e3a5f', { op: 0.8 })); }
      gl.forEach(l => g.add(l));
      // axes
      const ox = clamp(mx(0), -w / 2, w / 2), oy = clamp(my(0), -h / 2, h / 2);
      g.add(api.arrow([-w / 2, oy, 0.02], [w / 2 + 0.35, oy, 0.02], '#cbd5e1', { r: 0.02, head: 0.18 }));
      g.add(api.arrow([ox, -h / 2, 0.02], [ox, h / 2 + 0.35, 0.02], '#cbd5e1', { r: 0.02, head: 0.18 }));
      if (o.xl) g.add(api.text(o.xl, { size: 0.22, pos: [w / 2 + 0.2, oy - 0.3, 0.05], color: '#cbd5e1' }));
      if (o.yl) g.add(api.text(o.yl, { size: 0.22, pos: [ox - 0.05, h / 2 + 0.5, 0.05], color: '#cbd5e1' }));
      (o.xt || []).forEach(([x, s]) => { g.add(api.line([[mx(x), oy - 0.06, 0.02], [mx(x), oy + 0.06, 0.02]], '#cbd5e1')); g.add(api.text(s, { size: 0.16, pos: [mx(x), oy - 0.2, 0.05], color: '#94a3b8' })); });
      (o.yt || []).forEach(([y, s]) => { g.add(api.line([[ox - 0.06, my(y), 0.02], [ox + 0.06, my(y), 0.02]], '#cbd5e1')); g.add(api.text(s, { size: 0.16, pos: [ox - 0.32, my(y), 0.05], color: '#94a3b8' })); });
      (o.curves || []).forEach(c => {
        let pts = c.pts;
        if (c.f) { const n = c.n ?? 60, d = c.dom ?? xr; pts = []; for (let i = 0; i <= n; i++) { const x = d[0] + (d[1] - d[0]) * i / n; const y = c.f(x); if (isFinite(y)) pts.push([x, clamp(y, yr[0] - (yr[1] - yr[0]) * 0.05, yr[1] + (yr[1] - yr[0]) * 0.05)]); } }
        const p3 = pts.map(p => [mx(p[0]), my(p[1]), 0.06]);
        if (c.dashed) g.add(api.line(p3, c.color, { dashed: true }));
        else g.add(api.tube(p3, c.r ?? 0.03, c.color, { seg: Math.max(12, p3.length * 2), tension: c.tension ?? 0.3, e: 0.5 }));
        if (c.label) g.add(api.text(c.label, { size: 0.17, pos: [mx(pts[pts.length - 1][0]) + 0.15, my(pts[pts.length - 1][1]) + 0.12, 0.08], color: c.color }));
      });
      (o.marks || []).forEach(m => { g.add(api.sphere(m.r ?? 0.06, m.color ?? '#fff', [mx(m.x), my(m.y), 0.07], { e: 0.6 })); if (m.label) g.add(api.text(m.label, { size: 0.16, pos: [mx(m.x) + (m.dx ?? 0.25), my(m.y) + (m.dy ?? 0.18), 0.09], color: m.color ?? '#fff' })); });
      (o.hl || []).forEach(l => g.add(api.line([[-w / 2, my(l.y), 0.03], [mx(l.x ?? xr[1]), my(l.y), 0.03]], l.color ?? '#94a3b8', { dashed: true })));
      (o.vl || []).forEach(l => g.add(api.line([[mx(l.x), -h / 2, 0.03], [mx(l.x), my(l.y ?? yr[1]), 0.03]], l.color ?? '#94a3b8', { dashed: true })));
      if (o.title) g.add(api.text(o.title, { size: 0.24, bold: true, pos: [0, h / 2 + 0.7, 0.05] }));
      if (o.pos) g.position.set(...o.pos); if (o.rot) g.rotation.set(...o.rot);
      return g;
    },

    /* ---- composite: cyclic pathway (nodes on a ring) ---- */
    cycle(o = {}) {
      const R = o.R ?? 1.6, nodes = o.nodes, n = nodes.length, g = new THREE.Group(), pos = [];
      const a0 = o.a0 ?? PI / 2, dir = o.ccw ? 1 : -1;
      nodes.forEach((nd, i) => {
        const a = a0 + dir * TAU * i / n, p = [R * Math.cos(a), o.flat ? 0 : R * Math.sin(a), o.flat ? -R * Math.sin(a) : 0];
        pos.push(p);
        g.add(api.sphere(nd.r ?? 0.16, nd.color ?? C.teal, p, { e: 0.5 }));
        if (nd.name) g.add(api.text(nd.name, { size: o.ts ?? 0.2, pos: [p[0] * 1.02, p[1] + (o.flat ? 0.3 : 0.28), p[2] * 1.02], bold: true, color: nd.tc ?? '#fff' }));
        // arc to next
        const a1 = a0 + dir * TAU * (i + 1) / n, pad = (nd.r ?? 0.16) / R + 0.05;
        const s = a + dir * pad, e = a1 - dir * pad, m = Math.max(6, 10);
        const pts = []; for (let k = 0; k <= m; k++) { const t = s + (e - s) * k / m; pts.push(o.flat ? [R * Math.cos(t), 0, -R * Math.sin(t)] : [R * Math.cos(t), R * Math.sin(t), 0]); }
        const arcG = new THREE.Group();
        arcG.add(api.tube(pts, o.ar ?? 0.03, o.ac ?? '#94a3b8', { seg: 24, tension: 0 }));
        const end = vec(pts[m]), prev = vec(pts[m - 1]), d = end.clone().sub(prev).normalize();
        const cone = api.cone(0.09, 0.2, o.ac ?? '#94a3b8', null, null, { seg: 10 }); cone.position.copy(end); cone.quaternion.setFromUnitVectors(V3(0, 1, 0), d); arcG.add(cone);
        if (nd.step) { const mid = vec(pts[Math.floor(m / 2)]).multiplyScalar(1 + (o.stepOut ?? 0.28)); arcG.add(api.text(nd.step, { size: 0.15, pos: [mid.x, mid.y, mid.z], color: nd.sc ?? C.yellow })); }
        if (nd.inner) { const mid = vec(pts[Math.floor(m / 2)]).multiplyScalar(1 - (o.stepIn ?? 0.24)); arcG.add(api.text(nd.inner, { size: 0.15, pos: [mid.x, mid.y, mid.z], color: nd.ic ?? C.pink })); }
        g.add(arcG);
      });
      if (o.center) g.add(api.text(o.center, { size: 0.24, bold: true, pos: [0, 0, 0], color: o.cc ?? '#fff' }));
      g.nodePos = pos;
      if (o.pos) g.position.set(...o.pos);
      return g;
    },

    /* ---- composite: atoms & bonds ---- */
    CPK: { H: ['#f8fafc', 0.16], C: ['#8b8b8b', 0.24], N: ['#3b82f6', 0.24], O: ['#ef4444', 0.24], S: ['#eab308', 0.3], P: ['#f97316', 0.3], F: ['#86efac', 0.2], Cl: ['#22c55e', 0.28], Br: ['#b91c1c', 0.32], I: ['#7e22ce', 0.34], Zn: ['#94a3b8', 0.34], Cu: ['#d97706', 0.34], Pt: ['#cbd5e1', 0.36], Co: ['#f472b6', 0.34], Cr: ['#60a5fa', 0.34], Mn: ['#a78bfa', 0.34], Xe: ['#2dd4bf', 0.36], Na: ['#c084fc', 0.3], K: ['#a855f7', 0.32], Fe: ['#f59e0b', 0.34], Mg: ['#4ade80', 0.3], Ca: ['#9ca3af', 0.32], Ni: ['#10b981', 0.34], Si: ['#f5d0a9', 0.3], B: ['#fdba74', 0.26], X: ['#e5e7eb', 0.28] },
    atom(sym, pos, o = {}) {
      const [col, r] = api.CPK[sym] || api.CPK.X;
      const g = new THREE.Group();
      g.add(api.sphere(o.r ?? r, o.color ?? col, null, { e: 0.35 }));
      if (o.label !== false) g.add(api.text(o.label ?? sym, { size: (o.r ?? r) * 1.5, top: true, bold: true, color: sym === 'H' || sym === 'Pt' ? '#111827' : '#fff' }));
      g.position.set(...pos); g.name = o.name || sym; return g;
    },
    bond(a, b, o = {}) {
      a = vec(a); b = vec(b); const order = o.order ?? 1, g = new THREE.Group(), col = o.color ?? '#cbd5e1';
      if (order === 1) g.add(api.rod(a, b, o.r ?? 0.05, col, { e: 0.2 }));
      else {
        const d = b.clone().sub(a).normalize(), up = Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0), n = d.clone().cross(up).normalize().multiplyScalar(o.gap ?? 0.09);
        if (order === 2) { g.add(api.rod(a.clone().add(n), b.clone().add(n), 0.035, col)); g.add(api.rod(a.clone().sub(n), b.clone().sub(n), 0.035, col)); }
        else { g.add(api.rod(a, b, 0.035, col)); g.add(api.rod(a.clone().add(n), b.clone().add(n), 0.03, col)); g.add(api.rod(a.clone().sub(n), b.clone().sub(n), 0.03, col)); }
      }
      if (o.dashed) { g.children.forEach(c => { c.material = mat(col, { op: 0.35 }); }); }
      return g;
    },
    /* lone-pair lobe (ellipsoid pointing along dir) */
    lone(pos, dir, o = {}) {
      const m = api.ell(0.16, 0.34, 0.16, o.color ?? '#facc15', null, { op: 0.55, e: 0.5 });
      const d = vec(dir).normalize(); m.position.copy(vec(pos)).add(d.clone().multiplyScalar(0.45));
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d); return m;
    },
    /* orbital lobe: teardrop lathe pointing along +y; sign colours */
    lobe(len, wid, color, pos, dir, o = {}) {
      const prof = []; const n = 18;
      for (let i = 0; i <= n; i++) { const t = i / n; prof.push([wid * Math.sin(t * PI) * Math.pow(t, 0.35), len * t]); }
      const m = api.lathe(prof, color, pos, null, Object.assign({ seg: 24, op: o.op ?? 0.75, e: 0.5, side: THREE.DoubleSide }, o));
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), vec(dir).normalize()); return m;
    },
    /* energy level bar with electrons: e = array of +1/-1 (up/down) or 'ud' strings */
    level(x, y, w, color, label, elec, o = {}) {
      const g = new THREE.Group();
      g.add(api.box(w, 0.04, 0.06, color, [x, y, 0], null, { e: 0.6 }));
      if (label) g.add(api.text(label, { size: 0.16, pos: [x + (o.lx ?? (w / 2 + 0.32)), y, 0.02], color }));
      if (elec) {
        const arr = typeof elec === 'string' ? elec.split('') : elec;
        const n = arr.length, sp = 0.13;
        arr.forEach((e, i) => { const ex = x - (n - 1) * sp / 2 + i * sp, up = e === 'u' || e === 1; g.add(api.arrow([ex, up ? y + 0.02 : y + 0.34, 0.03], [ex, up ? y + 0.34 : y + 0.02, 0.03], '#fde68a', { r: 0.014, head: 0.09, hr: 0.045 })); });
      }
      return g;
    }
  };
  return api;
})();

/* ------------------------------------------------ 2. registry */
const FIGS = [];
const SUBJECTS = { bio: { name: 'Biology', color: '#4ade80', icon: '🧬' }, chem: { name: 'Chemistry', color: '#f472b6', icon: '🧪' }, phy: { name: 'Physics', color: '#60a5fa', icon: '⚡' } };
function reg(f) { if (!f.variants) f.variants = [{ name: 'Default', build: f.build, slide: f.slide }]; FIGS.push(f); return f; }
/* label: term, note, anchor([x,y,z] | Object3D), options {side:'L'|'R', off:[x,y,z]} */
const L = (t, n, a, o) => Object.assign({ t, n, a }, o || {});


/* ================================================================
   3. BIOLOGY — CLASS 11   (Unit 1 & 2: Ch 2–7)
   ================================================================ */
const B11 = { sub: 'bio', cls: 11 };
const U1 = 'Unit 1 · Diversity in the Living World', U2 = 'Unit 2 · Structural Organisation', U3 = 'Unit 3 · Cell: Structure & Functions', U4 = 'Unit 4 · Plant Physiology', U5 = 'Unit 5 · Human Physiology';

/* ---------- Ch 2 Biological Classification ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-2-1', unit: U1, ch: 'Ch 2 — Biological Classification', fig: 'Fig 2.1', title: 'Nostoc filament & dividing bacterium',
  desc: 'Nostoc is a filamentous, colonial blue-green alga (cyanobacterium). Its trichome carries specialised, thick-walled heterocysts for nitrogen fixation. Bacteria multiply by binary fission — a septum grows inward and divides the cell.',
  points: ['Cyanobacteria = blue-green algae; Gram-negative photosynthetic autotrophs (chlorophyll a).', 'Heterocysts: specialised cells for N₂ fixation (Nostoc, Anabaena).', 'Colonies are surrounded by a gelatinous (mucilaginous) sheath.', 'Bacteria reproduce mainly by fission; under stress form spores; primitive DNA transfer also occurs.'],
  build() {
    const g = H.grp(), labels = [];
    // Nostoc trichome along a gentle sinusoid
    const path = []; for (let i = 0; i <= 14; i++) path.push([-2.4 + i * 0.34, 0.9 + 0.25 * Math.sin(i * 0.9), 0]);
    path.forEach((p, i) => { if (i === 7) g.add(H.name(H.sphere(0.24, C.yellow, p, { e: 0.5 }), 'heterocyst')); else g.add(H.sphere(0.15, C.teal, p)); });
    g.add(H.tube(path, 0.3, C.cyan, { op: 0.18, dw: false, seg: 40 }));
    labels.push(L('Heterocyst', 'Large, thick-walled, pale cell — fixes atmospheric N₂', path[7]));
    labels.push(L('Vegetative cell', 'Photosynthetic cell of the trichome', path[2]));
    labels.push(L('Mucilaginous sheath', 'Gelatinous covering around the filament', [path[12][0], path[12][1] + 0.3, 0]));
    // dividing bacterium (binary fission)
    const b = H.grp([], [0, -1.1, 0]);
    b.add(H.capsule(0.32, 1.6, C.pink, null, [0, 0, PI / 2], { op: 0.45 }));
    b.add(H.ring(0.02, 0.32, C.white, [0, 0, 0], [0, PI / 2, 0], { op: 0.9 }));
    b.add(H.helix(0.14, 0.55, 3, 0.03, C.dna, { axis: 'x', pos: [-0.45, 0, 0] }));
    b.add(H.helix(0.14, 0.55, 3, 0.03, C.dna, { axis: 'x', pos: [0.45, 0, 0] }));
    for (let i = 0; i < 4; i++) b.add(H.tube([[0.8 + i * 0.05, 0.15 - i * 0.1, 0], [1.2, 0.3 - i * 0.2, 0.1 * i], [1.6, -0.1 + i * 0.15, -0.1 * i]], 0.015, C.grey));
    g.add(b);
    labels.push(L('Septum', 'Ingrowing cross wall dividing the cell in two', [0, -1.1, 0]));
    labels.push(L('Nucleoid (DNA)', 'Circular naked DNA, already duplicated', [-0.45, -1.1, 0]));
    labels.push(L('Cell wall', 'Rigid peptidoglycan wall of the bacterium', [-0.9, -1.35, 0]));
    labels.push(L('Flagella', 'Locomotory appendages (when present)', [1.5, -1.05, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-2-2', unit: U1, ch: 'Ch 2 — Biological Classification', fig: 'Fig 2.2', title: 'Shapes of bacteria',
  desc: 'Bacteria are grouped into four categories on the basis of shape: spherical coccus, rod-shaped bacillus, comma-shaped vibrium and spiral spirillum.',
  points: ['Coccus (pl. cocci) — spherical; Bacillus — rod; Vibrio — comma; Spirillum — spiral.', 'Bacteria are the most abundant micro-organisms; found in extreme habitats too.', 'Most are heterotrophs; some are autotrophic (photosynthetic/chemosynthetic).'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.sphere(0.5, C.pink, [-1.6, 1, 0]));
    g.add(H.sphere(0.5, C.pink, [-0.9, 1.15, 0.2]));
    labels.push(L('Coccus (spherical)', 'e.g. Streptococcus, Staphylococcus; may form chains/clusters', [-1.6, 1, 0]));
    g.add(H.capsule(0.3, 1.4, C.teal, [1.4, 1, 0], [0, 0, PI / 2]));
    labels.push(L('Bacillus (rod-shaped)', 'e.g. Bacillus subtilis, E. coli, Lactobacillus', [1.4, 1, 0]));
    g.add(H.tube([[-2.2, -1, 0], [-1.9, -1.35, 0.1], [-1.4, -1.3, 0.1], [-1.1, -0.9, 0]], 0.2, C.orange, { seg: 30 }));
    g.add(H.tube([[-1.1, -0.9, 0], [-0.9, -0.55, 0.15], [-0.7, -0.2, 0.3]], 0.02, C.grey));
    labels.push(L('Vibrio (comma-shaped)', 'e.g. Vibrio cholerae — single polar flagellum', [-1.6, -1.3, 0]));
    g.add(H.helix(0.28, 2.2, 3, 0.16, C.purple, { axis: 'x', pos: [1.4, -1, 0] }));
    labels.push(L('Spirillum (spiral)', 'e.g. Spirillum, Treponema — rigid spiral body', [1.4, -1, 0]));
    return { g, labels };
  }
}));

/* protist sub-builders */
function protistDino() {
  const g = H.grp(), labels = [];
  g.add(H.icosa(1, C.orange, [0, 0, 0], { detail: 1, op: 0.9 }));
  g.add(H.icosa(1.02, C.brown, [0, 0, 0], { detail: 1, wire: true }));
  g.add(H.torus(1.03, 0.06, C.dgreen, [0, 0.1, 0], [PI / 2, 0, 0]));
  g.add(H.tube([[0, 0.1, 1.05], [0.5, 0.15, 1.3], [1.2, 0.1, 1.5], [1.9, 0.3, 1.4]], 0.025, C.yellow));
  g.add(H.tube([[0.2, -0.9, 0.5], [0.3, -1.5, 0.7], [0.2, -2.1, 0.8], [0.4, -2.6, 0.6]], 0.025, C.yellow));
  g.add(H.rod([0, 0.1, 1.0], [0, -1.0, 0.3], 0.05, C.dgreen));
  labels.push(L('Cellulose plates', 'Stiff armour-like plates on the cell surface', [0.7, 0.7, 0.4]));
  labels.push(L('Transverse flagellum', 'Lies in the transverse groove (girdle)', [1.5, 0.2, 1.45]));
  labels.push(L('Longitudinal flagellum', 'Lies in the longitudinal groove (sulcus)', [0.3, -2.2, 0.7]));
  labels.push(L('Transverse groove', 'Girdle around the cell; spinning movement', [-1.05, 0.1, 0]));
  return { g, labels, note: 'Dinoflagellates (e.g. Gonyaulax) — mostly marine, photosynthetic; red tides; two flagella in grooves.' };
}
function protistEuglena() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, -1.8], [0.25, -1.4], [0.5, -0.6], [0.55, 0.2], [0.45, 0.9], [0.25, 1.4], [0, 1.7]], C.leaf, null, null, { op: 0.5, seg: 28 }));
  const rng = H.rng(4); for (let i = 0; i < 9; i++) g.add(H.ell(0.12, 0.22, 0.08, C.dgreen, [(rng() - 0.5) * 0.6, -1 + i * 0.28, (rng() - 0.5) * 0.5], { e: 0.5 }));
  g.add(H.sphere(0.25, C.nuc, [0, -0.3, 0]));
  g.add(H.sphere(0.08, C.red, [0.18, 1.25, 0.15], { e: 0.8 }));
  g.add(H.tube([[0, 1.7, 0], [0.3, 2.2, 0.2], [0.2, 2.8, 0.1], [0.5, 3.3, 0]], 0.03, C.yellow));
  g.add(H.tube([[0, 1.7, 0], [-0.1, 2.0, 0], [-0.05, 2.3, 0]], 0.02, C.yellow));
  g.add(H.sphere(0.14, C.cyan, [-0.2, 1.1, 0], { op: 0.6 }));
  labels.push(L('Flagellum (long)', 'Locomotion; arises from reservoir at anterior end', [0.3, 2.6, 0.1]));
  labels.push(L('Eye spot (stigma)', 'Photoreceptive red pigment spot', [0.18, 1.25, 0.15]));
  labels.push(L('Chloroplasts', 'Photosynthesis in light; heterotroph in dark', [0.2, 0.2, 0.3]));
  labels.push(L('Nucleus', 'Single large nucleus', [0, -0.3, 0]));
  labels.push(L('Pellicle', 'Protein-rich flexible covering, no cell wall', [-0.5, -0.4, 0]));
  labels.push(L('Reservoir', 'Contractile vacuole opens here', [-0.2, 1.1, 0]));
  return { g, labels, note: 'Euglena — fresh water; pellicle instead of cell wall; two flagella (one short, one long); mixotrophic; connecting link plants–animals.' };
}
function protistSlime() {
  const g = H.grp(), labels = [];
  const rng = H.rng(9);
  for (let i = 0; i < 26; i++) { const a = rng() * TAU, r = 0.4 + rng() * 1.3; g.add(H.sphere(0.25 + rng() * 0.25, C.yellow, [r * Math.cos(a), 0.08 * rng(), r * Math.sin(a) * 0.7], { op: 0.85 })); }
  g.add(H.ell(0.8, 0.25, 0.6, C.amber, [0, 0, 0]));
  for (let i = 0; i < 3; i++) { g.add(H.rod([1.2 + i * 0.5, 0, -0.4 + i * 0.4], [1.2 + i * 0.5, 0.9, -0.4 + i * 0.4], 0.04, C.orange)); g.add(H.sphere(0.16, C.brown, [1.2 + i * 0.5, 1.0, -0.4 + i * 0.4])); }
  labels.push(L('Plasmodium', 'Multinucleate mass of protoplasm without cell walls', [-0.6, 0.15, 0.3]));
  labels.push(L('Fruiting body', 'Formed under unfavourable conditions', [1.7, 1.0, 0]));
  labels.push(L('Spores', 'True walls; extremely resistant; dispersed by air', [2.2, 1.05, 0.4]));
  return { g, labels, note: 'Slime moulds — saprophytic protists; plasmodium may grow several feet; spores with true walls.' };
}
function protistParamecium() {
  const g = H.grp(), labels = [];
  const prof = [[0, -1.9], [0.3, -1.6], [0.55, -0.9], [0.62, 0], [0.58, 0.8], [0.4, 1.4], [0, 1.8]];
  g.add(H.lathe(prof, C.cyan, null, [0, 0, PI / 2], { op: 0.35, seg: 28 }));
  const rng = H.rng(2); for (let i = 0; i < 110; i++) { const a = rng() * TAU, y = -1.8 + rng() * 3.6, r = 0.6 * Math.sqrt(1 - Math.pow(y / 1.9, 2)); const p = [y, r * Math.cos(a), r * Math.sin(a)]; g.add(H.rod(p, [y, (r + 0.18) * Math.cos(a), (r + 0.18) * Math.sin(a)], 0.008, C.white, { seg: 4 })); }
  g.add(H.ell(0.6, 0.22, 0.18, C.nuc, [0.1, 0, 0]));
  g.add(H.sphere(0.1, C.purple, [0.5, 0.25, 0.1], { e: 0.6 }));
  g.add(H.sphere(0.2, C.blue, [-1.3, 0.2, 0], { op: 0.6 })); g.add(H.sphere(0.2, C.blue, [1.3, 0.2, 0], { op: 0.6 }));
  g.add(H.tube([[-0.8, -0.55, 0.2], [-0.2, -0.5, 0.3], [0.3, -0.35, 0.25]], 0.05, C.ink, { op: 0.8 }));
  labels.push(L('Cilia', 'Thousands of short cilia — locomotion & feeding', [0, 0.75, 0.4]));
  labels.push(L('Macronucleus', 'Large, vegetative nucleus', [0.1, 0, 0]));
  labels.push(L('Micronucleus', 'Small, reproductive nucleus', [0.5, 0.25, 0.1]));
  labels.push(L('Contractile vacuole', 'Osmoregulation — expels excess water', [-1.3, 0.2, 0]));
  labels.push(L('Oral groove', 'Leads to cytostome (cell mouth)', [-0.2, -0.5, 0.3]));
  labels.push(L('Pellicle', 'Firm outer covering', [1.0, -0.4, 0.2]));
  return { g, labels, note: 'Paramecium — ciliate protozoan; two nuclei (macro + micro); contractile vacuoles; slipper shape.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-2-3', unit: U1, ch: 'Ch 2 — Biological Classification', fig: 'Fig 2.3', title: 'Protists',
  desc: 'Kingdom Protista includes Chrysophytes, Dinoflagellates, Euglenoids, Slime moulds and Protozoans — all single-celled eukaryotes, mostly aquatic.',
  points: ['Dinoflagellates: cellulose plates, two flagella; red tides (Gonyaulax).', 'Euglenoids: pellicle, two flagella (one long, one short), mixotrophic.', 'Slime moulds: saprophytic; plasmodium; spores with true walls.', 'Protozoans: amoeboid, flagellated, ciliated, sporozoans (Plasmodium).'],
  variants: [{ name: 'Dinoflagellate', build: protistDino }, { name: 'Euglena', build: protistEuglena }, { name: 'Slime mould', build: protistSlime }, { name: 'Paramecium', build: protistParamecium }]
}));

/* fungi */
function fungusMucor() {
  const g = H.grp(), labels = [];
  const rng = H.rng(11);
  for (let i = 0; i < 6; i++) g.add(H.tube([[-2 + i * 0.7, -1.6, 0], [-1.7 + i * 0.7, -1.5, 0.3 * rng()], [-1.4 + i * 0.7, -1.62, -0.2]], 0.04, C.white, { op: 0.9 }));
  g.add(H.tube([[-1.5, -1.6, 0], [-1.6, -1.9, 0.1], [-1.5, -2.2, 0], [-1.3, -2.4, 0.1]], 0.03, C.grey));
  g.add(H.tube([[0.4, -1.6, 0], [0.3, -1.9, 0.1], [0.5, -2.2, -0.1]], 0.03, C.grey));
  g.add(H.tube([[-0.6, -1.55, 0], [-0.5, -0.5, 0.05], [-0.4, 0.6, 0]], 0.05, C.white));
  g.add(H.sphere(0.55, C.ink, [-0.4, 1.1, 0], { op: 0.55 }));
  g.add(H.sphere(0.28, C.grey, [-0.4, 0.85, 0]));
  const rs = H.rng(3); for (let i = 0; i < 40; i++) { const a = rs() * TAU, b = rs() * PI; const r = 0.42; g.add(H.sphere(0.05, C.yellow, [-0.4 + r * Math.sin(b) * Math.cos(a), 1.1 + r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], { seg: 6, e: 0.6 })); }
  g.add(H.tube([[1.2, -1.55, 0], [1.3, -0.6, 0], [1.4, 0.2, 0]], 0.05, C.white));
  g.add(H.sphere(0.35, C.ink, [1.4, 0.55, 0], { op: 0.55 }));
  labels.push(L('Sporangium', 'Globular sac bearing many sporangiospores', [-0.4, 1.4, 0.3]));
  labels.push(L('Columella', 'Dome-shaped sterile tip of sporangiophore inside sporangium', [-0.4, 0.85, 0]));
  labels.push(L('Sporangiophore', 'Erect aerial hypha bearing sporangium', [-0.5, -0.5, 0.05]));
  labels.push(L('Stolon / mycelium', 'Coenocytic (aseptate) hyphae spreading on substrate', [0.5, -1.55, 0]));
  labels.push(L('Rhizoids', 'Root-like hyphae anchoring & absorbing', [-1.5, -2.2, 0]));
  return { g, labels, note: 'Phycomycetes (Mucor, Rhizopus, Albugo): aseptate coenocytic mycelium; asexual spores endogenous (sporangiospores); zygospore sexual.' };
}
function fungusAspergillus() {
  const g = H.grp(), labels = [];
  g.add(H.tube([[0, -2, 0], [0.05, -1, 0], [0, 0, 0]], 0.06, C.white));
  g.add(H.sphere(0.4, C.teal, [0, 0.35, 0]));
  const N = 22; for (let i = 0; i < N; i++) { const a = (i / N) * PI + 0.0, ph = (i % 2) * 0.35; const d = V3(Math.cos(a), Math.sin(a) + 0.1, Math.sin(ph * 3) * 0.6).normalize(); const base = V3(0, 0.35, 0).add(d.clone().multiplyScalar(0.4)); g.add(H.rod(base, base.clone().add(d.clone().multiplyScalar(0.3)), 0.04, C.cyan)); for (let k = 1; k <= 5; k++) g.add(H.sphere(0.07, C.dgreen, base.clone().add(d.clone().multiplyScalar(0.3 + k * 0.16)).toArray(), { seg: 8, e: 0.5 })); }
  g.add(H.sphere(0.12, C.white, [0, -2, 0]));
  for (let i = 0; i < 5; i++) g.add(H.tube([[-1.5 + i * 0.7, -2.1, 0], [-1.2 + i * 0.7, -2.0, 0.2], [-0.9 + i * 0.7, -2.15, -0.1]], 0.035, C.white));
  labels.push(L('Conidia', 'Exogenous asexual spores in chains', [1.0, 1.35, 0]));
  labels.push(L('Phialides (sterigmata)', 'Flask-shaped cells bearing conidia', [-0.55, 0.65, 0]));
  labels.push(L('Vesicle', 'Swollen tip of conidiophore', [0, 0.35, 0]));
  labels.push(L('Conidiophore', 'Specialised aerial hypha', [0.05, -1, 0]));
  labels.push(L('Foot cell', 'Base of conidiophore in the mycelium', [0, -2, 0]));
  labels.push(L('Septate mycelium', 'Branched, septate hyphae', [-1.2, -2.05, 0.2]));
  return { g, labels, note: 'Ascomycetes (Aspergillus, Penicillium, Neurospora, Claviceps): septate branched mycelium; conidia exogenous; ascospores in asci.' };
}
function fungusAgaricus() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, 1.5], [0.6, 1.42], [1.2, 1.2], [1.6, 0.9], [1.75, 0.65], [1.55, 0.55], [0.32, 0.5]], C.brown, null, null, { seg: 40 }));
  for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; g.add(H.plane(1.25, 0.16, C.pink, [0.95 * Math.cos(a), 0.5, 0.95 * Math.sin(a)], [0, -a, 0], { op: 0.9 })); }
  g.add(H.cyl(0.28, 0.34, 2.2, C.bone, [0, -0.6, 0]));
  g.add(H.torus(0.36, 0.06, C.bone, [0, 0.05, 0], [PI / 2, 0, 0]));
  g.add(H.sphere(0.45, C.bone, [0, -1.7, 0], { sy: 0.7 }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.add(H.tube([[0, -1.85, 0], [0.5 * Math.cos(a), -2.1, 0.5 * Math.sin(a)], [1.1 * Math.cos(a), -2.2, 1.1 * Math.sin(a)]], 0.025, C.white)); }
  labels.push(L('Pileus (cap)', 'Umbrella-shaped fruiting-body cap', [0.6, 1.4, 0]));
  labels.push(L('Gills (lamellae)', 'Radiating plates bearing basidia → basidiospores', [0.95, 0.5, 0.5]));
  labels.push(L('Annulus (ring)', 'Remnant of partial veil on the stipe', [0.36, 0.05, 0]));
  labels.push(L('Stipe (stalk)', 'Supports the pileus', [0, -0.6, 0.3]));
  labels.push(L('Volva / mycelium', 'Underground vegetative mycelium (septate)', [0.8, -2.2, 0.5]));
  return { g, labels, note: 'Basidiomycetes (Agaricus, Ustilago, Puccinia): basidiocarp; basidiospores exogenous on basidium; no asexual spores generally.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-2-4', unit: U1, ch: 'Ch 2 — Biological Classification', fig: 'Fig 2.4', title: 'Fungi: Mucor, Aspergillus, Agaricus',
  desc: 'Fungi are heterotrophic, spore-producing eukaryotes with chitinous cell walls and hyphal mycelium. NCERT compares the three classes by mycelium type and mode of spore formation.',
  points: ['Cell wall: chitin + polysaccharides; reserve food glycogen.', 'Phycomycetes — aseptate; Ascomycetes & Basidiomycetes — septate.', 'Sexual cycle: plasmogamy → karyogamy → meiosis; dikaryophase (n+n) in Asco/Basidio.', 'Deuteromycetes = Fungi Imperfecti (only asexual phase known).'],
  variants: [{ name: 'Mucor', build: fungusMucor }, { name: 'Aspergillus', build: fungusAspergillus }, { name: 'Agaricus', build: fungusAgaricus }]
}));

function virusTMV() {
  const g = H.grp(), labels = [];
  const len = 4.6;
  // capsomere helix (protein coat) — half cut to show RNA
  g.add(H.helix(0.55, len, 14, 0.12, C.teal, { axis: 'x', ppt: 20 }));
  g.add(H.helix(0.3, len * 0.9, 12, 0.04, C.dna, { axis: 'x', phase: 0.5, ppt: 18 }));
  g.add(H.cyl(0.56, 0.56, len, C.cyan, null, [0, 0, PI / 2], { op: 0.12, open: true, side: THREE.DoubleSide, dw: false }));
  labels.push(L('Capsid (protein coat)', '~2130 identical capsomeres in helical array', [1.6, 0.6, 0]));
  labels.push(L('Capsomere', 'Single protein subunit of the capsid', [-1.5, 0.55, 0.2]));
  labels.push(L('RNA genome', 'Single-stranded RNA wound inside the helix', [0, 0.3, 0.1]));
  labels.push(L('Central hollow core', 'Rod ≈ 300 nm × 18 nm', [2.3, 0, 0]));
  return { g, labels, note: 'TMV — helical rod; ssRNA; plant viruses usually have ssRNA (Ivanowsky 1892; Stanley 1935 crystallised it).' };
}
function virusPhage() {
  const g = H.grp(), labels = [];
  g.add(H.icosa(0.9, C.purple, [0, 1.8, 0], { op: 0.85 }));
  g.add(H.icosa(0.92, C.white, [0, 1.8, 0], { wire: true }));
  g.add(H.helix(0.35, 0.9, 5, 0.05, C.dna, { pos: [0, 1.8, 0] }));
  g.add(H.cyl(0.18, 0.18, 0.15, C.grey, [0, 0.9, 0]));
  g.add(H.helix(0.24, 1.5, 10, 0.06, C.teal, { pos: [0, 0.05, 0], ppt: 20 }));
  g.add(H.cyl(0.14, 0.14, 1.6, C.cyan, [0, 0.05, 0], null, { op: 0.5 }));
  g.add(H.cyl(0.45, 0.45, 0.14, C.grey, [0, -0.75, 0], null, { seg: 6 }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.tube([[0.4 * Math.cos(a), -0.8, 0.4 * Math.sin(a)], [1.1 * Math.cos(a), -0.6, 1.1 * Math.sin(a)], [1.5 * Math.cos(a), -1.5, 1.5 * Math.sin(a)]], 0.03, C.white)); g.add(H.rod([0.4 * Math.cos(a), -0.8, 0.4 * Math.sin(a)], [0.5 * Math.cos(a), -1.15, 0.5 * Math.sin(a)], 0.03, C.yellow)); }
  labels.push(L('Head (capsid)', 'Icosahedral protein coat enclosing DNA', [0.7, 2.3, 0.4]));
  labels.push(L('DNA (genome)', 'Double-stranded DNA — bacteriophages have dsDNA', [0, 1.8, 0.35]));
  labels.push(L('Collar', 'Joins head to tail', [0.18, 0.9, 0]));
  labels.push(L('Tail sheath', 'Contractile protein sheath around core', [0.3, 0.2, 0.1]));
  labels.push(L('Base plate', 'Hexagonal plate with tail pins', [0.45, -0.75, 0]));
  labels.push(L('Tail fibres', 'Attach the phage to bacterial cell wall', [1.5, -1.5, 0]));
  return { g, labels, note: 'Bacteriophage (T4): tadpole-shaped; dsDNA; icosahedral head, tail with sheath, base plate and six tail fibres.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-2-5', unit: U1, ch: 'Ch 2 — Biological Classification', fig: 'Fig 2.5', title: 'Tobacco Mosaic Virus & Bacteriophage',
  desc: 'Viruses are obligate parasites — nucleoprotein particles with a protein coat (capsid) built of capsomeres around either RNA or DNA (never both).',
  points: ['Capsomeres arranged in helical (TMV) or polyhedral (phage head) form.', 'Plant viruses: mostly ssRNA; animal viruses: ssRNA/dsRNA/dsDNA; phages: usually dsDNA.', 'Viroids (Diener 1971): free RNA without protein coat — potato spindle tuber disease.', 'Prions: infectious abnormal proteins (mad cow disease, Cr–Jacob disease).'],
  variants: [{ name: 'TMV', build: virusTMV }, { name: 'Bacteriophage', build: virusPhage }]
}));

/* ---------- Ch 3 Plant Kingdom ---------- */
function algaeVolvox() {
  const g = H.grp(), labels = [];
  g.add(H.sphere(1.6, C.green, null, { op: 0.25, side: THREE.DoubleSide, dw: false }));
  const rng = H.rng(5); for (let i = 0; i < 260; i++) { const u = rng(), v = rng(); const th = Math.acos(2 * u - 1), ph = v * TAU; g.add(H.sphere(0.06, C.leaf, [1.6 * Math.sin(th) * Math.cos(ph), 1.6 * Math.cos(th), 1.6 * Math.sin(th) * Math.sin(ph)], { seg: 6, e: 0.5 })); }
  [[0.6, -0.4, 0.3], [-0.5, 0.5, -0.4], [0.2, -0.9, -0.5]].forEach(p => { g.add(H.sphere(0.35, C.green, p, { op: 0.35 })); for (let i = 0; i < 30; i++) { const a = (i * 2.39), b = Math.acos(1 - 2 * i / 30); g.add(H.sphere(0.04, C.lime, [p[0] + 0.35 * Math.sin(b) * Math.cos(a), p[1] + 0.35 * Math.cos(b), p[2] + 0.35 * Math.sin(b) * Math.sin(a)], { seg: 5 })); } });
  labels.push(L('Colony (coenobium)', 'Hollow sphere of ~500–60,000 biflagellate cells', [0, 1.6, 0]));
  labels.push(L('Somatic cell', 'Chlamydomonas-like cell with 2 flagella', [1.55, 0.3, 0.4]));
  labels.push(L('Daughter colony', 'Asexual reproduction by gonidia', [0.6, -0.4, 0.3]));
  labels.push(L('Gelatinous matrix', 'Cells connected by cytoplasmic strands', [-1.2, -0.9, 0.5]));
  return { g, labels, note: 'Chlorophyceae (green algae): chlorophyll a & b; pyrenoids; starch; cellulose wall. Volvox — colonial, oogamous.' };
}
function branchAlga(color, depth, len, ang, thick, flat, bladder) {
  const g = H.grp();
  const rec = (p, dir, d, l, t) => {
    const end = p.clone().add(dir.clone().multiplyScalar(l));
    if (flat) g.add(H.box(t * 3, l, 0.03, color, p.clone().add(end).multiplyScalar(0.5).toArray(), [0, 0, -Math.atan2(dir.x, dir.y)]));
    else g.add(H.rod(p, end, t, color));
    if (bladder && d === 2) g.add(H.ell(0.18, 0.28, 0.18, C.amber, end.toArray()));
    if (d >= depth) { if (bladder && d === depth) g.add(H.ell(0.14, 0.25, 0.14, C.orange, end.toArray())); return; }
    const a = Math.atan2(dir.y, dir.x);
    rec(end, V3(Math.cos(a + ang), Math.sin(a + ang), 0), d + 1, l * 0.78, t * 0.8);
    rec(end, V3(Math.cos(a - ang), Math.sin(a - ang), 0), d + 1, l * 0.78, t * 0.8);
  };
  rec(V3(0, -2.2, 0), V3(0, 1, 0), 0, len, thick);
  return g;
}
function algaeFucus() {
  const g = branchAlga(C.brown, 4, 1.3, 0.55, 0.09, true, true), labels = [];
  g.add(H.sphere(0.35, C.brown, [0, -2.25, 0], { sy: 0.4 }));
  labels.push(L('Holdfast', 'Attaches the thallus to rock', [0, -2.25, 0]));
  labels.push(L('Stipe', 'Stalk-like part', [0, -1.6, 0]));
  labels.push(L('Frond (dichotomous)', 'Leaf-like blade, forked branching', [-0.9, 0.2, 0]));
  labels.push(L('Air bladders', 'Give buoyancy in water', [-1.0, 1.2, 0]));
  labels.push(L('Receptacles (tips)', 'Swollen fertile tips bearing conceptacles', [1.9, 1.7, 0]));
  return { g, labels, note: 'Phaeophyceae (brown algae): chlorophyll a, c + fucoxanthin; laminarin/mannitol; cellulose + algin wall. Fucus, Laminaria, Sargassum, Dictyota.' };
}
function algaeDictyota() {
  const g = branchAlga(C.amber, 5, 1.1, 0.42, 0.1, true, false), labels = [];
  labels.push(L('Flat ribbon thallus', 'Regularly dichotomous branching', [-0.6, 0.4, 0]));
  labels.push(L('Apical cell', 'Growth by a single apical cell at each tip', [1.5, 1.8, 0]));
  labels.push(L('Holdfast', 'Basal attachment', [0, -2.2, 0]));
  return { g, labels, note: 'Dictyota — brown alga with flat dichotomously branched thallus; isomorphic alternation of generations.' };
}
function algaePorphyra() {
  const g = H.grp(), labels = [];
  const pts = []; for (let i = 0; i <= 40; i++) { for (let j = 0; j <= 20; j++) { } }
  const grid = new THREE.PlaneGeometry(4, 3, 30, 20); const pa = grid.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, 0.25 * Math.sin(x * 2.2) * Math.cos(y * 1.8) + 0.1 * Math.sin(y * 4)); } grid.computeVertexNormals();
  const m = new THREE.Mesh(grid, H.mat('#be123c', { side: THREE.DoubleSide, op: 0.85 })); g.add(m);
  g.add(H.sphere(0.2, C.brown, [-2, -1.5, 0]));
  labels.push(L('Membranous thallus', 'One cell thick sheet-like blade', [0.5, 0.5, 0.3]));
  labels.push(L('Holdfast', 'Small basal attachment disc', [-2, -1.5, 0]));
  labels.push(L('r-Phycoerythrin', 'Red pigment masks chlorophyll; deep-water photosynthesis', [1.5, -1, 0.2]));
  return { g, labels, note: 'Rhodophyceae (red algae): chlorophyll a, d + phycoerythrin; floridean starch; cellulose wall; Porphyra, Polysiphonia, Gracilaria, Gelidium.' };
}
function algaePolysiphonia() {
  const g = H.grp(), labels = [];
  const axis = []; for (let i = 0; i <= 10; i++) axis.push([0, -2 + i * 0.4, 0]);
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.add(H.tube(axis.map(p => [p[0] + 0.1 * Math.cos(a), p[1], p[2] + 0.1 * Math.sin(a)]), 0.06, '#e11d48', { seg: 30 })); }
  for (let i = 1; i <= 8; i++) { const y = -1.6 + i * 0.4, a = i * 2.1; const d = V3(Math.cos(a), 0.9, Math.sin(a)).normalize(); const p0 = V3(0.12 * Math.cos(a), y, 0.12 * Math.sin(a)); const p1 = p0.clone().add(d.clone().multiplyScalar(0.9)); g.add(H.rod(p0, p1, 0.045, '#fb7185')); const p2 = p1.clone().add(d.clone().multiplyScalar(0.5)).add(V3(0.2, 0.2, 0)); g.add(H.rod(p1, p2, 0.03, '#fda4af')); if (i === 5) g.add(H.sphere(0.22, C.pink, p1.toArray(), { op: 0.8 })); }
  labels.push(L('Polysiphonous axis', 'Central axial cell surrounded by pericentral cells', [0, 0.2, 0.15]));
  labels.push(L('Lateral branches', 'Repeatedly branched filaments', [0.9, 1.2, 0]));
  labels.push(L('Cystocarp', 'Urn-shaped structure producing carpospores', [-0.8, 0.5, -0.4]));
  return { g, labels, note: 'Polysiphonia — red alga; triphasic life cycle; oogamous with non-motile gametes; carpospores & tetraspores.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-3-1', unit: U1, ch: 'Ch 3 — Plant Kingdom', fig: 'Fig 3.1', title: 'Algae: Volvox, Fucus, Dictyota, Porphyra, Polysiphonia',
  desc: 'Algae are chlorophyll-bearing, simple, thalloid, autotrophic and largely aquatic organisms, classified into Chlorophyceae, Phaeophyceae and Rhodophyceae by pigments, stored food and cell wall.',
  points: ['Green: chl a, b; starch; cellulose. Brown: chl a, c, fucoxanthin; mannitol/laminarin; cellulose + algin. Red: chl a, d, phycoerythrin; floridean starch.', 'Flagella: green 2–8 equal apical; brown 2 unequal lateral; red none.', 'Agar from Gelidium & Gracilaria; carrageen from red algae; algin from brown algae; Chlorella & Spirulina — SCP.'],
  variants: [{ name: 'Volvox', build: algaeVolvox }, { name: 'Fucus', build: algaeFucus }, { name: 'Dictyota', build: algaeDictyota }, { name: 'Porphyra', build: algaePorphyra }, { name: 'Polysiphonia', build: algaePolysiphonia }]
}));

function bryoMarchantia(female) {
  const g = H.grp(), labels = [];
  // thallus: dichotomous flat lobes
  const lobe = (x, rot) => g.add(H.extrude([[0, 0], [0.5, 0.3], [0.9, 0.9], [0.8, 1.6], [0.5, 2.0], [0, 2.1], [-0.5, 2.0], [-0.8, 1.6], [-0.9, 0.9], [-0.5, 0.3]], 0.08, C.dgreen, [x, -1.5, 0], [-PI / 2, 0, rot]));
  lobe(-0.9, -0.3); lobe(0.9, 0.3);
  for (let i = 0; i < 8; i++) g.add(H.rod([-1.6 + i * 0.45, -1.55, 0.6 - (i % 3) * 0.3], [-1.6 + i * 0.45, -1.95, 0.6 - (i % 3) * 0.3], 0.015, C.white));
  // gemma cup
  g.add(H.lathe([[0.05, 0], [0.25, 0.05], [0.28, 0.3], [0.15, 0.32], [0.12, 0.1]], C.green, [-0.9, -1.45, 0.9], null, { seg: 20 }));
  for (let i = 0; i < 5; i++) g.add(H.sphere(0.04, C.lime, [-0.95 + i * 0.03, -1.35 + i * 0.02, 0.85 + (i % 2) * 0.08], { seg: 6 }));
  // reproductive stalk
  g.add(H.cyl(0.07, 0.09, 2.2, C.leaf, [0.9, -0.4, 0.4]));
  if (female) { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.add(H.rod([0.9, 0.7, 0.4], [0.9 + 0.8 * Math.cos(a), 0.45, 0.4 + 0.8 * Math.sin(a)], 0.05, C.leaf)); } g.add(H.sphere(0.15, C.leaf, [0.9, 0.7, 0.4])); }
  else { g.add(H.cyl(0.75, 0.75, 0.12, C.leaf, [0.9, 0.75, 0.4], null, { seg: 8 })); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.sphere(0.08, C.yellow, [0.9 + 0.5 * Math.cos(a), 0.83, 0.4 + 0.5 * Math.sin(a)], { seg: 8, e: 0.6 })); } }
  labels.push(L('Thallus', 'Dorsiventral, dichotomously branched, prostrate gametophyte', [-0.9, -1.4, -0.2]));
  labels.push(L('Rhizoids', 'Unicellular; attach & absorb (no true roots)', [-0.7, -1.9, 0.3]));
  labels.push(L('Gemma cup', 'Cup with gemmae — asexual reproduction', [-0.9, -1.3, 0.9]));
  labels.push(female ? L('Archegoniophore', 'Umbrella-like stalk bearing archegonia (female)', [0.9, 0.7, 0.4]) : L('Antheridiophore', 'Disc-like stalk bearing antheridia (male)', [0.9, 0.8, 0.4]));
  labels.push(L('Stalk', 'Raises the sex organs above the thallus', [0.9, -0.3, 0.4]));
  return { g, labels, note: 'Marchantia (liverwort): dioecious; gemmae in gemma cups; sporophyte = foot, seta, capsule.' };
}
function bryoFunaria() {
  const g = H.grp(), labels = [];
  g.add(H.cyl(0.05, 0.06, 1.4, C.dgreen, [0, -1.4, 0]));
  for (let i = 0; i < 14; i++) { const a = i * 2.4, y = -2.0 + i * 0.1; g.add(H.extrude([[0, 0], [0.12, 0.15], [0.1, 0.5], [0, 0.6], [-0.1, 0.5], [-0.12, 0.15]], 0.02, C.leaf, [0.08 * Math.cos(a), y, 0.08 * Math.sin(a)], [0.5 * Math.cos(a), -a, 0.5 * Math.sin(a) + 0.4])); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.tube([[0, -2.1, 0], [0.3 * Math.cos(a), -2.4, 0.3 * Math.sin(a)], [0.6 * Math.cos(a), -2.5, 0.6 * Math.sin(a)]], 0.015, C.brown)); }
  g.add(H.tube([[0, -0.7, 0], [0.05, 0.3, 0], [0.1, 1.2, 0], [0.4, 1.7, 0]], 0.03, C.orange));
  g.add(H.ell(0.24, 0.42, 0.24, C.amber, [0.55, 1.75, 0]));
  g.add(H.cone(0.18, 0.35, C.brown, [0.72, 2.05, 0], [0, 0, -0.6]));
  g.add(H.ring(0.08, 0.2, C.red, [0.66, 1.95, 0], [0.2, 0, -0.6]));
  labels.push(L('Capsule', 'Sporangium — spores by meiosis of spore mother cells', [0.55, 1.75, 0]));
  labels.push(L('Calyptra / operculum', 'Cap & lid over the capsule; peristome teeth beneath', [0.75, 2.1, 0]));
  labels.push(L('Seta', 'Stalk of the sporophyte', [0.07, 0.6, 0]));
  labels.push(L('Leafy gametophyte', 'Spirally arranged leaves on upright axis', [0.2, -1.3, 0.2]));
  labels.push(L('Rhizoids', 'Multicellular, branched', [0.5, -2.45, 0.3]));
  return { g, labels, note: 'Funaria (moss): protonema → leafy stage; sporophyte (foot, seta, capsule) attached to gametophyte; peristome teeth disperse spores.' };
}
function bryoSphagnum() {
  const g = H.grp(), labels = [];
  g.add(H.cyl(0.05, 0.06, 3, C.green, [0, -0.6, 0]));
  for (let i = 0; i < 9; i++) { const y = -1.9 + i * 0.4; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + i * 0.5; g.add(H.tube([[0, y, 0], [0.45 * Math.cos(a), y - 0.25, 0.45 * Math.sin(a)], [0.9 * Math.cos(a), y - 0.6, 0.9 * Math.sin(a)]], 0.03, C.lime)); } }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.add(H.tube([[0, 0.9, 0], [0.3 * Math.cos(a), 1.0, 0.3 * Math.sin(a)], [0.5 * Math.cos(a), 1.2, 0.5 * Math.sin(a)]], 0.03, C.lime)); }
  g.add(H.sphere(0.16, C.brown, [0.2, 1.6, 0])); g.add(H.rod([0.05, 1.05, 0], [0.2, 1.45, 0], 0.03, C.brown));
  labels.push(L('Capitulum', 'Compact head of young branches at apex', [0, 1.15, 0.3]));
  labels.push(L('Fascicles of branches', 'Spreading + pendent branches in clusters', [0.9, 0, 0.3]));
  labels.push(L('Capsule (sporophyte)', 'Globose, on pseudopodium', [0.2, 1.6, 0]));
  labels.push(L('Hyaline cells', 'Dead water-storing cells — hold 18–26× water (peat moss)', [-0.6, -1.2, 0.5]));
  return { g, labels, note: 'Sphagnum (peat moss): forms peat (fuel); used as packing material for trans-shipment of living material due to water-holding capacity.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-3-2', unit: U1, ch: 'Ch 3 — Plant Kingdom', fig: 'Fig 3.2', title: 'Bryophytes: Marchantia, Funaria, Sphagnum',
  desc: 'Bryophytes — "amphibians of the plant kingdom" — have a dominant free-living gametophyte; the sporophyte is attached and dependent on it.',
  points: ['No true roots/stem/leaves; rhizoids unicellular (liverworts) or multicellular (mosses).', 'Antheridium → biflagellate antherozoids; archegonium → one egg; water needed for fertilisation.', 'Sporophyte = foot + seta + capsule; spores → protonema (mosses).', 'Mosses: Funaria, Polytrichum, Sphagnum. Liverworts: Marchantia, Riccia.'],
  variants: [{ name: 'Marchantia ♂', build: () => bryoMarchantia(false) }, { name: 'Marchantia ♀', build: () => bryoMarchantia(true) }, { name: 'Funaria', build: bryoFunaria }, { name: 'Sphagnum', build: bryoSphagnum }]
}));

function pteroSelaginella() {
  const g = H.grp(), labels = [];
  const stem = [[-2.2, -1.2, 0], [-1.2, -0.9, 0.1], [0, -0.7, 0], [1.2, -0.5, -0.1], [2.2, -0.3, 0]];
  g.add(H.tube(stem, 0.06, C.dgreen, { seg: 30 }));
  const cur = new THREE.CatmullRomCurve3(stem.map(vec));
  for (let i = 0; i < 26; i++) { const t = i / 26; const p = cur.getPoint(t); const big = i % 2 === 0; g.add(H.extrude([[0, 0], [0.12, 0.08], [0.15, 0.3], [0, 0.4], [-0.1, 0.25]], 0.02, big ? C.leaf : C.lime, [p.x, p.y + 0.05, p.z + (big ? 0.35 : 0.12) * (i % 4 < 2 ? 1 : -1)], [-PI / 2 + 0.6, 0, (i % 4 < 2 ? -0.6 : 0.6)], { sx: big ? 1 : 0.6, sy: big ? 1 : 0.6 })); }
  g.add(H.cyl(0.14, 0.14, 0.9, C.amber, [2.3, 0.2, 0]));
  for (let i = 0; i < 10; i++) { const y = -0.2 + i * 0.09; g.add(H.sphere(0.06, i < 5 ? C.orange : C.yellow, [2.3 + 0.17 * Math.cos(i * 2.2), y, 0.17 * Math.sin(i * 2.2)], { seg: 8 })); }
  for (let i = 0; i < 3; i++) g.add(H.tube([[-1.8 + i * 1.2, -1.05 + i * 0.25, 0], [-1.8 + i * 1.2, -1.6, 0.1], [-1.7 + i * 1.2, -2.1, 0]], 0.025, C.bone));
  labels.push(L('Strobilus (cone)', 'Compact sporophylls: mega- (lower) & microsporophylls (upper)', [2.3, 0.2, 0]));
  labels.push(L('Microsporangia', 'Produce microspores → male gametophyte', [2.3, 0.5, 0.2]));
  labels.push(L('Megasporangia', 'Produce megaspores → female gametophyte (retained)', [2.3, -0.1, 0.2]));
  labels.push(L('Dimorphic leaves', 'Two rows large + two rows small microphylls', [0, -0.6, 0.35]));
  labels.push(L('Rhizophore', 'Leafless branch bearing roots', [-1.75, -1.8, 0]));
  return { g, labels, note: 'Selaginella & Salvinia are heterosporous — precursor to seed habit; ligule on leaf base.' };
}
function pteroEquisetum() {
  const g = H.grp(), labels = [];
  for (let i = 0; i < 6; i++) { g.add(H.cyl(0.1, 0.11, 0.7, C.green, [0, -2 + i * 0.75, 0], null, { seg: 14 })); g.add(H.cyl(0.14, 0.14, 0.1, C.dgreen, [0, -1.6 + i * 0.75, 0], null, { seg: 14 })); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; g.add(H.rod([0.13 * Math.cos(a), -1.6 + i * 0.75, 0.13 * Math.sin(a)], [0.55 * Math.cos(a), -1.3 + i * 0.75, 0.55 * Math.sin(a)], 0.02, C.lime)); } }
  g.add(H.ell(0.24, 0.55, 0.24, C.amber, [0, 2.75, 0]));
  for (let i = 0; i < 24; i++) { const a = i * 1.9, y = 2.35 + (i % 6) * 0.15; g.add(H.cyl(0.06, 0.06, 0.05, C.brown, [0.24 * Math.cos(a), y, 0.24 * Math.sin(a)], [Math.sin(a) * 1.57, 0, Math.cos(a) * 1.57], { seg: 6 })); }
  labels.push(L('Strobilus (cone)', 'Terminal; sporangiophores bear sporangia; homosporous', [0, 2.75, 0]));
  labels.push(L('Node with whorl of branches', 'Jointed, ridged stem — "horsetail"', [0.5, -1.3, 0]));
  labels.push(L('Internode (ribbed, hollow)', 'Silica-impregnated; photosynthetic stem', [0, -0.5, 0.12]));
  labels.push(L('Scale leaves', 'Small, fused into a sheath at nodes', [0.14, 0.65, 0]));
  return { g, labels, note: 'Equisetum (Sphenopsida): jointed stem with reduced scale leaves; homosporous; sporangia on sporangiophores in strobilus.' };
}
function pteroFern() {
  const g = H.grp(), labels = [];
  g.add(H.ell(0.6, 0.35, 0.5, C.brown, [0, -2.1, 0]));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.tube([[0.3 * Math.cos(a), -2.2, 0.3 * Math.sin(a)], [0.6 * Math.cos(a), -2.5, 0.6 * Math.sin(a)]], 0.02, C.white)); }
  const frond = (rot, lean) => { const f = H.grp([], [0, -1.9, 0], [lean, rot, 0]); f.add(H.tube([[0, 0, 0], [0.1, 1.2, 0], [0.15, 2.4, 0], [0.1, 3.6, 0]], 0.04, C.dgreen)); for (let i = 1; i < 12; i++) { const y = 0.9 + i * 0.22, l = 0.9 * Math.sin((i / 12) * PI) + 0.2; f.add(H.extrude([[0, 0], [l, 0.06], [l + 0.1, 0], [l, -0.06]], 0.02, C.leaf, [0.12, y, 0], [0, 0, 0.1])); f.add(H.extrude([[0, 0], [-l, 0.06], [-l - 0.1, 0], [-l, -0.06]], 0.02, C.leaf, [0.12, y, 0], [0, 0, -0.1])); if (i % 2 === 0) for (let k = 1; k < 4; k++) f.add(H.sphere(0.035, C.brown, [0.12 + k * l / 4, y - 0.005, -0.015], { seg: 6 })); } return f; };
  g.add(frond(0, 0.2)); g.add(frond(2.1, 0.35)); g.add(frond(4.2, 0.3));
  g.add(H.tube([[-0.1, -1.9, 0.4], [-0.15, -1.3, 0.55], [-0.1, -0.9, 0.5]], 0.05, C.lime)); g.add(H.torus(0.13, 0.05, C.lime, [-0.06, -0.75, 0.5], [0, 0, 0]));
  labels.push(L('Frond (leaf, pinnate)', 'Large leaves — megaphylls; compound pinnae', [1.2, 0.6, 0.6]));
  labels.push(L('Sori (on lower surface)', 'Clusters of sporangia; spores by meiosis; homosporous', [0.6, 0.8, -0.1]));
  labels.push(L('Rhizome (stem)', 'Underground/creeping stem with scales', [0, -2.1, 0]));
  labels.push(L('Adventitious roots', 'Arise from rhizome', [0.45, -2.45, 0.3]));
  labels.push(L('Circinate vernation', 'Young leaf coiled (fiddlehead)', [-0.06, -0.75, 0.5]));
  return { g, labels, note: 'Fern (Dryopteris, Pteris, Adiantum): sporophyte dominant; spores → prothallus (gametophyte) needs water for fertilisation.' };
}
function pteroSalvinia() {
  const g = H.grp(), labels = [];
  g.add(H.plane(6, 4, C.blue, [0, -0.6, 0], [-PI / 2, 0, 0], { op: 0.15, dw: false }));
  g.add(H.tube([[-2, -0.55, 0], [-0.7, -0.5, 0.1], [0.7, -0.5, -0.1], [2, -0.55, 0]], 0.05, C.dgreen));
  for (let i = 0; i < 4; i++) { const x = -1.6 + i * 1.05; g.add(H.ell(0.45, 0.06, 0.32, C.leaf, [x, -0.42, 0.45])); g.add(H.ell(0.45, 0.06, 0.32, C.leaf, [x, -0.42, -0.45])); for (let k = 0; k < 8; k++) g.add(H.tube([[x - 0.3 + k * 0.08, -0.55, 0], [x - 0.3 + k * 0.08 + 0.05, -1.1, 0.05], [x - 0.3 + k * 0.08, -1.6, -0.05]], 0.012, C.grey)); if (i % 2) { g.add(H.sphere(0.12, C.amber, [x, -1.0, 0])); g.add(H.sphere(0.18, C.orange, [x + 0.25, -1.15, 0.1])); } }
  labels.push(L('Floating leaves (pair)', 'Green, hairy, water-repellent upper surface', [0.4, -0.4, 0.45]));
  labels.push(L('Submerged leaf', 'Root-like, dissected — absorbs water', [0.5, -1.2, 0]));
  labels.push(L('Microsporocarp', 'Contains microsporangia (many microspores)', [-0.55, -1.0, 0]));
  labels.push(L('Megasporocarp', 'Contains megasporangia (one megaspore each)', [-0.3, -1.15, 0.1]));
  labels.push(L('Horizontal stem', 'Free-floating aquatic fern; no true roots', [-1.3, -0.5, 0]));
  return { g, labels, note: 'Salvinia — heterosporous water fern; sporocarps; female gametophyte retained on parent sporophyte (seed-habit precursor).' };
}
reg(Object.assign({}, B11, {
  id: 'b11-3-3', unit: U1, ch: 'Ch 3 — Plant Kingdom', fig: 'Fig 3.3', title: 'Pteridophytes: Selaginella, Equisetum, Fern, Salvinia',
  desc: 'Pteridophytes are the first terrestrial plants with vascular tissues (xylem & phloem). The sporophyte is dominant with true roots, stem and leaves.',
  points: ['Classes: Psilopsida (Psilotum), Lycopsida (Selaginella, Lycopodium), Sphenopsida (Equisetum), Pteropsida (Dryopteris, Pteris, Adiantum).', 'Mostly homosporous; Selaginella & Salvinia heterosporous.', 'Gametophyte = prothallus (free-living, needs water) → antheridia & archegonia.', 'Leaves: microphylls (Selaginella) or macrophylls (ferns).'],
  variants: [{ name: 'Selaginella', build: pteroSelaginella }, { name: 'Equisetum', build: pteroEquisetum }, { name: 'Fern', build: pteroFern }, { name: 'Salvinia', build: pteroSalvinia }]
}));

function gymnoCycas() {
  const g = H.grp(), labels = [];
  g.add(H.cyl(0.55, 0.7, 2.6, C.brown, [0, -1.2, 0], null, { seg: 18 }));
  for (let i = 0; i < 60; i++) { const a = i * 2.39, y = -2.4 + (i / 60) * 2.5; g.add(H.box(0.22, 0.12, 0.1, '#78350f', [0.62 * Math.cos(a), y, 0.62 * Math.sin(a)], [0, -a, 0])); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const f = H.grp([], [0.3 * Math.cos(a), 0.1, 0.3 * Math.sin(a)], [0, -a, 0]); f.add(H.tube([[0, 0, 0], [1.2, 0.9, 0], [2.4, 0.9, 0], [3.3, 0.4, 0]], 0.035, C.dgreen)); const cur = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(1.2, 0.9, 0), V3(2.4, 0.9, 0), V3(3.3, 0.4, 0)]); for (let k = 3; k < 22; k++) { const p = cur.getPoint(k / 22); f.add(H.box(0.04, 0.02, 0.6, C.leaf, [p.x, p.y, p.z], [0, 0, 0.3])); } g.add(f); }
  g.add(H.ell(0.5, 0.9, 0.5, C.amber, [0, 0.9, 0]));
  for (let i = 0; i < 40; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * i / 40); g.add(H.box(0.12, 0.06, 0.12, C.orange, [0.5 * Math.sin(b) * Math.cos(a), 0.9 + 0.9 * Math.cos(b), 0.5 * Math.sin(b) * Math.sin(a)], [0, -a, 0])); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.tube([[0.3 * Math.cos(a), -2.5, 0.3 * Math.sin(a)], [0.9 * Math.cos(a), -2.9, 0.9 * Math.sin(a)]], 0.06, C.bone)); }
  g.add(H.tube([[0.9, -2.85, 0], [1.2, -2.6, 0.2], [1.5, -2.7, 0.3]], 0.05, C.bone)); for (let i = 0; i < 5; i++) g.add(H.sphere(0.08, C.teal, [1.3 + i * 0.06, -2.55 + (i % 2) * 0.1, 0.25 + i * 0.03], { seg: 8 }));
  labels.push(L('Male cone (strobilus)', 'Compact microsporophylls with microsporangia', [0, 1.4, 0.4]));
  labels.push(L('Pinnate leaves (crown)', 'Large pinnately compound; circinate when young', [2.2, 1.1, 0]));
  labels.push(L('Persistent leaf bases', 'Armour of old leaf bases on the unbranched stem', [0.62, -1.4, 0]));
  labels.push(L('Coralloid roots', 'Associated with N₂-fixing cyanobacteria', [1.4, -2.6, 0.3]));
  labels.push(L('Tap root', 'Stem is columnar & unbranched', [0.5, -2.9, 0]));
  return { g, labels, note: 'Cycas: dioecious; megasporophylls loose (no female cone); ovules naked; coralloid roots with Anabaena.' };
}
function gymnoPinus() {
  const g = H.grp(), labels = [];
  g.add(H.cyl(0.08, 0.14, 4, C.brown, [0, -0.6, 0]));
  for (let i = 0; i < 14; i++) { const a = i * 2.39, y = -2.2 + i * 0.28; const len = 1.9 - i * 0.11; const d = V3(Math.cos(a), 0.15, Math.sin(a)).normalize(); const p0 = V3(0, y, 0), p1 = p0.clone().add(d.clone().multiplyScalar(len)); g.add(H.rod(p0, p1, 0.03, C.brown)); for (let k = 2; k < 12; k++) { const p = p0.clone().lerp(p1, k / 12); for (let n = 0; n < 2; n++) { const q = p.clone().add(V3(Math.cos(a + 1.5 + n * 3.14) * 0.05, 0.3, Math.sin(a + 1.5 + n * 3.14) * 0.05)); g.add(H.rod(p, q.clone().add(V3(Math.cos(a + 1.5 + n * 3.14) * 0.25, 0, Math.sin(a + 1.5 + n * 3.14) * 0.25)), 0.012, C.dgreen, { seg: 4 })); } } }
  g.add(H.ell(0.3, 0.6, 0.3, C.brown, [1.2, 0.2, 0.6]));
  for (let i = 0; i < 40; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * i / 40); g.add(H.box(0.1, 0.05, 0.14, '#92400e', [1.2 + 0.3 * Math.sin(b) * Math.cos(a), 0.2 + 0.6 * Math.cos(b), 0.6 + 0.3 * Math.sin(b) * Math.sin(a)], [0, -a, 0.3])); }
  for (let i = 0; i < 5; i++) g.add(H.ell(0.05, 0.14, 0.05, C.yellow, [-1.2 + i * 0.06, 0.9 + (i % 2) * 0.05, -0.5 + i * 0.05]));
  g.add(H.sphere(0.35, C.brown, [0, -2.65, 0], { sy: 0.3 })); for (let i = 0; i < 12; i++) { const a = i * 2.39; g.add(H.sphere(0.04, C.white, [0.35 * Math.cos(a), -2.7 - (i % 3) * 0.05, 0.35 * Math.sin(a)], { seg: 6 })); }
  labels.push(L('Needle leaves (in pairs)', 'Foliage leaves on dwarf shoots — reduce water loss', [1.6, -1.5, 0.3]));
  labels.push(L('Female cone (megastrobilus)', 'Woody scales bearing naked ovules', [1.2, 0.2, 0.6]));
  labels.push(L('Male cones (microstrobili)', 'Small, clustered; winged pollen', [-1.1, 0.95, -0.4]));
  labels.push(L('Long shoot (unlimited growth)', 'Bears dwarf shoots of limited growth', [0, 0.5, 0]));
  labels.push(L('Mycorrhizal roots', 'Fungal association aids absorption', [0.2, -2.7, 0.3]));
  return { g, labels, note: 'Pinus: monoecious; needle leaves with thick cuticle & sunken stomata; wind pollination; naked seeds on cone scales.' };
}
function gymnoGinkgo() {
  const g = H.grp(), labels = [];
  g.add(H.tube([[0, -2.4, 0], [0.05, -1, 0], [0.1, 0.5, 0]], 0.09, C.brown));
  g.add(H.tube([[0.08, 0.2, 0], [0.8, 0.9, 0.2], [1.5, 1.2, 0.3]], 0.05, C.brown)); g.add(H.tube([[0.05, -0.3, 0], [-0.7, 0.4, -0.2], [-1.4, 0.7, -0.3]], 0.05, C.brown));
  const fan = (pos, rot) => { const pts = [[0, 0]]; for (let i = 0; i <= 14; i++) { const a = -0.75 + i / 14 * 1.5; const r = 0.55 + 0.05 * Math.sin(i * 1.7); pts.push([r * Math.sin(a), r * Math.cos(a)]); } g.add(H.extrude(pts, 0.015, C.lime, pos, rot)); };
  fan([1.5, 1.25, 0.3], [-0.6, 0.2, 0.3]); fan([1.1, 1.05, 0.1], [-0.9, 0.5, -0.4]); fan([-1.4, 0.75, -0.3], [-0.6, -0.3, -0.5]); fan([-0.9, 0.55, -0.4], [-1.0, 0.4, 0.3]); fan([0.1, 0.55, 0], [-0.7, 0, 0]);
  for (let i = 0; i < 3; i++) { g.add(H.cyl(0.08, 0.08, 0.25, C.brown, [0.8 + i * 0.25, 0.95 + i * 0.05, 0.2], null, { seg: 8 })); }
  g.add(H.sphere(0.14, C.amber, [-0.6, 0.35, -0.2])); g.add(H.rod([-0.6, 0.35, -0.2], [-0.75, 0.55, -0.22], 0.02, C.brown));
  labels.push(L('Fan-shaped leaf', 'Dichotomous venation; bilobed blade — "maidenhair tree"', [1.5, 1.6, 0.3]));
  labels.push(L('Spur (dwarf) shoots', 'Leaves clustered on short shoots', [0.9, 0.95, 0.2]));
  labels.push(L('Ovule (naked)', 'Paired ovules on a stalk; seed with fleshy outer coat', [-0.6, 0.35, -0.2]));
  labels.push(L('Long shoot', 'Woody, branched stem', [0.05, -1, 0]));
  return { g, labels, note: 'Ginkgo biloba — a "living fossil"; dioecious; motile (multiflagellate) sperms like Cycas.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-3-4', unit: U1, ch: 'Ch 3 — Plant Kingdom', fig: 'Fig 3.4', title: 'Gymnosperms: Cycas, Pinus, Ginkgo',
  desc: 'Gymnosperms bear naked ovules — not enclosed by an ovary wall — so seeds are exposed on megasporophylls. Sporophyte dominant; heterosporous; gametophytes reduced and dependent.',
  points: ['Tap roots; coralloid roots (Cycas, with cyanobacteria); mycorrhiza (Pinus).', 'Male cones (microsporophylls) & female cones (megasporophylls); Cycas megasporophylls not in cones.', 'Pollen carried by wind to micropyle; pollen tube; seeds naked; no fruit.', 'Sequoia (giant redwood) is the tallest tree; Ginkgo & Cycas have motile sperms.'],
  variants: [{ name: 'Cycas', build: gymnoCycas }, { name: 'Pinus', build: gymnoPinus }, { name: 'Ginkgo', build: gymnoGinkgo }]
}));


/* ---------- Ch 4 Animal Kingdom ---------- */
function akSymmetry() {
  const g = H.grp(), labels = [];
  // radial: starfish-like disc with 5 arms
  const star = H.grp([], [-1.7, 0, 0]);
  star.add(H.cyl(0.5, 0.5, 0.2, C.orange, null, null, { seg: 20 }));
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; star.add(H.ell(0.9, 0.12, 0.28, C.orange, [0.9 * Math.cos(a), 0, 0.9 * Math.sin(a)], { rot: [0, -a, 0] })); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + PI / 5; star.add(H.plane(3.2, 0.01, C.white, [0, 0.12, 0], [PI / 2, 0, a], { op: 0.5 })); }
  g.add(star);
  // bilateral: fish-like body with single sagittal plane
  const fish = H.grp([], [1.7, 0, 0]);
  fish.add(H.ell(1.2, 0.5, 0.35, C.teal, [0, 0, 0]));
  fish.add(H.extrude([[0, 0], [0.6, 0.5], [0.6, -0.5]], 0.05, C.cyan, [1.25, 0, 0], [0, 0, 0]));
  fish.add(H.sphere(0.07, C.ink, [-0.75, 0.15, 0.3]));
  fish.add(H.plane(3.2, 1.6, C.white, [0, 0, 0], [0, PI / 2, 0], { op: 0.3 }));
  g.add(fish);
  labels.push(L('Radial symmetry', 'Any plane through central axis divides into identical halves', [-1.7, 0.2, 0]));
  labels.push(L('Central axis (oral–aboral)', 'Coelenterates, ctenophores, echinoderms (adults)', [-1.7, -0.3, 0.6]));
  labels.push(L('Bilateral symmetry', 'Only ONE sagittal plane gives identical left & right halves', [1.7, 0.6, 0]));
  labels.push(L('Sagittal plane', 'Annelids, arthropods, chordates', [1.7, -0.6, 0]));
  return { g, labels, note: 'Sponges are asymmetrical. Radial: coelenterates, ctenophores, echinoderms. Bilateral: from platyhelminthes onward.' };
}
function akLayers() {
  const g = H.grp(), labels = [];
  const dip = H.grp([], [-1.6, 0, 0]);
  dip.add(H.annulus(1.1, 0.9, 1.2, C.blue, null, { op: 0.85 }));
  dip.add(H.annulus(0.9, 0.72, 1.2, C.yellow, null, { op: 0.5 }));
  dip.add(H.annulus(0.72, 0.55, 1.2, C.pink, null, { op: 0.85 }));
  g.add(dip);
  const trip = H.grp([], [1.6, 0, 0]);
  trip.add(H.annulus(1.1, 0.9, 1.2, C.blue, null, { op: 0.85 }));
  trip.add(H.annulus(0.9, 0.72, 1.2, C.red, null, { op: 0.85 }));
  trip.add(H.annulus(0.72, 0.55, 1.2, C.pink, null, { op: 0.85 }));
  g.add(trip);
  labels.push(L('Ectoderm (outer)', 'Diploblastic: e.g. coelenterates', [-1.6, 0.6, 1.0]));
  labels.push(L('Mesoglea', 'Undifferentiated jelly between the two layers', [-1.6, 0.6, 0.8]));
  labels.push(L('Endoderm (inner)', 'Lines the gastrovascular cavity', [-1.6, 0.6, 0.62]));
  labels.push(L('Ectoderm', 'Triploblastic: platyhelminthes → chordates', [1.6, 0.6, 1.0]));
  labels.push(L('Mesoderm (third layer)', 'Gives muscles, coelom lining, organs', [1.6, 0.6, 0.8]));
  labels.push(L('Endoderm', 'Inner germ layer', [1.6, 0.6, 0.62]));
  return { g, labels, note: 'Diploblastic: coelenterates (mesoglea). Triploblastic: three germ layers — from Platyhelminthes onwards.' };
}
function akCoelom() {
  const g = H.grp(), labels = [];
  const mk = (x, kind) => {
    const s = H.grp([], [x, 0, 0]);
    s.add(H.annulus(1.0, 0.85, 1.0, C.blue));
    if (kind === 'a') { s.add(H.annulus(0.85, 0.32, 1.0, C.red, null, { op: 0.9 })); s.add(H.annulus(0.32, 0.22, 1.0, C.yellow)); }
    if (kind === 'p') { s.add(H.annulus(0.85, 0.7, 1.0, C.red)); s.add(H.annulus(0.7, 0.34, 1.0, C.cyan, null, { op: 0.15, dw: false })); s.add(H.annulus(0.34, 0.24, 1.0, C.yellow)); }
    if (kind === 'c') { s.add(H.annulus(0.85, 0.7, 1.0, C.red)); s.add(H.annulus(0.7, 0.5, 1.0, C.cyan, null, { op: 0.15, dw: false })); s.add(H.annulus(0.5, 0.36, 1.0, C.red)); s.add(H.annulus(0.36, 0.26, 1.0, C.yellow)); }
    g.add(s);
  };
  mk(-2.3, 'a'); mk(0, 'p'); mk(2.3, 'c');
  labels.push(L('Acoelomate', 'No body cavity; mesoderm solid (Platyhelminthes)', [-2.3, 0.5, 0.6]));
  labels.push(L('Pseudocoelomate', 'Cavity NOT lined by mesoderm — scattered pouches (Aschelminthes)', [0, 0.5, 0.5]));
  labels.push(L('Coelomate', 'True coelom lined by mesoderm (annelids → chordates)', [2.3, 0.5, 0.6]));
  labels.push(L('Ectoderm', 'Outer body wall', [-2.3, 0.5, 0.95]));
  labels.push(L('Gut (endoderm)', 'Central alimentary canal', [2.3, 0.5, 0.3]));
  labels.push(L('Mesoderm lining', 'Peritoneum lining the true coelom', [2.3, 0.5, 0.43]));
  return { g, labels, note: 'Coelomates: annelids, molluscs, arthropods, echinoderms, hemichordates, chordates. Pseudocoelomates: Aschelminthes. Acoelomates: Platyhelminthes.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-4-1', unit: U1, ch: 'Ch 4 — Animal Kingdom', fig: 'Fig 4.1–4.4', title: 'Symmetry, germ layers & coelom types',
  desc: 'Basis of animal classification: levels of organisation, symmetry, diploblastic/triploblastic organisation, coelom, segmentation and notochord.',
  points: ['Levels: cellular (sponges) → tissue (coelenterates) → organ (platyhelminthes) → organ-system.', 'Circulatory: open (arthropods, molluscs) vs closed (annelids, chordates).', 'Metamerism: segmentation with serial repetition (earthworm).', 'Notochord: mesodermal rod on dorsal side — present in chordates.'],
  variants: [{ name: 'Symmetry', build: akSymmetry }, { name: 'Germ layers', build: akLayers }, { name: 'Coelom', build: akCoelom }]
}));

/* phylum representatives */
function phSycon() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0.55, -2], [0.75, -1.4], [0.8, 0], [0.75, 1.2], [0.55, 1.7], [0.45, 1.75], [0.45, 1.2], [0.5, 0], [0.45, -1.4], [0, -1.6]], C.amber, null, null, { seg: 30, op: 0.85 }));
  const rng = H.rng(8); for (let i = 0; i < 120; i++) { const a = rng() * TAU, y = -1.6 + rng() * 3; g.add(H.sphere(0.05, C.ink, [0.8 * Math.cos(a), y, 0.8 * Math.sin(a)], { seg: 5 })); }
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; g.add(H.rod([0.4 * Math.cos(a), 1.75, 0.4 * Math.sin(a)], [0.55 * Math.cos(a), 2.15, 0.55 * Math.sin(a)], 0.015, C.white)); }
  g.add(H.arrow([0, -0.5, 0], [0, 2.3, 0], C.cyan, { r: 0.02, head: 0.25 }));
  g.add(H.sphere(0.35, C.grey, [0, -2.05, 0], { sy: 0.4 }));
  labels.push(L('Osculum', 'Large opening — water exits', [0, 1.85, 0.45]));
  labels.push(L('Ostia', 'Minute pores — water enters', [0.8, 0.4, 0]));
  labels.push(L('Spongocoel', 'Central cavity lined by choanocytes', [0, 0, 0]));
  labels.push(L('Spicules / spongin', 'Skeleton support', [0.5, 2.0, 0.3]));
  labels.push(L('Water canal system', 'Ostia → spongocoel → osculum; feeding, respiration, excretion', [0, 1.2, 0]));
  return { g, labels, note: 'Porifera (Sycon, Spongilla, Euspongia): cellular level; choanocytes (collar cells); hermaphrodite; internal fertilisation; indirect development.' };
}
function phAurelia() {
  const g = H.grp(), labels = [];
  g.add(H.sphere(1.6, C.cyan, [0, 0, 0], { theta: PI / 2, op: 0.35, side: THREE.DoubleSide, dw: false }));
  g.add(H.sphere(1.5, C.blue, [0, 0.05, 0], { theta: PI / 2, op: 0.15, side: THREE.DoubleSide, dw: false }));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.add(H.torus(0.42, 0.14, C.pink, [0.55 * Math.cos(a), 0.55, 0.55 * Math.sin(a)], [PI / 2, 0, 0], { op: 0.8 })); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; g.add(H.tube([[1.55 * Math.cos(a), 0, 1.55 * Math.sin(a)], [1.6 * Math.cos(a), -0.6, 1.6 * Math.sin(a)], [1.5 * Math.cos(a), -1.3, 1.5 * Math.sin(a)]], 0.015, C.white)); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; g.add(H.tube([[0.15 * Math.cos(a), 0, 0.15 * Math.sin(a)], [0.4 * Math.cos(a), -0.9, 0.4 * Math.sin(a)], [0.5 * Math.cos(a), -1.9, 0.5 * Math.sin(a)]], 0.06, C.grey, { op: 0.8 })); }
  g.add(H.cyl(0.15, 0.2, 0.3, C.grey, [0, -0.1, 0]));
  labels.push(L('Umbrella (bell)', 'Medusa — free-swimming, umbrella-shaped', [0, 1.6, 0]));
  labels.push(L('Gonads (4 horseshoe)', 'Seen through the transparent bell', [0.55, 0.55, 0.55]));
  labels.push(L('Marginal tentacles', 'Bear cnidoblasts (nematocysts) for anchorage, defence, prey capture', [1.55, -0.5, 0]));
  labels.push(L('Oral arms', 'Four frilled arms around the mouth (manubrium)', [0.5, -1.7, 0.5]));
  labels.push(L('Mouth', 'Opens into gastro-vascular cavity', [0, -0.25, 0]));
  return { g, labels, note: 'Cnidaria (Aurelia jellyfish): medusa form; metagenesis in Obelia (polyp ↔ medusa); tissue level; diploblastic; radial symmetry.' };
}
function phPleurobrachia() {
  const g = H.grp(), labels = [];
  g.add(H.ell(0.9, 1.15, 0.9, C.cyan, [0, 0, 0], { op: 0.35, side: THREE.DoubleSide, dw: false }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; const pts = []; for (let k = 0; k <= 12; k++) { const t = -PI / 2 + 0.25 + k / 12 * (PI - 0.5); pts.push([0.92 * Math.cos(t) * Math.cos(a), 1.17 * Math.sin(t), 0.92 * Math.cos(t) * Math.sin(a)]); } g.add(H.tube(pts, 0.03, C.pink, { seg: 24 })); for (let k = 1; k < 12; k++) { const p = pts[k]; g.add(H.box(0.12, 0.03, 0.05, C.white, p, [0, -a, 0])); } }
  g.add(H.tube([[0.7, -0.5, 0], [1.6, -1.0, 0.2], [2.3, -0.3, 0.5], [2.9, -1.1, 0.3]], 0.025, C.yellow)); g.add(H.tube([[-0.7, -0.5, 0], [-1.6, -1.0, -0.2], [-2.3, -0.3, -0.5], [-2.9, -1.1, -0.3]], 0.025, C.yellow));
  g.add(H.sphere(0.1, C.ink, [0, -1.15, 0])); g.add(H.sphere(0.08, C.purple, [0, 1.15, 0]));
  labels.push(L('Comb plates (8 rows)', 'Ciliary comb plates for locomotion', [0.92, 0.3, 0]));
  labels.push(L('Tentacles (2)', 'Bear colloblasts (adhesive cells) — no nematocysts', [2.3, -0.3, 0.5]));
  labels.push(L('Mouth', 'At the oral end', [0, -1.15, 0]));
  labels.push(L('Statocyst (aboral)', 'Sense organ at the aboral pole', [0, 1.15, 0]));
  labels.push(L('Transparent body', 'Bioluminescence — light emission', [-0.9, 0.3, 0.3]));
  return { g, labels, note: 'Ctenophora (Pleurobrachia, Ctenoplana): sea walnuts/comb jellies; exclusively marine; diploblastic; hermaphrodite; digestion extra- & intracellular.' };
}
function phTaenia() {
  const g = H.grp(), labels = [];
  g.add(H.sphere(0.32, C.bone, [0, 2.2, 0]));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.add(H.torus(0.1, 0.04, C.grey, [0.3 * Math.cos(a), 2.15, 0.3 * Math.sin(a)], [0, a, PI / 2])); }
  g.add(H.cyl(0.12, 0.12, 0.1, C.amber, [0, 2.55, 0])); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.add(H.cone(0.02, 0.1, C.ink, [0.13 * Math.cos(a), 2.6, 0.13 * Math.sin(a)], [Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9], { seg: 5 })); }
  g.add(H.cyl(0.12, 0.2, 0.7, C.bone, [0, 1.55, 0]));
  let y = 1.1; for (let i = 0; i < 12; i++) { const w = 0.3 + i * 0.09, h = 0.18 + i * 0.03; g.add(H.box(w, h - 0.03, 0.12, i > 8 ? C.amber : C.bone, [0, y, 0])); if (i > 3) g.add(H.sphere(0.03 + i * 0.006, C.pink, [0, y, 0.07], { seg: 8 })); y -= h; }
  labels.push(L('Scolex', 'Head with 4 suckers & rostellum with hooks — attachment', [0, 2.2, 0.32]));
  labels.push(L('Rostellum with hooks', 'Ring of hooks at the apex', [0, 2.6, 0.13]));
  labels.push(L('Neck', 'Region of proglottid formation (strobilation)', [0, 1.55, 0.2]));
  labels.push(L('Immature proglottids', 'Young segments near the neck', [0, 0.9, 0.1]));
  labels.push(L('Mature proglottids', 'Each with complete male & female organs', [0, -0.5, 0.1]));
  labels.push(L('Gravid proglottids', 'Filled with eggs; shed in faeces', [0, -1.8, 0.1]));
  return { g, labels, note: 'Platyhelminthes (Taenia, Fasciola): dorsoventrally flattened; acoelomate; flame cells for osmoregulation/excretion; hermaphrodite; hooks & suckers in parasites.' };
}
function phNereis() {
  const g = H.grp(), labels = [];
  const N = 22; for (let i = 0; i < N; i++) { const x = -2.8 + i * 0.26; g.add(H.cyl(0.22, 0.22, 0.24, i % 2 ? C.orange : C.amber, [x, 0, 0], [0, 0, PI / 2], { seg: 16 })); if (i > 1) { g.add(H.ell(0.08, 0.06, 0.25, C.red, [x, 0, 0.35])); g.add(H.ell(0.08, 0.06, 0.25, C.red, [x, 0, -0.35])); for (let k = 0; k < 3; k++) { g.add(H.rod([x, 0, 0.5], [x + (k - 1) * 0.06, 0.05, 0.7], 0.01, C.white, { seg: 4 })); g.add(H.rod([x, 0, -0.5], [x + (k - 1) * 0.06, 0.05, -0.7], 0.01, C.white, { seg: 4 })); } } }
  g.add(H.sphere(0.24, C.amber, [-2.95, 0, 0])); for (let i = 0; i < 4; i++) g.add(H.tube([[-3.1, 0.05, (i - 1.5) * 0.12], [-3.5, 0.2, (i - 1.5) * 0.25], [-3.9, 0.1, (i - 1.5) * 0.3]], 0.015, C.white));
  g.add(H.sphere(0.05, C.ink, [-3.1, 0.15, 0.1])); g.add(H.sphere(0.05, C.ink, [-3.1, 0.15, -0.1]));
  labels.push(L('Prostomium + tentacles', 'Head with eyes, palps, tentacles (cirri)', [-3.1, 0.2, 0]));
  labels.push(L('Metameric segments', 'Body segmented serially (metamerism)', [0, 0.25, 0]));
  labels.push(L('Parapodia', 'Lateral fleshy appendages for swimming', [1.0, 0, 0.4]));
  labels.push(L('Setae (chaetae)', 'Chitinous bristles on parapodia', [1.0, 0.05, 0.7]));
  labels.push(L('Closed circulatory system', 'Nephridia for excretion; ventral nerve cord', [-1.3, -0.25, 0]));
  return { g, labels, note: 'Annelida (Nereis, Pheretima, Hirudinaria): metameric; coelomate; closed circulation; nephridia; Nereis dioecious & aquatic; earthworm & leech monoecious.' };
}
function phButterfly() {
  const g = H.grp(), labels = [];
  g.add(H.sphere(0.2, C.ink, [0, 1.1, 0])); g.add(H.ell(0.28, 0.45, 0.25, C.dgrey, [0, 0.5, 0])); g.add(H.capsule(0.16, 1.4, C.ink, [0, -0.85, 0]));
  g.add(H.tube([[0.1, 1.25, 0], [0.4, 1.8, 0], [0.55, 2.3, 0]], 0.02, C.ink)); g.add(H.tube([[-0.1, 1.25, 0], [-0.4, 1.8, 0], [-0.55, 2.3, 0]], 0.02, C.ink)); g.add(H.sphere(0.05, C.ink, [0.55, 2.3, 0])); g.add(H.sphere(0.05, C.ink, [-0.55, 2.3, 0]));
  g.add(H.sphere(0.07, C.red, [0.15, 1.15, 0.15])); g.add(H.sphere(0.07, C.red, [-0.15, 1.15, 0.15]));
  const wing = (mir) => { const s = mir ? -1 : 1; g.add(H.extrude([[0, 0.3], [s * 0.8, 1.4], [s * 2.2, 1.6], [s * 2.6, 0.9], [s * 1.9, 0.2], [s * 0.8, 0.1]], 0.03, C.orange, [s * 0.2, 0.6, 0], [0, s * 0.2, 0], { op: 0.9 })); g.add(H.extrude([[0, 0], [s * 1.5, -0.2], [s * 2.0, -1.0], [s * 1.2, -1.6], [s * 0.4, -1.0]], 0.03, C.amber, [s * 0.2, 0.3, -0.02], [0, s * 0.2, 0], { op: 0.9 })); };
  wing(false); wing(true);
  for (let i = 0; i < 3; i++) { g.add(H.tube([[0.2, 0.7 - i * 0.25, 0.1], [0.6, 0.4 - i * 0.3, 0.3], [0.8, -0.1 - i * 0.3, 0.2]], 0.02, C.ink)); g.add(H.tube([[-0.2, 0.7 - i * 0.25, 0.1], [-0.6, 0.4 - i * 0.3, 0.3], [-0.8, -0.1 - i * 0.3, 0.2]], 0.02, C.ink)); }
  g.add(H.tube([[0, 0.95, 0.15], [0.05, 0.6, 0.35], [0.1, 0.4, 0.3]], 0.015, C.yellow));
  labels.push(L('Head', 'Compound eyes, antennae, proboscis (siphoning mouthparts)', [0, 1.1, 0.2]));
  labels.push(L('Antennae (1 pair)', 'Sensory; club-shaped in butterflies', [0.55, 2.3, 0]));
  labels.push(L('Thorax (3 segments)', 'Bears 3 pairs of jointed legs & 2 pairs of wings', [0, 0.5, 0.25]));
  labels.push(L('Forewing & hindwing', 'Membranous wings with scales', [-1.9, 1.2, 0]));
  labels.push(L('Abdomen', 'Segmented; spiracles open into tracheae', [0, -0.9, 0.16]));
  labels.push(L('Jointed legs (3 pairs)', 'Arthropoda = "jointed feet"', [0.8, -0.3, 0.2]));
  return { g, labels, note: 'Arthropoda — largest phylum; chitinous exoskeleton; open circulation; Malpighian tubules; tracheae/gills/book lungs. Economically important: Apis, Bombyx, Laccifer; vectors Anopheles, Culex, Aedes.' };
}
function phPila() {
  const g = H.grp(), labels = [];
  // spiral shell as a lathe-ish sequence of spheres
  for (let i = 0; i < 40; i++) { const t = i / 40; const a = t * 3 * TAU; const R = 0.15 + t * 1.1, r = 0.12 + t * 0.9; g.add(H.sphere(r, i % 2 ? C.amber : C.brown, [R * Math.cos(a), 1.6 - t * 1.9, R * Math.sin(a)], { seg: 14 })); }
  g.add(H.ell(1.2, 0.4, 0.7, C.grey, [0.3, -1.2, 0.2]));
  g.add(H.ell(0.5, 0.35, 0.4, C.grey, [1.4, -1.0, 0.2]));
  g.add(H.tube([[1.7, -0.8, 0.35], [2.2, -0.3, 0.5]], 0.03, C.grey)); g.add(H.tube([[1.7, -0.8, 0.0], [2.2, -0.3, -0.1]], 0.03, C.grey));
  g.add(H.sphere(0.06, C.ink, [2.15, -0.35, 0.5])); g.add(H.sphere(0.06, C.ink, [2.15, -0.35, -0.1]));
  g.add(H.ring(0.2, 0.45, C.bone, [0.5, -0.2, 1.05], [0.2, 0, 0], { op: 0.9 }));
  labels.push(L('Shell (spirally coiled)', 'Calcareous, secreted by mantle', [-0.6, 0.6, -0.5]));
  labels.push(L('Foot (muscular)', 'Ventral, for creeping locomotion', [0.3, -1.4, 0.4]));
  labels.push(L('Head with tentacles & eyes', 'Sensory tentacles; eyes on stalks', [1.4, -1.0, 0.2]));
  labels.push(L('Operculum', 'Horny plate closing the shell aperture', [0.5, -0.2, 1.05]));
  labels.push(L('Mantle (visceral hump)', 'Soft layer secreting the shell; mantle cavity with gills (ctenidia)', [0.9, 1.1, 0.6]));
  labels.push(L('Radula', 'File-like rasping organ in the mouth', [1.8, -1.2, 0.2]));
  return { g, labels, note: 'Mollusca (Pila, Pinctada, Sepia, Octopus): second largest phylum; head–muscular foot–visceral hump; mantle; ctenidia; radula; open circulation.' };
}
function phAsterias() {
  const g = H.grp(), labels = [];
  g.add(H.sphere(0.6, C.orange, null, { sy: 0.4 }));
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const arm = H.grp([], null, [0, -a, 0]); arm.add(H.lathe([[0, 0], [0.32, 0.05], [0.28, 0.9], [0.18, 1.6], [0.02, 2.1]], C.orange, [0, 0, 0], [0, 0, -PI / 2], { seg: 16 })); for (let k = 1; k < 9; k++) for (let n = -1; n <= 1; n += 2) arm.add(H.rod([0.25 + k * 0.2, -0.15, n * 0.06], [0.25 + k * 0.2, -0.4, n * 0.12], 0.02, C.white, { seg: 5 })); const rng = H.rng(i + 3); for (let k = 0; k < 18; k++) arm.add(H.sphere(0.03, C.bone, [0.3 + rng() * 1.7, 0.2 + rng() * 0.1, (rng() - 0.5) * 0.35], { seg: 5 })); g.add(arm); }
  g.add(H.disc(0.1, C.bone, [0.25, 0.25, 0.25], [-PI / 2, 0, 0]));
  labels.push(L('Central disc', 'Mouth on ventral (oral) side; anus dorsal', [0, 0.25, 0]));
  labels.push(L('Arms (5, radial symmetry)', 'Adult radial; larva bilateral', [1.3, 0, 0]));
  labels.push(L('Tube feet', 'Part of water vascular system — locomotion, capture, respiration', [1.2, -0.35, 0.12]));
  labels.push(L('Madreporite', 'Sieve plate — water enters the water vascular system', [0.25, 0.25, 0.25]));
  labels.push(L('Calcareous ossicles / spines', 'Endoskeleton ("spiny skinned")', [-0.8, 0.3, 0.6]));
  return { g, labels, note: 'Echinodermata (Asterias, Echinus, Antedon, Cucumaria, Ophiura): calcareous endoskeleton; water vascular system; no excretory system; dioecious; indirect development.' };
}
function phBalanoglossus() {
  const g = H.grp(), labels = [];
  g.add(H.ell(0.35, 0.75, 0.35, C.pink, [0, 2.1, 0]));
  g.add(H.cyl(0.4, 0.42, 0.55, C.amber, [0, 1.15, 0]));
  g.add(H.lathe([[0.35, 0.85], [0.42, 0.3], [0.38, -0.6], [0.3, -1.6], [0.18, -2.4], [0, -2.6]], C.orange, null, null, { seg: 20 }));
  for (let i = 0; i < 6; i++) g.add(H.torus(0.12, 0.02, C.ink, [0.38, 0.5 - i * 0.12, 0.1], [0, PI / 2, 0]));
  g.add(H.sphere(0.07, C.ink, [0, 1.42, 0.4]));
  labels.push(L('Proboscis', 'Anterior; contains proboscis gland & stomochord', [0, 2.1, 0.35]));
  labels.push(L('Collar', 'Middle region; mouth at proboscis–collar junction (ventral)', [0.42, 1.15, 0]));
  labels.push(L('Trunk', 'Long posterior region', [0.35, -0.8, 0]));
  labels.push(L('Gill slits (branchial)', 'Respiration through gills', [0.4, 0.3, 0.15]));
  labels.push(L('Mouth', 'Between proboscis and collar', [0, 1.42, 0.4]));
  return { g, labels, note: 'Hemichordata (Balanoglossus, Saccoglossus): worm-like marine; stomochord (not true notochord); open circulation; proboscis gland excretes; indirect development (tornaria).' };
}
function phChordate() {
  const g = H.grp(), labels = [];
  const body = (y, chord) => { const s = H.grp([], [0, y, 0]); s.add(H.ell(2.2, 0.55, 0.45, C.teal, null, { op: 0.25, side: THREE.DoubleSide, dw: false })); s.add(H.rod([-1.8, chord ? 0.15 : -0.25, 0], [1.8, chord ? 0.15 : -0.25, 0], 0.05, C.yellow)); if (chord) { s.add(H.rod([-1.8, 0.3, 0], [1.8, 0.3, 0], 0.05, C.purple)); for (let i = 0; i < 5; i++) s.add(H.rod([-1.5 + i * 0.25, 0, 0.42], [-1.5 + i * 0.25, -0.2, 0.42], 0.02, C.red)); s.add(H.ell(0.5, 0.15, 0.2, C.pink, [-0.1, -0.3, 0])); s.add(H.rod([-1.5, -0.1, 0], [1.6, -0.1, 0], 0.06, C.orange)); s.add(H.cone(0.15, 0.6, C.teal, [2.3, 0, 0], [0, 0, -PI / 2])); s.add(H.sphere(0.06, C.ink, [1.65, -0.35, 0])); } else { s.add(H.rod([-1.5, -0.1, 0], [1.6, -0.1, 0], 0.06, C.orange)); s.add(H.ell(0.5, 0.12, 0.2, C.pink, [-0.1, 0.25, 0])); s.add(H.sphere(0.06, C.ink, [1.65, -0.5, 0])); } return s; };
  g.add(body(1.1, true)); g.add(body(-1.1, false));
  labels.push(L('Notochord', 'Chordates: present (dorsal, mesodermal rod)', [0, 1.25, 0]));
  labels.push(L('Dorsal hollow nerve cord', 'Chordates: nerve cord dorsal & hollow', [0, 1.4, 0]));
  labels.push(L('Pharyngeal gill slits', 'Chordates: present; heart ventral; post-anal tail', [-1.0, 1.0, 0.42]));
  labels.push(L('Heart (ventral)', 'Chordate heart is ventral', [-0.1, 0.8, 0]));
  labels.push(L('Nerve cord solid, ventral', 'Non-chordates: ventral, solid, double', [0, -1.35, 0]));
  labels.push(L('No notochord / gill slits', 'Non-chordates: heart dorsal (if present); no post-anal tail', [-1.0, -0.9, 0]));
  labels.push(L('Heart dorsal', 'Non-chordate', [-0.1, -0.85, 0]));
  return { g, labels, note: 'Chordata: notochord, dorsal hollow nerve cord, paired pharyngeal gill slits, ventral heart, post-anal tail, closed circulation.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-4-2', unit: U1, ch: 'Ch 4 — Animal Kingdom', fig: 'Fig 4.5–4.23', title: 'Phylum representatives & chordate vs non-chordate',
  desc: 'Representative animals of each phylum from Porifera to Hemichordata, and the diagnostic features that separate chordates from non-chordates.',
  points: ['Porifera: canal system, choanocytes. Cnidaria: cnidoblasts, polyp/medusa. Ctenophora: comb plates, bioluminescence.', 'Platyhelminthes: flame cells. Aschelminthes: pseudocoelom. Annelida: nephridia, metameres.', 'Arthropoda: jointed appendages, Malpighian tubules. Mollusca: mantle, radula. Echinodermata: water vascular system.', 'Hemichordata: stomochord, proboscis gland. Chordata: notochord, dorsal hollow nerve cord, gill slits.'],
  variants: [{ name: 'Sycon', build: phSycon }, { name: 'Aurelia', build: phAurelia }, { name: 'Pleurobrachia', build: phPleurobrachia }, { name: 'Taenia', build: phTaenia }, { name: 'Nereis', build: phNereis }, { name: 'Butterfly', build: phButterfly }, { name: 'Pila', build: phPila }, { name: 'Asterias', build: phAsterias }, { name: 'Balanoglossus', build: phBalanoglossus }, { name: 'Chordate vs Non-chordate', build: phChordate }]
}));

/* ---------- Ch 5 Morphology of Flowering Plants ---------- */
function morphRoots() {
  const g = H.grp(), labels = [];
  // tap root (carrot), fibrous, prop roots
  g.add(H.plane(7, 3, C.brown, [0, -1, -0.6], null, { op: 0.15, dw: false }));
  g.add(H.lathe([[0, -2.6], [0.15, -2.0], [0.35, -1.0], [0.45, -0.2], [0.42, 0.1], [0, 0.15]], C.orange, [-2.4, 0, 0], null, { seg: 20 }));
  for (let i = 0; i < 6; i++) g.add(H.tube([[-2.4 + (i % 2 ? 0.35 : -0.35), -0.4 - i * 0.3, 0], [-2.4 + (i % 2 ? 0.8 : -0.8), -0.6 - i * 0.3, 0.1]], 0.02, C.bone));
  for (let i = 0; i < 5; i++) g.add(H.tube([[-2.4, 0.15, 0], [-2.5 + i * 0.05, 0.6, 0.05], [-2.7 + i * 0.15, 1.1, 0.1]], 0.03, C.dgreen));
  // fibrous (wheat)
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; g.add(H.tube([[0, 0.1, 0], [0.4 * Math.cos(a), -0.6, 0.4 * Math.sin(a)], [0.9 * Math.cos(a) * (1 + (i % 3) * 0.2), -1.6 - (i % 2) * 0.5, 0.9 * Math.sin(a)]], 0.02, C.bone)); }
  for (let i = 0; i < 5; i++) g.add(H.tube([[0, 0.1, 0], [0.1 * (i - 2), 0.9, 0], [0.35 * (i - 2), 1.6, 0]], 0.025, C.leaf));
  // prop roots (banyan)
  g.add(H.cyl(0.18, 0.22, 2.4, C.brown, [2.4, 0.9, 0]));
  g.add(H.rod([2.4, 1.5, 0], [3.9, 1.7, 0], 0.08, C.brown)); g.add(H.rod([2.4, 1.2, 0], [1.1, 1.5, 0.2], 0.08, C.brown));
  g.add(H.rod([3.3, 1.62, 0], [3.3, -0.3, 0], 0.05, C.amber)); g.add(H.rod([1.6, 1.38, 0.15], [1.6, -0.3, 0.15], 0.05, C.amber));
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.add(H.tube([[2.4, -0.3, 0], [2.4 + 0.6 * Math.cos(a), -0.9, 0.6 * Math.sin(a)]], 0.04, C.bone)); }
  g.add(H.sphere(0.9, C.leaf, [2.5, 2.2, 0], { op: 0.5 }));
  labels.push(L('Tap root (storage)', 'Carrot, turnip — swollen primary root stores food', [-2.4, -1.0, 0.45]));
  labels.push(L('Fibrous roots', 'Monocots (wheat) — cluster of thin roots replaces primary root', [0.6, -1.3, 0.4]));
  labels.push(L('Prop roots (banyan)', 'Adventitious roots from branches — support', [3.3, 0.6, 0]));
  labels.push(L('Adventitious roots', 'Arise from parts other than radicle (grass, Monstera)', [0, -0.3, 0.3]));
  return { g, labels, note: 'Root modifications: storage (carrot, turnip, sweet potato), support (prop roots of banyan; stilt roots of maize/sugarcane), respiration (pneumatophores of Rhizophora).' };
}
function morphStems() {
  const g = H.grp(), labels = [];
  // potato tuber
  g.add(H.ell(1.0, 0.7, 0.65, '#d4a373', [-2.2, 0.6, 0]));
  const rng = H.rng(7); for (let i = 0; i < 7; i++) { const a = rng() * TAU, b = rng() * PI; const p = [-2.2 + 1.0 * Math.sin(b) * Math.cos(a), 0.6 + 0.7 * Math.cos(b), 0.65 * Math.sin(b) * Math.sin(a)]; g.add(H.sphere(0.07, C.dgreen, p, { seg: 8 })); if (i < 2) g.add(H.tube([p, [p[0] + 0.1, p[1] + 0.35, p[2]], [p[0] + 0.15, p[1] + 0.7, p[2] + 0.05]], 0.03, C.leaf)); }
  g.add(H.tube([[-3.2, 0.6, 0], [-3.9, 0.7, 0.1], [-4.4, 0.5, 0]], 0.03, C.bone));
  // ginger rhizome
  const rz = H.grp([], [0.3, -0.4, 0]); rz.add(H.tube([[-1.2, 0, 0], [-0.6, 0.15, 0.2], [0, 0, 0], [0.6, 0.2, -0.2], [1.2, 0, 0]], 0.3, '#eab676', { seg: 30 })); rz.add(H.tube([[0, 0, 0], [0.3, 0.5, 0.3], [0.5, 0.9, 0.5]], 0.18, '#eab676')); for (let i = 0; i < 6; i++) rz.add(H.torus(0.32, 0.03, C.brown, [-1.0 + i * 0.44, 0.05 * Math.sin(i), 0], [0, PI / 2, 0])); rz.add(H.tube([[-0.7, 0.3, 0.1], [-0.7, 0.9, 0.15], [-0.6, 1.7, 0.2]], 0.05, C.leaf)); for (let i = 0; i < 4; i++) rz.add(H.tube([[-0.9 + i * 0.5, -0.3, 0.1], [-0.9 + i * 0.5, -0.8, 0.15]], 0.02, C.bone)); g.add(rz);
  // tendril (cucumber)
  g.add(H.tube([[2.0, -1.5, 0], [2.1, -0.5, 0], [2.2, 0.6, 0], [2.3, 1.5, 0]], 0.06, C.dgreen));
  g.add(H.extrude([[0, 0], [0.5, 0.3], [0.7, 0.8], [0.3, 1.0], [-0.2, 0.7]], 0.02, C.leaf, [2.3, 0.6, 0], [0, 0.3, 0.3]));
  g.add(H.helix(0.15, 1.6, 6, 0.025, C.lime, { axis: 'x', pos: [3.4, 0.8, 0] })); g.add(H.tube([[2.3, 0.7, 0], [2.6, 0.85, 0], [2.6, 0.8, 0]], 0.025, C.lime));
  g.add(H.rod([3.9, -1.5, 0.3], [3.9, 1.8, 0.3], 0.04, C.grey));
  labels.push(L('Potato tuber', 'Underground stem: nodes ("eyes") with axillary buds — stores food', [-2.2, 1.3, 0]));
  labels.push(L('Eye (node with bud)', 'Proves it is a stem, not a root', [-1.3, 0.6, 0.3]));
  labels.push(L('Ginger rhizome', 'Underground stem with nodes, scale leaves & adventitious roots', [0.3, -0.4, 0.3]));
  labels.push(L('Nodes (scale leaves)', 'Rings on the rhizome', [-0.7, -0.35, 0]));
  labels.push(L('Stem tendril', 'Slender spiral from axillary bud (cucumber, gourd) — climbing', [3.4, 0.95, 0]));
  labels.push(L('Support', 'Tendril coils around', [3.9, 0.5, 0.3]));
  return { g, labels, note: 'Stem modifications: storage (potato, ginger, turmeric, zaminkand, Colocasia); tendrils (gourds, grapevine); thorns (Citrus, Bougainvillea); phylloclade (Opuntia); runner/stolon/offset/sucker.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-5-1', unit: U2, ch: 'Ch 5 — Morphology of Flowering Plants', fig: 'Fig 5.2–5.5', title: 'Root & stem modifications',
  desc: 'Roots and stems are modified for storage, support, respiration, climbing and protection. Nodes/eyes/scale leaves distinguish underground stems from roots.',
  points: ['Root regions: root cap → meristem → elongation → maturation (root hairs).', 'Pneumatophores: Rhizophora (mangrove) — respiration.', 'Underground stems: rhizome (ginger), tuber (potato), bulb (onion), corm (Colocasia).', 'Subaerial: runner (grass), stolon (jasmine), offset (Pistia), sucker (Chrysanthemum).'],
  variants: [{ name: 'Roots', build: morphRoots }, { name: 'Stems', build: morphStems }]
}));

function leafShape(len, wid, color, pos, rot, o) {
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([wid * Math.sin(t * PI) * (o && o.tip ? Math.pow(1 - t, 0.3) : 1), t * len]); } for (let i = 16; i >= 0; i--) { const t = i / 16; pts.push([-wid * Math.sin(t * PI) * (o && o.tip ? Math.pow(1 - t, 0.3) : 1), t * len]); }
  return H.extrude(pts, 0.02, color, pos, rot, o);
}
function venParallel() {
  const g = H.grp(), labels = [];
  g.add(H.extrude([[-0.4, -2.2], [0.4, -2.2], [0.5, 0], [0.2, 2.4], [0, 2.7], [-0.2, 2.4], [-0.5, 0]], 0.02, C.leaf, null, null, {}));
  for (let i = -3; i <= 3; i++) { const x = i * 0.13; g.add(H.tube([[x * 1.0, -2.2, 0.02], [x * 1.4, -0.5, 0.02], [x * 1.3, 1.2, 0.02], [x * 0.3, 2.5, 0.02]], i === 0 ? 0.03 : 0.015, C.dgreen)); }
  g.add(H.cyl(0.12, 0.14, 0.6, C.dgreen, [0, -2.5, 0]));
  labels.push(L('Parallel venation', 'Veins run parallel — monocots (grasses, banana)', [0.3, 0.5, 0.05]));
  labels.push(L('Midrib', 'Central prominent vein', [0, -0.5, 0.05]));
  labels.push(L('Leaf sheath', 'Monocot leaf base sheathing the stem', [0, -2.5, 0.1]));
  return { g, labels, note: 'Parallel venation is characteristic of monocotyledons.' };
}
function venReticulate() {
  const g = H.grp(), labels = [];
  g.add(leafShape(4.2, 1.5, C.leaf, [0, -2.0, 0], null, { tip: true }));
  g.add(H.tube([[0, -2.2, 0.02], [0, 0, 0.02], [0, 2.1, 0.02]], 0.035, C.dgreen));
  for (let i = 0; i < 6; i++) { const y = -1.5 + i * 0.6; const w = 1.4 * Math.sin((y + 2) / 4.2 * PI); for (const s of [-1, 1]) { g.add(H.tube([[0, y, 0.02], [s * w * 0.5, y + 0.25, 0.02], [s * w * 0.95, y + 0.5, 0.02]], 0.018, C.dgreen)); for (let k = 1; k < 4; k++) g.add(H.tube([[s * w * k / 4, y + 0.12 * k, 0.02], [s * w * (k / 4 + 0.1), y + 0.12 * k + 0.35, 0.02]], 0.008, C.dgreen)); } }
  g.add(H.cyl(0.05, 0.06, 0.8, C.dgreen, [0, -2.4, 0]));
  labels.push(L('Reticulate venation', 'Veinlets form a network — dicots', [0.9, 0.5, 0.05]));
  labels.push(L('Midrib', 'Main vein from petiole', [0, 0.5, 0.05]));
  labels.push(L('Lateral veins', 'Branch from midrib; veinlets anastomose', [-0.7, -0.3, 0.05]));
  labels.push(L('Petiole', 'Leaf stalk; lamina = leaf blade', [0, -2.5, 0.05]));
  return { g, labels, note: 'Reticulate venation is characteristic of dicotyledons. Venation = arrangement of veins & veinlets in lamina.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-5-2', unit: U2, ch: 'Ch 5 — Morphology of Flowering Plants', fig: 'Fig 5.11', title: 'Venation: parallel & reticulate',
  desc: 'Venation is the arrangement of veins and veinlets in the lamina. Reticulate (network) in dicots; parallel in monocots.',
  points: ['Leaf = leaf base + petiole + lamina; pulvinus in legumes.', 'Phyllotaxy: alternate (mustard), opposite (Calotropis), whorled (Alstonia).', 'Leaf modifications: tendril (pea), spines (cactus), storage (onion), pitcher (Nepenthes), bladder (Utricularia).'],
  variants: [{ name: 'Parallel', build: venParallel }, { name: 'Reticulate', build: venReticulate }]
}));

function petalArrange(kind) {
  const g = H.grp(), labels = [];
  const n = 5, R = 0.95;
  const petal = (i, tilt, zlift, color, scale) => { const a = i / n * TAU; const p = H.extrude([[0, 0], [0.55, 0.35], [0.65, 1.05], [0, 1.35], [-0.65, 1.05], [-0.55, 0.35]], 0.03, color, [R * Math.cos(a), zlift, -R * Math.sin(a)], [-PI / 2, 0, -a + PI / 2 + tilt], { op: 0.92, sx: scale || 1 }); return p; };
  g.add(H.sphere(0.35, C.yellow, [0, 0, 0]));
  if (kind === 'valvate') { for (let i = 0; i < n; i++) g.add(petal(i, 0, 0, C.pink, 0.95)); labels.push(L('Valvate', 'Petals just touch at margins — no overlap (Calotropis)', [R, 0.05, 0])); }
  if (kind === 'twisted') { for (let i = 0; i < n; i++) g.add(petal(i, 0.35, i * 0.03, C.pink)); labels.push(L('Twisted (contorted)', 'Each petal overlaps the next in ONE direction (china rose, cotton, lady\'s finger)', [R, 0.15, 0])); }
  if (kind === 'imbricate') { const lifts = [0, 0.12, 0.06, 0.12, 0.06]; for (let i = 0; i < n; i++) g.add(petal(i, 0.15, lifts[i], C.pink)); labels.push(L('Imbricate', 'Overlap not in any definite direction: one out, one in, rest one edge in (Cassia, gulmohur)', [R, 0.2, 0])); }
  if (kind === 'vexillary') {
    g.add(H.extrude([[0, 0], [1.2, 0.5], [1.3, 1.5], [0, 1.9], [-1.3, 1.5], [-1.2, 0.5]], 0.03, C.purple, [0, 0.3, -0.6], [-PI / 2 + 0.5, 0, 0]));
    g.add(H.extrude([[0, 0], [0.6, 0.3], [0.6, 1.1], [0, 1.3], [-0.5, 1.0], [-0.4, 0.3]], 0.03, C.pink, [0.7, 0.1, 0.1], [-PI / 2 + 0.2, 0, -1.0]));
    g.add(H.extrude([[0, 0], [0.6, 0.3], [0.6, 1.1], [0, 1.3], [-0.5, 1.0], [-0.4, 0.3]], 0.03, C.pink, [-0.7, 0.1, 0.1], [-PI / 2 + 0.2, 0, 1.0]));
    g.add(H.extrude([[0, 0], [0.5, 0.2], [0.5, 1.1], [0, 1.2], [-0.5, 1.1], [-0.5, 0.2]], 0.03, C.lime, [0, -0.1, 0.5], [-PI / 2 + 0.9, 0, 0]));
    labels.push(L('Standard (vexillum)', 'Largest posterior petal overlapping the wings', [0, 1.2, -1.3]));
    labels.push(L('Wings (2)', 'Lateral petals', [1.1, 0.4, 0.3]));
    labels.push(L('Keel (2 fused)', 'Smallest anterior petals enclosing stamens & pistil', [0, 0.3, 1.2]));
    labels.push(L('Vexillary (papilionaceous)', 'Pea, bean — Fabaceae', [0, -0.3, 0]));
    return { g, labels };
  }
  labels.push(L('Petal', 'Floral leaf of the corolla (2nd whorl)', [R * Math.cos(1.26), 0.1, -R * Math.sin(1.26)]));
  labels.push(L('Thalamus / centre', 'Aestivation is seen in a flower bud cross-section', [0, 0, 0]));
  return { g, labels };
}
reg(Object.assign({}, B11, {
  id: 'b11-5-3', unit: U2, ch: 'Ch 5 — Morphology of Flowering Plants', fig: 'Fig 5.14', title: 'Aestivation of petals',
  desc: 'Aestivation is the mode of arrangement of sepals or petals in a floral bud with respect to other members of the same whorl.',
  points: ['Valvate: Calotropis. Twisted: china rose, lady\'s finger, cotton.', 'Imbricate: Cassia, gulmohur. Vexillary: pea, bean (papilionaceous corolla).', 'Aestivation is a floral-bud character; symmetry: actinomorphic (mustard) / zygomorphic (pea).'],
  variants: [{ name: 'Valvate', build: () => petalArrange('valvate') }, { name: 'Twisted', build: () => petalArrange('twisted') }, { name: 'Imbricate', build: () => petalArrange('imbricate') }, { name: 'Vexillary', build: () => petalArrange('vexillary') }]
}));

function placent(kind) {
  const g = H.grp(), labels = [];
  const h = 2.2;
  g.add(H.annulus(1.15, 1.0, h, C.leaf, null, { op: 0.8 }));
  g.add(H.disc(1.15, C.dgreen, [0, -h / 2, 0], [PI / 2, 0, 0], { op: 0.9 }));
  const ov = (p) => g.add(H.sphere(0.13, C.yellow, p, { e: 0.5 }));
  if (kind === 'marginal') {
    g.add(H.box(0.12, h, 0.25, C.dgreen, [0.97, 0, 0]));
    for (let i = 0; i < 6; i++) ov([0.8, -0.9 + i * 0.36, 0]);
    labels.push(L('Marginal placentation', 'Placenta forms a ridge along the ventral suture; ovules in one row (pea)', [0.97, 0.7, 0]));
    labels.push(L('Unilocular ovary', 'Single chamber (monocarpellary)', [-0.6, 0, 0]));
  }
  if (kind === 'axile') {
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.add(H.box(0.05, h, 1.0, C.dgreen, [0.5 * Math.cos(a), 0, -0.5 * Math.sin(a)], [0, a, 0])); }
    g.add(H.cyl(0.2, 0.2, h, C.dgreen, [0, 0, 0]));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; for (let k = 0; k < 4; k++) ov([0.38 * Math.cos(a), -0.75 + k * 0.5, -0.38 * Math.sin(a)]); }
    labels.push(L('Axile placentation', 'Placenta axial; ovules on central axis; multilocular (china rose, tomato, lemon)', [0, 0.9, 0]));
    labels.push(L('Septa', 'Partitions dividing ovary into locules', [0.5, 0.5, 0]));
  }
  if (kind === 'parietal') {
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; g.add(H.box(0.12, h, 0.2, C.dgreen, [0.95 * Math.cos(a), 0, -0.95 * Math.sin(a)], [0, a, 0])); for (let k = 0; k < 4; k++) ov([0.78 * Math.cos(a), -0.75 + k * 0.5, -0.78 * Math.sin(a)]); }
    g.add(H.box(0.03, h, 1.8, C.dgreen, [0, 0, 0], [0, PI / 2, 0], { op: 0.5 }));
    labels.push(L('Parietal placentation', 'Ovules on inner wall (periphery); unilocular (mustard, Argemone)', [0.95, 0.6, 0]));
    labels.push(L('False septum', 'Makes mustard ovary two-chambered (replum)', [0, 0.2, 0.6]));
  }
  if (kind === 'freecentral') {
    g.add(H.cyl(0.18, 0.22, h * 0.85, C.dgreen, [0, -0.15, 0]));
    for (let i = 0; i < 10; i++) { const a = i * 2.2; ov([0.36 * Math.cos(a), -0.8 + i * 0.16, 0.36 * Math.sin(a)]); }
    labels.push(L('Free central placentation', 'Ovules on central axis; NO septa (Dianthus, Primrose)', [0, 0.7, 0]));
    labels.push(L('No septa', 'Unilocular ovary', [-0.8, 0.3, 0]));
  }
  if (kind === 'basal') {
    ov([0, -0.85, 0]); g.add(H.cone(0.3, 0.3, C.dgreen, [0, -1.0, 0]));
    labels.push(L('Basal placentation', 'Single ovule at the base of the ovary (sunflower, marigold)', [0, -0.85, 0]));
    labels.push(L('Ovary wall', 'Pericarp after fertilisation', [1.1, 0.3, 0]));
  }
  labels.push(L('Ovule', 'Develops into seed after fertilisation', kind === 'basal' ? [0, -0.85, 0.13] : kind === 'marginal' ? [0.8, -0.9, 0] : kind === 'axile' ? [0.27, 0.75, -0.27] : kind === 'parietal' ? [0.78, 0.75, 0] : [0.36, 0.8, 0]));
  return { g, labels };
}
reg(Object.assign({}, B11, {
  id: 'b11-5-4', unit: U2, ch: 'Ch 5 — Morphology of Flowering Plants', fig: 'Fig 5.17', title: 'Types of placentation',
  desc: 'Placentation is the arrangement of ovules within the ovary. Types: marginal, axile, parietal, free central and basal.',
  points: ['Marginal — pea; Axile — china rose, tomato, lemon; Parietal — mustard, Argemone.', 'Free central — Dianthus, Primrose; Basal — sunflower, marigold.', 'Gynoecium: apocarpous (lotus, rose) vs syncarpous (mustard, tomato).'],
  variants: [{ name: 'Marginal', build: () => placent('marginal') }, { name: 'Axile', build: () => placent('axile') }, { name: 'Parietal', build: () => placent('parietal') }, { name: 'Free central', build: () => placent('freecentral') }, { name: 'Basal', build: () => placent('basal') }]
}));

function seedDicot() {
  const g = H.grp(), labels = [];
  // bean seed half opened: two cotyledons, embryo axis
  g.add(H.ell(1.5, 1.0, 0.45, '#fde68a', [0, 0, -0.5], { op: 0.95 }));
  g.add(H.ell(1.5, 1.0, 0.45, '#fde68a', [0, 0, 0.5], { op: 0.35 }));
  g.add(H.ell(1.6, 1.08, 0.5, '#b45309', [0, 0, -0.5], { op: 0.35, dw: false }));
  g.add(H.tube([[-1.0, 0.2, 0.05], [-0.5, 0.35, 0.05], [0.4, 0.3, 0.05], [1.2, 0.0, 0.05], [1.45, -0.4, 0.05]], 0.08, C.leaf));
  g.add(H.extrude([[0, 0], [0.25, 0.2], [0.3, 0.5], [0, 0.6], [-0.3, 0.5], [-0.25, 0.2]], 0.02, C.lime, [-1.1, 0.25, 0.1], [0, 0, 0.8]));
  g.add(H.extrude([[0, 0], [0.25, 0.2], [0.3, 0.5], [0, 0.6], [-0.3, 0.5], [-0.25, 0.2]], 0.02, C.lime, [-1.0, 0.5, 0.1], [0, 0, -0.4]));
  g.add(H.ell(0.22, 0.12, 0.08, C.ink, [1.62, -0.35, 0.2]));
  g.add(H.sphere(0.05, C.white, [1.7, -0.15, 0.2]));
  labels.push(L('Seed coat (testa + tegmen)', 'Outer testa & inner tegmen', [-1.2, -0.8, -0.3]));
  labels.push(L('Cotyledons (2)', 'Fleshy — store food; non-endospermic seed', [0.2, -0.5, -0.5]));
  labels.push(L('Plumule', 'Embryonic shoot with first leaves', [-1.1, 0.7, 0.1]));
  labels.push(L('Radicle', 'Embryonic root — emerges first', [1.45, -0.45, 0.05]));
  labels.push(L('Hilum', 'Scar where seed attached to fruit', [1.62, -0.35, 0.2]));
  labels.push(L('Micropyle', 'Small pore near hilum — water & O₂ entry', [1.7, -0.15, 0.2]));
  labels.push(L('Embryonal axis', 'Plumule + radicle (hypocotyl/epicotyl)', [0.4, 0.3, 0.05]));
  return { g, labels, note: 'Dicot seed (bean, gram, pea): non-endospermic (food in cotyledons); castor is an endospermic dicot seed.' };
}
function seedMonocot() {
  const g = H.grp(), labels = [];
  // maize grain L.S.
  g.add(H.extrude([[-1.0, -1.6], [1.0, -1.6], [1.15, 0.5], [0.7, 1.6], [-0.7, 1.6], [-1.15, 0.5]], 0.5, '#fbbf24', null, null, { op: 0.9 }));
  g.add(H.extrude([[-1.03, -1.63], [1.03, -1.63], [1.18, 0.5], [0.72, 1.63], [-0.72, 1.63], [-1.18, 0.5]], 0.56, '#b45309', null, null, { op: 0.3, dw: false }));
  g.add(H.extrude([[-0.9, -1.5], [0.9, -1.5], [1.05, 0.5], [0.65, 1.5], [-0.65, 1.5], [-1.05, 0.5]], 0.02, '#f97316', [0, 0, 0.26], null, { op: 0.35 }));
  g.add(H.extrude([[-0.7, -1.4], [0.15, -1.4], [0.4, -0.6], [0.35, 0.3], [-0.5, 0.2]], 0.04, C.lime, [0, 0, 0.27]));
  g.add(H.extrude([[-0.45, -0.9], [-0.05, -0.85], [0.1, -0.3], [-0.1, 0.05], [-0.4, 0.0]], 0.05, C.leaf, [0, 0, 0.29]));
  g.add(H.rod([-0.3, -1.25, 0.32], [-0.2, -0.9, 0.32], 0.05, C.white));
  g.add(H.rod([-0.2, -0.2, 0.32], [-0.1, 0.0, 0.32], 0.05, C.white));
  g.add(H.ell(0.2, 0.28, 0.05, C.bone, [-0.3, -1.2, 0.32], { op: 0.5 })); g.add(H.ell(0.18, 0.25, 0.05, C.bone, [-0.15, -0.05, 0.32], { op: 0.5 }));
  labels.push(L('Pericarp (fused with seed coat)', 'Hull — fruit wall fused with testa', [1.15, 0.5, 0]));
  labels.push(L('Endosperm (starchy)', 'Bulky food store; monocot seeds endospermic', [0.6, 0.8, 0.28]));
  labels.push(L('Aleurone layer', 'Proteinaceous outer layer of endosperm', [-0.9, 0.9, 0.28]));
  labels.push(L('Scutellum (cotyledon)', 'Single shield-shaped cotyledon', [0.3, -0.5, 0.3]));
  labels.push(L('Coleoptile', 'Sheath covering the plumule', [-0.15, -0.05, 0.36]));
  labels.push(L('Plumule', 'Embryonic shoot', [-0.15, -0.2, 0.36]));
  labels.push(L('Radicle', 'Embryonic root', [-0.28, -1.0, 0.36]));
  labels.push(L('Coleorhiza', 'Sheath covering the radicle', [-0.3, -1.2, 0.36]));
  labels.push(L('Epithelium', 'Layer between scutellum & endosperm', [0.38, -0.2, 0.3]));
  return { g, labels, note: 'Monocot seed (maize): endospermic; embryo = scutellum + embryonal axis; coleoptile & coleorhiza sheaths. Orchids are non-endospermic monocots.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-5-5', unit: U2, ch: 'Ch 5 — Morphology of Flowering Plants', fig: 'Fig 5.19', title: 'Structure of seed: dicot & monocot',
  desc: 'A seed is a fertilised, mature ovule with a seed coat and an embryo. Dicot seeds usually store food in two cotyledons; monocot seeds in endosperm.',
  points: ['Dicot: testa, tegmen, hilum, micropyle, 2 cotyledons, plumule, radicle.', 'Monocot (maize): pericarp fused with seed coat, aleurone layer, scutellum, coleoptile, coleorhiza.', 'Endospermic: maize, castor, wheat. Non-endospermic: bean, pea, gram, orchid.'],
  variants: [{ name: 'Dicot (bean)', build: seedDicot }, { name: 'Monocot (maize)', build: seedMonocot }]
}));


/* ---------- Ch 6 Anatomy of Flowering Plants ---------- */
function merRoot() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, -2.2], [0.5, -1.9], [0.75, -1.4], [0.85, -0.5], [0.85, 1.6]], C.bone, null, null, { seg: 32, phiLen: PI, phiStart: -PI / 2, op: 0.9 }));
  g.add(H.lathe([[0, -1.6], [0.35, -1.5], [0.5, -1.2], [0.5, 1.6]], C.yellow, null, null, { seg: 24, phiLen: PI, phiStart: -PI / 2, op: 0.85 }));
  g.add(H.lathe([[0, -1.3], [0.22, -1.2], [0.25, 1.6]], C.red, null, null, { seg: 20, phiLen: PI, phiStart: -PI / 2 }));
  g.add(H.ell(0.35, 0.28, 0.35, C.pink, [0, -1.55, 0], { e: 0.6 }));
  g.add(H.lathe([[0, -2.25], [0.55, -1.95], [0.8, -1.45], [0.9, -0.6], [0.9, -0.4]], C.orange, null, null, { seg: 32, phiLen: PI, phiStart: -PI / 2, op: 0.7 }));
  for (let i = 0; i < 12; i++) g.add(H.rod([0.85, 0.2 + i * 0.12, 0], [1.4, 0.3 + i * 0.12, 0.15 * Math.sin(i)], 0.012, C.white, { seg: 4 }));
  labels.push(L('Root cap', 'Protects the tender apex as it pushes through soil', [0.5, -2.0, 0]));
  labels.push(L('Apical meristem (root)', 'Sub-terminal, covered by root cap', [0, -1.55, 0]));
  labels.push(L('Protoderm', 'Outer primary meristem → epidermis', [0.85, 0.2, 0]));
  labels.push(L('Ground meristem', 'Middle → cortex, endodermis, pericycle, pith', [0.5, 0.7, 0]));
  labels.push(L('Procambium', 'Central → primary vascular tissues', [0.25, 1.2, 0]));
  labels.push(L('Root hairs', 'Unicellular extensions of epiblema — absorption', [1.3, 1.0, 0]));
  return { g, labels, note: 'Apical meristems at root & shoot tips produce primary tissues; intercalary meristem at internode base in grasses; lateral meristems (cambium) are secondary.' };
}
function merShoot() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, 2.2], [0.35, 2.0], [0.6, 1.4], [0.7, 0.3], [0.7, -2.2]], C.leaf, null, null, { seg: 32, phiLen: PI, phiStart: -PI / 2, op: 0.9 }));
  g.add(H.ell(0.3, 0.25, 0.3, C.pink, [0, 1.95, 0], { e: 0.6 }));
  for (const s of [-1, 1]) { g.add(H.tube([[s * 0.55, 1.3, 0], [s * 0.9, 1.9, 0.1], [s * 0.5, 2.6, 0.2]], 0.05, C.lime)); g.add(H.tube([[s * 0.7, 0.3, 0], [s * 1.5, 1.0, 0.2], [s * 1.2, 2.2, 0.4]], 0.06, C.green)); g.add(H.sphere(0.12, C.yellow, [s * 0.85, 0.55, 0.05], { e: 0.5 })); }
  g.add(H.lathe([[0, 1.7], [0.25, 1.5], [0.35, 0.5], [0.35, -2.2]], C.red, null, null, { seg: 20, phiLen: PI, phiStart: -PI / 2, op: 0.85 }));
  labels.push(L('Shoot apical meristem', 'Terminal dome of dividing cells', [0, 1.95, 0]));
  labels.push(L('Leaf primordia', 'Young leaves arising below the apex', [-0.9, 1.9, 0.1]));
  labels.push(L('Axillary bud', 'Meristem in leaf axil → branch or flower', [0.85, 0.55, 0.05]));
  labels.push(L('Procambium', 'Strand differentiating into vascular bundles', [0.3, 0.4, 0]));
  labels.push(L('Young leaf', 'Expanding leaf enclosing the apex', [1.3, 1.6, 0.3]));
  return { g, labels, note: 'Shoot apical meristem: cells left behind form axillary buds; apical + intercalary = primary meristems.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-6-1', unit: U2, ch: 'Ch 6 — Anatomy of Flowering Plants', fig: 'Fig 6.1', title: 'Meristems: root apex & shoot apex',
  desc: 'Meristematic tissue has actively dividing cells. Apical meristems at root/shoot tips, intercalary meristems in grasses, and lateral meristems (vascular cambium, cork cambium) produce secondary growth.',
  points: ['Primary meristems: protoderm, ground meristem, procambium.', 'Root apical meristem is sub-terminal (covered by root cap); shoot apical meristem is terminal.', 'Permanent tissues: simple (parenchyma, collenchyma, sclerenchyma) & complex (xylem, phloem).'],
  variants: [{ name: 'Root apex', build: merRoot }, { name: 'Shoot apex', build: merShoot }]
}));

reg(Object.assign({}, B11, {
  id: 'b11-6-2', unit: U2, ch: 'Ch 6 — Anatomy of Flowering Plants', fig: 'Fig 6.4', title: 'Stomatal apparatus',
  desc: 'Stomata are minute pores in the epidermis regulated by two bean-shaped guard cells (dumb-bell in grasses). Guard cells possess chloroplasts and unevenly thickened walls.',
  points: ['Guard cell inner wall (towards pore) thick; outer wall thin — turgor opens the pore.', 'Subsidiary cells: specialised epidermal cells around guard cells.', 'Stomatal apparatus = pore + guard cells + subsidiary cells.', 'Dicot leaves: more stomata on lower (abaxial) epidermis; monocot: equal on both.'],
  build() {
    const g = H.grp(), labels = [];
    // epidermal cells (flat blocks)
    const rng = H.rng(3);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { if (Math.abs(i) < 1 && Math.abs(j) < 2) continue; g.add(H.box(0.95, 0.3, 0.95, C.lime, [i * 1.0, -0.15, j * 1.0], null, { op: 0.8 })); }
    // subsidiary cells
    g.add(H.box(0.95, 0.32, 2.9, C.green, [-1.0, -0.14, 0], null, { op: 0.85 })); g.add(H.box(0.95, 0.32, 2.9, C.green, [1.0, -0.14, 0], null, { op: 0.85 }));
    g.add(H.box(2.9, 0.32, 0.95, C.green, [0, -0.14, 2.0], null, { op: 0.85 })); g.add(H.box(2.9, 0.32, 0.95, C.green, [0, -0.14, -2.0], null, { op: 0.85 }));
    // guard cells (bean-shaped) — torus halves
    g.add(H.torus(0.85, 0.28, C.leaf, [0.35, 0, 0], [PI / 2, 0, 0], { arc: PI, tseg: 30 }));
    g.add(H.torus(0.85, 0.28, C.leaf, [-0.35, 0, 0], [PI / 2, 0, PI], { arc: PI, tseg: 30 }));
    for (const s of [-1, 1]) { g.add(H.sphere(0.12, C.nuc, [s * 1.0, 0.05, 0])); for (let k = 0; k < 4; k++) g.add(H.sphere(0.06, C.dgreen, [s * (0.7 + 0.3 * Math.abs(k - 1.5) / 1.5), 0.08, (k - 1.5) * 0.4], { seg: 8, e: 0.6 })); }
    g.add(H.box(0.5, 0.3, 1.0, C.ink, [0, -0.15, 0], null, { op: 0.9 }));
    labels.push(L('Guard cells (2, bean-shaped)', 'Contain chloroplasts; regulate opening/closing', [1.2, 0.2, 0]));
    labels.push(L('Stomatal pore (aperture)', 'Gas exchange & transpiration', [0, 0.1, 0]));
    labels.push(L('Subsidiary cells', 'Specialised epidermal cells surrounding guard cells', [-1.0, 0.05, -1.2]));
    labels.push(L('Epidermal cells', 'Compactly arranged, no chloroplasts (except guard cells)', [-2.0, 0.05, 2.0]));
    labels.push(L('Chloroplast', 'Present only in guard cells of the epidermis', [0.7, 0.1, 0.6]));
    labels.push(L('Nucleus (guard cell)', 'Guard cell is living', [-1.0, 0.05, 0]));
    return { g, labels };
  }
}));

/* --- transverse sections --- */
function tsBase(layers, h = 0.5) {
  const g = H.grp();
  for (let i = 0; i < layers.length; i++) { const l = layers[i]; const rIn = layers[i + 1] ? layers[i + 1].r : 0; g.add(H.name(H.annulus(l.r, rIn, h, l.c, null, { op: l.op ?? 0.9, seg: 56 }), l.n || '')); }
  return g;
}
function xylemArm(g, cx, cz, dirA, n, col, size, y) {
  for (let k = 0; k < n; k++) { const r = size * (1 - k * 0.18); g.add(H.cyl(r, r, 0.56, col, [cx + Math.cos(dirA) * k * size * 1.6, y, cz - Math.sin(dirA) * k * size * 1.6], null, { seg: 10 })); }
}
function tsDicotRoot() {
  const layers = [{ r: 3.0, c: C.lime, n: 'epiblema' }, { r: 2.85, c: C.green, op: 0.7, n: 'cortex' }, { r: 1.55, c: C.amber, n: 'endodermis' }, { r: 1.4, c: C.orange, n: 'pericycle' }, { r: 1.3, c: '#1e3a5f', op: 0.85, n: 'stele' }];
  const g = tsBase(layers), labels = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; xylemArm(g, 0.35 * Math.cos(a), -0.35 * Math.sin(a), a, 3, C.xy, 0.24, 0.05); const b = a + PI / 4; for (let k = 0; k < 3; k++) g.add(H.sphere(0.13, C.ph, [(0.75 + k * 0.05) * Math.cos(b) + (k - 1) * 0.16 * Math.sin(b), 0.28, -(0.75 + k * 0.05) * Math.sin(b) + (k - 1) * 0.16 * Math.cos(b)], { seg: 10 })); }
  g.add(H.cyl(0.2, 0.2, 0.56, C.bone, [0, 0.03, 0], null, { seg: 12 }));
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; g.add(H.box(0.06, 0.1, 0.16, C.brown, [1.48 * Math.cos(a), 0.28, -1.48 * Math.sin(a)], [0, a, 0])); }
  const rng = H.rng(12); for (let i = 0; i < 20; i++) { const a = rng() * TAU; g.add(H.rod([3.0 * Math.cos(a), 0.05, 3.0 * Math.sin(a)], [3.5 * Math.cos(a), 0.05, 3.5 * Math.sin(a)], 0.02, C.white, { seg: 4 })); }
  labels.push(L('Epiblema (epidermis)', 'Outermost; unicellular root hairs; no cuticle/stomata', [2.95, 0.3, 0]));
  labels.push(L('Cortex', 'Thin-walled parenchyma with intercellular spaces', [0, 0.3, 2.2]));
  labels.push(L('Endodermis', 'Innermost cortex; Casparian strips (suberin) on radial & tangential walls', [-1.5, 0.3, 0.2]));
  labels.push(L('Pericycle', 'Lateral roots & vascular cambium originate here', [1.02, 0.3, 1.0]));
  labels.push(L('Xylem (exarch, tetrarch)', 'Protoxylem outside, metaxylem inside; 2–4 bundles', [0.35 + 0.77, 0.35, 0]));
  labels.push(L('Phloem', 'Alternates with xylem (radial arrangement)', [0.85 * Math.cos(PI / 4), 0.35, -0.85 * Math.sin(PI / 4)]));
  labels.push(L('Pith (small)', 'Small or inconspicuous in dicot roots', [0, 0.35, 0]));
  labels.push(L('Conjunctive tissue', 'Parenchyma between xylem & phloem', [-0.5, 0.35, -0.5]));
  return { g, labels, note: 'Dicot root: 2–4 xylem bundles (tetrarch), exarch; radial vascular bundles; pith small; cambium later forms from conjunctive tissue.' };
}
function tsMonocotRoot() {
  const layers = [{ r: 3.0, c: C.lime }, { r: 2.85, c: C.green, op: 0.7 }, { r: 1.75, c: C.amber }, { r: 1.6, c: C.orange }, { r: 1.5, c: '#1e3a5f', op: 0.85 }];
  const g = tsBase(layers), labels = [];
  const n = 9; for (let i = 0; i < n; i++) { const a = i / n * TAU; xylemArm(g, 1.15 * Math.cos(a), -1.15 * Math.sin(a), a + PI, 2, C.xy, 0.16, 0.05); const b = a + PI / n; g.add(H.sphere(0.12, C.ph, [1.3 * Math.cos(b), 0.28, -1.3 * Math.sin(b)], { seg: 10 })); }
  g.add(H.cyl(0.75, 0.75, 0.56, C.bone, [0, 0.03, 0], null, { seg: 24 }));
  for (let i = 0; i < 44; i++) { const a = i / 44 * TAU; g.add(H.box(0.06, 0.1, 0.16, C.brown, [1.68 * Math.cos(a), 0.28, -1.68 * Math.sin(a)], [0, a, 0])); }
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.17; g.add(H.box(0.12, 0.12, 0.18, C.cyan, [1.68 * Math.cos(a), 0.3, -1.68 * Math.sin(a)], [0, a, 0], { e: 0.7 })); }
  labels.push(L('Epiblema', 'Root hairs; no cuticle', [2.95, 0.3, 0]));
  labels.push(L('Cortex', 'Parenchymatous', [0, 0.3, 2.3]));
  labels.push(L('Endodermis with passage cells', 'Thin-walled passage cells opposite protoxylem', [-1.68, 0.35, 0.3]));
  labels.push(L('Pericycle', 'Gives rise to lateral roots only (no cambium)', [1.65, 0.35, -0.6]));
  labels.push(L('Xylem (polyarch, >6)', 'Many bundles, exarch — no secondary growth', [1.15, 0.35, 0]));
  labels.push(L('Phloem', 'Alternating with xylem', [1.3 * Math.cos(PI / 9), 0.35, -1.3 * Math.sin(PI / 9)]));
  labels.push(L('Pith (large)', 'Well-developed parenchymatous pith', [0, 0.35, 0]));
  return { g, labels, note: 'Monocot root: polyarch (more than six) xylem bundles; large pith; no secondary growth; passage cells in endodermis.' };
}
function vascBundleDicot(g, x, z, a, o = {}) {
  const b = H.grp([], [x, 0.28, z], [0, a, 0]);
  for (let k = 0; k < 3; k++) b.add(H.cyl(0.2 - k * 0.04, 0.2 - k * 0.04, 0.6, C.xy, [-0.05 - k * 0.32, 0, 0], null, { seg: 10 }));
  b.add(H.box(0.06, 0.6, 0.65, C.yellow, [0.2, 0, 0]));
  for (let k = -1; k <= 1; k++) b.add(H.sphere(0.12, C.ph, [0.42, 0.02, k * 0.22], { seg: 10 }));
  if (o.cap) b.add(H.box(0.2, 0.6, 0.75, C.brown, [0.68, 0, 0]));
  if (o.sheath) b.add(H.annulus(0.7, 0.62, 0.6, C.brown, [0, 0, 0]));
  if (o.cavity) b.add(H.cyl(0.14, 0.14, 0.62, C.ink, [-0.55, 0, 0], null, { seg: 10 }));
  g.add(b); return b;
}
function tsDicotStem() {
  const layers = [{ r: 3.0, c: C.lime }, { r: 2.88, c: C.dgreen, op: 0.8 }, { r: 2.55, c: C.green, op: 0.7 }, { r: 2.1, c: C.amber }, { r: 2.0, c: C.orange }, { r: 1.9, c: '#1e3a5f', op: 0.7 }];
  const g = tsBase(layers), labels = [];
  const n = 8; for (let i = 0; i < n; i++) { const a = i / n * TAU; vascBundleDicot(g, 1.25 * Math.cos(a), -1.25 * Math.sin(a), a + PI, { cap: true }); }
  g.add(H.cyl(0.85, 0.85, 0.56, C.bone, [0, 0.03, 0], null, { seg: 24 }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.rod([3.0 * Math.cos(a), 0.3, 3.0 * Math.sin(a)], [3.25 * Math.cos(a), 0.3, 3.25 * Math.sin(a)], 0.015, C.white, { seg: 4 })); }
  labels.push(L('Epidermis (with cuticle)', 'Trichomes & few stomata', [2.95, 0.3, 0]));
  labels.push(L('Hypodermis (collenchyma)', 'Mechanical strength under epidermis', [0, 0.3, 2.7]));
  labels.push(L('Cortex (parenchyma)', 'General cortex with intercellular spaces', [0, 0.3, 2.3]));
  labels.push(L('Endodermis (starch sheath)', 'Innermost cortex layer, rich in starch grains', [-2.05, 0.3, 0]));
  labels.push(L('Pericycle', 'Semilunar patches of sclerenchyma above phloem', [1.25 + 0.68, 0.35, 0]));
  labels.push(L('Vascular bundle (conjoint, collateral, open)', 'In a ring (eustele); xylem endarch', [1.25, 0.35, 0]));
  labels.push(L('Cambium', 'Strip between xylem & phloem — secondary growth', [1.25 - 0.2, 0.35, 0]));
  labels.push(L('Xylem (endarch)', 'Protoxylem towards pith, metaxylem outside', [1.25 - 0.55, 0.35, 0]));
  labels.push(L('Phloem', 'Outer side of the bundle', [1.25 + 0.42, 0.35, 0.22]));
  labels.push(L('Pith (large)', 'Parenchyma; medullary rays between bundles', [0, 0.35, 0]));
  return { g, labels, note: 'Dicot stem: vascular bundles in a ring, conjoint collateral open, endarch xylem; hypodermis collenchymatous; secondary growth occurs.' };
}
function tsMonocotStem() {
  const layers = [{ r: 3.0, c: C.lime }, { r: 2.9, c: C.brown, op: 0.9 }, { r: 2.6, c: C.green, op: 0.6 }];
  const g = tsBase(layers), labels = [];
  const rng = H.rng(21); const bundles = [];
  for (let ring = 0; ring < 3; ring++) { const R = 2.2 - ring * 0.75, n = 12 - ring * 4; for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * 0.3; const b = vascBundleDicot(g, R * Math.cos(a), -R * Math.sin(a), a + PI, { sheath: true, cavity: true }); b.scale.setScalar(ring === 0 ? 0.6 : 0.85); bundles.push([R * Math.cos(a), -R * Math.sin(a)]); } }
  labels.push(L('Epidermis', 'Cuticle; no hairs', [2.95, 0.3, 0]));
  labels.push(L('Hypodermis (sclerenchyma)', 'Few layers of sclerenchyma (contrast: collenchyma in dicot)', [0, 0.3, 2.75]));
  labels.push(L('Ground tissue', 'No cortex/endodermis/pericycle/pith differentiation', [0, 0.3, 0]));
  labels.push(L('Scattered vascular bundles', 'Conjoint, collateral, CLOSED (no cambium)', [2.2, 0.35, 0]));
  labels.push(L('Sclerenchymatous bundle sheath', 'Surrounds each bundle', [2.2 + 0.6, 0.35, 0.1]));
  labels.push(L('Lysigenous water cavity', 'Formed by dissolution of protoxylem', [2.2 - 0.47, 0.4, 0]));
  labels.push(L('Phloem (no parenchyma)', 'Peripheral side of bundle', [2.2 + 0.36, 0.4, 0.2]));
  labels.push(L('Smaller bundles near periphery', 'Larger towards centre', [1.45 * Math.cos(0.3 + PI / 4), 0.35, -1.45 * Math.sin(0.3 + PI / 4)]));
  return { g, labels, note: 'Monocot stem: scattered closed bundles with sclerenchymatous sheath; hypodermis sclerenchymatous; water-containing cavities; no secondary growth.' };
}
function leafTS(iso) {
  const g = H.grp(), labels = [];
  const W = 5.2, D = 1.2;
  g.add(H.box(W, 0.22, D, C.lime, [0, 1.0, 0], null, { op: 0.9 }));
  g.add(H.box(W, 0.04, D, C.yellow, [0, 1.14, 0], null, { op: 0.9 }));
  g.add(H.box(W, 0.22, D, C.lime, [0, -1.0, 0], null, { op: 0.9 }));
  g.add(H.box(W, 0.04, D, C.yellow, [0, -1.14, 0], null, { op: 0.9 }));
  if (!iso) {
    for (let i = 0; i < 14; i++) for (let k = 0; k < 2; k++) g.add(H.box(0.3, 0.75, 0.3, C.dgreen, [-2.4 + i * 0.37, 0.48, -0.3 + k * 0.6], null, { op: 0.95 }));
    const rng = H.rng(4); for (let i = 0; i < 40; i++) g.add(H.sphere(0.13 + rng() * 0.08, C.green, [(rng() - 0.5) * 4.6, -0.7 + rng() * 0.7, (rng() - 0.5) * 0.9], { seg: 10 }));
  } else {
    const rng = H.rng(4); for (let i = 0; i < 70; i++) g.add(H.sphere(0.14 + rng() * 0.08, C.green, [(rng() - 0.5) * 4.6, -0.7 + rng() * 1.5, (rng() - 0.5) * 0.9], { seg: 10 }));
    for (let i = 0; i < 3; i++) g.add(H.sphere(0.2, C.cyan, [-1.9 + i * 0.28, 0.95, 0], { op: 0.7 }));
  }
  // vein with bundle sheath
  g.add(H.cyl(0.55, 0.55, D, C.amber, [0, -0.1, 0], [PI / 2, 0, 0], { seg: 20, op: 0.85 }));
  for (let k = 0; k < 3; k++) g.add(H.cyl(0.12, 0.12, D + 0.02, C.xy, [(k - 1) * 0.22, 0.12, 0], [PI / 2, 0, 0], { seg: 10 }));
  for (let k = 0; k < 4; k++) g.add(H.cyl(0.08, 0.08, D + 0.02, C.ph, [(k - 1.5) * 0.18, -0.28, 0], [PI / 2, 0, 0], { seg: 8 }));
  // stomata
  const stom = (x, y) => { g.add(H.box(0.18, 0.22, 0.4, C.dgreen, [x - 0.14, y, 0])); g.add(H.box(0.18, 0.22, 0.4, C.dgreen, [x + 0.14, y, 0])); };
  stom(-1.5, -1.0); stom(1.6, -1.0); if (iso) { stom(1.2, 1.0); stom(-1.0, 1.0); }
  labels.push(L('Upper epidermis (adaxial)', 'Cuticle outside; ' + (iso ? 'stomata on both sides' : 'fewer/no stomata'), [-2.2, 1.15, 0.4]));
  labels.push(L('Lower epidermis (abaxial)', iso ? 'Equal stomata' : 'More stomata on lower side', [2.2, -1.15, 0.4]));
  labels.push(L('Cuticle', 'Waxy layer reduces water loss', [0, 1.16, 0.6]));
  if (!iso) { labels.push(L('Palisade parenchyma', 'Elongated, compact cells with many chloroplasts', [-1.2, 0.5, 0.3])); labels.push(L('Spongy parenchyma', 'Loose, rounded cells with air spaces', [1.4, -0.5, 0.3])); }
  else { labels.push(L('Mesophyll (undifferentiated)', 'No palisade/spongy distinction', [1.4, 0.2, 0.3])); labels.push(L('Bulliform (motor) cells', 'Large empty adaxial epidermal cells — leaf rolling', [-1.6, 0.95, 0.2])); }
  labels.push(L('Vascular bundle (vein)', 'Xylem towards upper, phloem towards lower epidermis', [0, -0.1, 0.6]));
  labels.push(L('Bundle sheath', 'Parenchymatous cells surrounding the vein', [0.55, -0.1, 0.3]));
  labels.push(L('Xylem', 'Adaxial (upper) side', [0.22, 0.12, 0.62]));
  labels.push(L('Phloem', 'Abaxial (lower) side', [-0.3, -0.28, 0.62]));
  labels.push(L('Stoma with guard cells', 'Gas exchange', [-1.5, -1.0, 0.2]));
  return { g, labels, note: iso ? 'Isobilateral (monocot) leaf: stomata on both epidermises, undifferentiated mesophyll, bulliform cells.' : 'Dorsiventral (dicot) leaf: palisade + spongy mesophyll; stomata mostly abaxial; conjoint closed bundles.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-6-3', unit: U2, ch: 'Ch 6 — Anatomy of Flowering Plants', fig: 'Fig 6.6–6.8', title: 'T.S. of root, stem & leaf (dicot vs monocot)',
  desc: 'Tissue systems (epidermal, ground, vascular) as seen in transverse sections. The arrangement of the vascular bundle — radial/conjoint, open/closed, exarch/endarch — is the key to identification.',
  points: ['Root: radial bundles, exarch xylem; dicot 2–4 (tetrarch), monocot polyarch; pith small (dicot) vs large (monocot).', 'Stem: conjoint collateral; dicot open (cambium) in a ring; monocot closed, scattered with sclerenchymatous sheath.', 'Leaf: dorsiventral (dicot) vs isobilateral (monocot); xylem adaxial, phloem abaxial.', 'Casparian strips in root endodermis; starch sheath in dicot stem endodermis.'],
  variants: [{ name: 'Dicot root', build: tsDicotRoot }, { name: 'Monocot root', build: tsMonocotRoot }, { name: 'Dicot stem', build: tsDicotStem }, { name: 'Monocot stem', build: tsMonocotStem }, { name: 'Dicot leaf', build: () => leafTS(false) }, { name: 'Monocot leaf', build: () => leafTS(true) }]
}));

/* ---------- Ch 7 Structural Organisation in Animals ---------- */
function epith(kind) {
  const g = H.grp(), labels = [];
  g.add(H.box(4.4, 0.12, 2.0, C.pink, [0, -0.06, 0], null, { op: 0.95 }));
  labels.push(L('Basement membrane', 'Non-cellular layer on which epithelium rests', [1.8, -0.06, 1.0]));
  const grid = (w, h, d, nx, nz, col, y) => { for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { g.add(H.box(w - 0.04, h - 0.03, d - 0.04, col, [-((nx - 1) * w) / 2 + i * w, y + h / 2, -((nz - 1) * d) / 2 + k * d], null, { op: 0.85 })); g.add(H.sphere(Math.min(w, h) * 0.22, C.nuc, [-((nx - 1) * w) / 2 + i * w, y + h / 2, -((nz - 1) * d) / 2 + k * d], { seg: 10 })); } };
  if (kind === 'squamous') { grid(0.85, 0.16, 0.85, 5, 2, C.cyan, 0); labels.push(L('Squamous cells', 'Flat, thin, irregular boundaries — tile-like', [0, 0.1, 0.4])); labels.push(L('Nucleus (central, flattened)', 'Walls of blood vessels, alveoli — diffusion barrier', [0.85, 0.1, 0.43])); }
  if (kind === 'cuboidal') { grid(0.6, 0.6, 0.6, 7, 3, C.teal, 0); labels.push(L('Cuboidal cells', 'Cube-like; secretion & absorption', [0, 0.3, 0.6])); labels.push(L('Nucleus (central, round)', 'Ducts of glands, tubular parts of nephrons', [0.6, 0.3, 0.6])); labels.push(L('Microvilli (in PCT)', 'Brush border increases absorption surface', [-1.2, 0.62, 0])); }
  if (kind === 'columnar') { grid(0.5, 1.4, 0.7, 8, 2, C.amber, 0); for (let i = 0; i < 8; i++) for (let k = 0; k < 12; k++) g.add(H.rod([-1.75 + i * 0.5 + (k % 4 - 1.5) * 0.1, 1.4, -0.35 + Math.floor(k / 4) * 0.35 - 0.2], [-1.75 + i * 0.5 + (k % 4 - 1.5) * 0.1, 1.55, -0.35 + Math.floor(k / 4) * 0.35 - 0.2], 0.012, C.white, { seg: 4 })); g.add(H.ell(0.18, 0.5, 0.25, C.purple, [0.25, 0.85, 0.35], { op: 0.8 })); labels.push(L('Columnar cells', 'Tall, pillar-like; nucleus at base', [-1.0, 0.7, 0.35])); labels.push(L('Microvilli (free surface)', 'Absorption in intestine', [0, 1.55, 0])); labels.push(L('Goblet cell', 'Unicellular mucus-secreting gland', [0.25, 0.85, 0.35])); labels.push(L('Nucleus (basal)', 'Lining of stomach & intestine — secretion & absorption', [-1.75, 0.7, 0.35])); }
  if (kind === 'ciliated') { grid(0.5, 1.3, 0.7, 8, 2, C.lime, 0); for (let i = 0; i < 8; i++) for (let k = 0; k < 10; k++) g.add(H.tube([[-1.75 + i * 0.5 + (k % 5 - 2) * 0.09, 1.3, -0.35 + Math.floor(k / 5) * 0.7], [-1.7 + i * 0.5 + (k % 5 - 2) * 0.09, 1.55, -0.35 + Math.floor(k / 5) * 0.7], [-1.6 + i * 0.5 + (k % 5 - 2) * 0.09, 1.7, -0.35 + Math.floor(k / 5) * 0.7]], 0.012, C.white)); labels.push(L('Cilia', 'Move particles/mucus in a specific direction', [0, 1.6, 0])); labels.push(L('Ciliated columnar cells', 'Bronchioles, fallopian tubes', [-1.0, 0.65, 0.35])); labels.push(L('Nucleus', 'Basal position', [1.25, 0.65, 0.35])); }
  if (kind === 'compound') { grid(0.55, 0.55, 0.7, 8, 2, C.teal, 0); grid(0.6, 0.35, 0.7, 7, 2, C.cyan, 0.55); grid(0.7, 0.16, 0.7, 6, 2, C.blue, 0.9); labels.push(L('Basal layer (cuboidal, dividing)', 'Germinative layer on basement membrane', [-1.9, 0.27, 0.35])); labels.push(L('Middle polyhedral layers', 'Multiple layers — protection against chemical & mechanical stress', [0, 0.72, 0.35])); labels.push(L('Surface flattened cells', 'Stratified squamous: skin, buccal cavity, pharynx, ducts', [1.75, 0.98, 0.35])); }
  return { g, labels };
}
reg(Object.assign({}, B11, {
  id: 'b11-7-1', unit: U2, ch: 'Ch 7 — Structural Organisation in Animals', fig: 'Fig 7.1–7.3', title: 'Epithelial tissues',
  desc: 'Epithelium has a free surface facing a body fluid or the outside and cells compactly packed with little intercellular matrix. Simple epithelium is one cell thick; compound epithelium is multi-layered.',
  points: ['Squamous: blood vessels, alveoli. Cuboidal: gland ducts, nephron tubules (brush border in PCT).', 'Columnar: stomach & intestine lining; ciliated in bronchioles & fallopian tubes.', 'Glandular epithelium: unicellular (goblet) & multicellular (salivary gland); exocrine vs endocrine.', 'Cell junctions: tight (leak-proof), adhering (cementing), gap (communication).'],
  variants: [{ name: 'Squamous', build: () => epith('squamous') }, { name: 'Cuboidal', build: () => epith('cuboidal') }, { name: 'Columnar', build: () => epith('columnar') }, { name: 'Ciliated', build: () => epith('ciliated') }, { name: 'Compound', build: () => epith('compound') }]
}));

/* cockroach */
function roachBody(g, op = 0.25) {
  g.add(H.ell(0.45, 0.35, 0.3, C.brown, [0, 2.6, 0], { op }));
  g.add(H.ell(0.7, 0.9, 0.35, C.brown, [0, 1.5, 0], { op }));
  g.add(H.lathe([[0, -2.9], [0.55, -2.4], [0.8, -1.2], [0.8, 0.4], [0.6, 0.65], [0, 0.7]], C.brown, null, null, { op, seg: 24 }));
}
function roachMorph() {
  const g = H.grp(), labels = [];
  g.add(H.ell(0.45, 0.35, 0.3, '#78350f', [0, 2.6, 0]));
  g.add(H.ell(0.75, 0.6, 0.3, '#92400e', [0, 1.95, 0.02]));
  g.add(H.lathe([[0, -2.9], [0.6, -2.4], [0.9, -1.0], [0.9, 0.6], [0.7, 1.1], [0, 1.3]], '#78350f', null, null, { seg: 24 }));
  for (let i = 0; i < 10; i++) g.add(H.torus(0.9 - Math.abs(i - 4) * 0.06, 0.02, C.ink, [0, 0.9 - i * 0.38, 0], [PI / 2, 0, 0], { arc: PI, rot: [PI / 2, 0, PI] }));
  for (const s of [-1, 1]) { g.add(H.extrude([[0, 0], [s * 0.6, -0.3], [s * 0.7, -2.6], [s * 0.3, -3.2], [0, -3.0]], 0.03, '#a16207', [s * 0.15, 1.2, 0.34], null, { op: 0.9 })); g.add(H.tube([[s * 0.3, 2.85, 0.1], [s * 1.2, 3.6, 0.2], [s * 2.2, 3.9, 0.2]], 0.02, C.ink)); g.add(H.sphere(0.12, C.ink, [s * 0.35, 2.75, 0.2])); for (let k = 0; k < 3; k++) { const y = 2.2 - k * 0.45; g.add(H.tube([[s * 0.5, y, 0], [s * 1.5, y - 0.2 + k * 0.15, -0.2], [s * 2.1, y - 0.9 + k * 0.4, -0.5]], 0.04, '#a16207')); } g.add(H.tube([[s * 0.3, -2.8, 0], [s * 0.7, -3.3, 0], [s * 1.0, -3.7, 0]], 0.03, C.ink)); }
  g.add(H.box(0.2, 0.06, 0.15, C.ink, [0, 2.2, 0.35]));
  labels.push(L('Head (triangular)', 'Compound eyes; antennae; biting-chewing mouthparts; hypognathous', [0, 2.6, 0.3]));
  labels.push(L('Antennae', 'Long, filiform; sense organs monitoring the environment', [1.5, 3.7, 0.2]));
  labels.push(L('Pronotum (thorax)', 'Large shield of prothorax; thorax = pro-, meso-, metathorax', [0, 1.95, 0.32]));
  labels.push(L('Tegmina (forewings)', 'Opaque, leathery mesothoracic wings cover hind wings', [0.7, -0.5, 0.36]));
  labels.push(L('Walking legs (3 pairs)', 'One pair per thoracic segment', [-1.8, 1.0, -0.4]));
  labels.push(L('Abdomen (10 segments)', 'Females: 7th sternum forms genital pouch; males 9th sternum bears anal styles', [-0.9, -1.0, 0]));
  labels.push(L('Anal cerci', 'Pair of jointed sensory appendages on 10th segment (both sexes)', [0.9, -3.6, 0]));
  labels.push(L('Compound eye', 'Mosaic vision, ~2000 ommatidia', [0.35, 2.75, 0.2]));
  return { g, labels, note: 'Periplaneta americana: 34–53 mm; reddish-brown chitinous exoskeleton; sclerites joined by arthrodial membrane; sexes dimorphic (male has anal styles).' };
}
function roachDigest() {
  const g = H.grp(), labels = [];
  roachBody(g);
  g.add(H.tube([[0, 2.9, 0.1], [0, 2.4, 0.1], [0, 2.0, 0.1]], 0.08, C.pink));
  g.add(H.ell(0.35, 0.45, 0.3, C.amber, [0, 1.5, 0.1]));
  g.add(H.ell(0.28, 0.22, 0.25, C.orange, [0, 0.95, 0.1]));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(H.tube([[0, 0.7, 0.1], [0.35 * Math.cos(a), 0.55, 0.1 + 0.25 * Math.sin(a)], [0.55 * Math.cos(a), 0.15, 0.1 + 0.35 * Math.sin(a)]], 0.045, C.yellow)); }
  g.add(H.tube([[0, 0.7, 0.1], [0.05, 0.0, 0.1], [0, -0.7, 0.1]], 0.1, C.pink));
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.add(H.tube([[0, -0.7, 0.1], [0.4 * Math.cos(a), -0.6, 0.1 + 0.3 * Math.sin(a)], [0.7 * Math.cos(a), -0.2 + (i % 3) * 0.2, 0.1 + 0.4 * Math.sin(a)]], 0.015, C.lime)); }
  g.add(H.tube([[0, -0.7, 0.1], [0.3, -1.2, 0.1], [-0.3, -1.7, 0.1], [0, -2.2, 0.1]], 0.09, C.purple));
  g.add(H.ell(0.2, 0.3, 0.2, C.red, [0, -2.45, 0.1]));
  g.add(H.tube([[0, -2.7, 0.1], [0, -2.9, 0.1]], 0.05, C.red));
  g.add(H.ell(0.3, 0.22, 0.25, C.teal, [0.55, 2.4, 0.1], { op: 0.8 })); g.add(H.ell(0.3, 0.22, 0.25, C.teal, [-0.55, 2.4, 0.1], { op: 0.8 }));
  labels.push(L('Mouth → pharynx → oesophagus', 'Foregut begins; mouthparts: labrum, mandibles, maxillae, labium, hypopharynx', [0, 2.6, 0.2]));
  labels.push(L('Salivary glands', 'Pair with reservoirs; open into the pharynx', [0.55, 2.4, 0.35]));
  labels.push(L('Crop', 'Sac-like — food storage', [0, 1.5, 0.4]));
  labels.push(L('Gizzard (proventriculus)', '6 chitinous teeth grind food', [0, 0.95, 0.35]));
  labels.push(L('Hepatic caeca (6–8)', 'Gastric caeca at junction of fore- & midgut — secrete digestive juice', [0.55, 0.15, 0.45]));
  labels.push(L('Midgut (mesenteron)', 'Digestion & absorption', [0.05, 0.0, 0.2]));
  labels.push(L('Malpighian tubules (100–150)', 'Yellow thread-like; excretion (uric acid) at midgut–hindgut junction', [0.7, -0.1, 0.5]));
  labels.push(L('Hindgut: ileum, colon, rectum', 'Broader than midgut; rectum opens by anus', [-0.3, -1.7, 0.2]));
  labels.push(L('Rectum → anus', 'Rectal papillae absorb water', [0, -2.45, 0.3]));
  return { g, labels, note: 'Alimentary canal: foregut (mouth, pharynx, oesophagus, crop, gizzard), midgut, hindgut (ileum, colon, rectum). Foregut & hindgut lined by cuticle.' };
}
function roachNerve() {
  const g = H.grp(), labels = [];
  roachBody(g);
  g.add(H.ell(0.3, 0.2, 0.25, C.yellow, [0, 2.75, 0.1]));
  g.add(H.tube([[0.2, 2.7, 0.1], [0.35, 2.45, 0.1], [0.2, 2.25, 0.1]], 0.03, C.yellow)); g.add(H.tube([[-0.2, 2.7, 0.1], [-0.35, 2.45, 0.1], [-0.2, 2.25, 0.1]], 0.03, C.yellow));
  g.add(H.ell(0.25, 0.15, 0.2, C.yellow, [0, 2.2, 0.1]));
  const gang = [1.7, 1.25, 0.8, 0.3, -0.15, -0.6, -1.05, -1.5, -2.0];
  let prev = [0, 2.2, 0.1]; gang.forEach((y, i) => { const p = [0, y, 0.1]; g.add(H.rod([0.06, prev[1], 0.1], [0.06, y, 0.1], 0.025, C.yellow)); g.add(H.rod([-0.06, prev[1], 0.1], [-0.06, y, 0.1], 0.025, C.yellow)); g.add(H.ell(i < 3 ? 0.22 : 0.16, 0.12, 0.15, C.amber, p)); for (const s of [-1, 1]) g.add(H.tube([p, [s * 0.4, y - 0.05, 0.1], [s * 0.7, y - 0.15, 0.05]], 0.015, C.yellow)); prev = p; });
  g.add(H.tube([[0.3, 2.75, 0.1], [0.5, 3.0, 0.1], [0.5, 3.4, 0.1]], 0.02, C.yellow)); g.add(H.tube([[-0.3, 2.75, 0.1], [-0.5, 3.0, 0.1], [-0.5, 3.4, 0.1]], 0.02, C.yellow));
  labels.push(L('Supra-oesophageal ganglion (brain)', 'Fused ganglia in head; supplies antennae & compound eyes', [0, 2.75, 0.35]));
  labels.push(L('Circum-oesophageal connectives', 'Ring around the oesophagus', [0.35, 2.45, 0.1]));
  labels.push(L('Sub-oesophageal ganglion', 'Controls mouthparts', [0, 2.2, 0.3]));
  labels.push(L('Thoracic ganglia (3)', 'One per thoracic segment', [0, 1.25, 0.25]));
  labels.push(L('Abdominal ganglia (6)', 'Segmental; headless cockroach can live for a week', [0, -1.05, 0.25]));
  labels.push(L('Double ventral nerve cord', 'Paired longitudinal connectives', [0, 0.55, 0.15]));
  return { g, labels, note: 'Nervous system: ganglia (3 in head/thorax + 6 abdominal) on a double ventral nerve cord; most of the nervous system is ventral — head has only a bit.' };
}
function roachMale() {
  const g = H.grp(), labels = [];
  roachBody(g);
  for (const s of [-1, 1]) { g.add(H.ell(0.22, 0.32, 0.2, C.yellow, [s * 0.45, 0.1, 0.1], { op: 0.85 })); g.add(H.tube([[s * 0.45, -0.2, 0.1], [s * 0.35, -0.8, 0.1], [s * 0.15, -1.4, 0.1]], 0.03, C.yellow)); g.add(H.tube([[s * 0.15, -1.4, 0.1], [s * 0.1, -1.7, 0.1], [0, -2.1, 0.1]], 0.035, C.orange)); for (let k = 0; k < 8; k++) { const a = k / 8 * PI + PI; g.add(H.tube([[s * 0.15, -1.3, 0.1], [s * (0.35 + 0.3 * Math.cos(a)), -1.2 + 0.4 * Math.sin(a) * 0.5, 0.1 + 0.05 * k]], 0.025, C.pink)); } }
  g.add(H.ell(0.35, 0.3, 0.25, C.pink, [0, -1.3, 0.12], { op: 0.35 }));
  g.add(H.ell(0.2, 0.25, 0.15, C.purple, [0.35, -2.1, 0.1])); g.add(H.tube([[0, -2.1, 0.1], [0, -2.5, 0.1], [0, -2.85, 0.1]], 0.04, C.orange));
  g.add(H.cone(0.06, 0.4, C.ink, [0.4, -2.9, 0.1], [0, 0, 0.3])); g.add(H.cone(0.06, 0.4, C.ink, [-0.4, -2.9, 0.1], [0, 0, -0.3]));
  labels.push(L('Testes (pair)', 'In 4th–6th abdominal segments (lateral)', [0.45, 0.1, 0.3]));
  labels.push(L('Vas deferens', 'Carries sperm to ejaculatory duct', [0.35, -0.8, 0.1]));
  labels.push(L('Mushroom (utricular) gland', 'Accessory gland in 6th–7th segments', [0, -1.3, 0.37]));
  labels.push(L('Seminal vesicles', 'Store sperms glued as spermatophores', [-0.35, -1.25, 0.15]));
  labels.push(L('Ejaculatory duct', 'Opens by male gonopore ventral to anus', [0, -2.5, 0.15]));
  labels.push(L('Phallic gland', 'Accessory gland', [0.35, -2.1, 0.25]));
  labels.push(L('Gonapophyses (phallomere)', 'Chitinous external genitalia', [0.4, -2.9, 0.1]));
  return { g, labels, note: 'Male: testes → vas deferentia → seminal vesicle → ejaculatory duct → gonopore; sperms as spermatophores; anal styles present.' };
}
function roachFemale() {
  const g = H.grp(), labels = [];
  roachBody(g);
  for (const s of [-1, 1]) { for (let k = 0; k < 8; k++) { const x = s * (0.15 + k * 0.08); g.add(H.tube([[x, 0.9 - k * 0.05, 0.1], [x * 1.1, 0.2, 0.15], [s * (0.2 + k * 0.03), -0.5, 0.1]], 0.03, C.yellow)); for (let n = 0; n < 4; n++) g.add(H.sphere(0.035 + n * 0.012, C.amber, [x + (x * 0.1 - x) * n / 4, 0.9 - k * 0.05 - n * 0.35, 0.12], { seg: 8 })); } g.add(H.tube([[s * 0.2, -0.5, 0.1], [s * 0.15, -0.9, 0.1], [0, -1.3, 0.1]], 0.05, C.orange)); g.add(H.ell(0.25, 0.4, 0.15, C.cyan, [s * 0.45, -1.5, 0.1], { op: 0.6 })); }
  g.add(H.tube([[0, -1.3, 0.1], [0, -1.8, 0.1], [0, -2.3, 0.1]], 0.07, C.orange));
  g.add(H.ell(0.14, 0.2, 0.12, C.purple, [0.25, -1.9, 0.15]));
  g.add(H.ell(0.3, 0.35, 0.22, '#78350f', [0, -2.7, 0.1]));
  labels.push(L('Ovaries (pair, 8 ovarioles each)', 'In 2nd–6th abdominal segments', [0.4, 0.5, 0.25]));
  labels.push(L('Ovarioles', 'Chains of developing ova', [-0.6, 0.3, 0.15]));
  labels.push(L('Oviducts', 'Unite into a common oviduct (vagina)', [0.15, -0.9, 0.1]));
  labels.push(L('Colleterial glands', 'Secrete the ootheca (egg case)', [0.45, -1.5, 0.3]));
  labels.push(L('Spermatheca', 'Stores sperms; in 6th segment', [0.25, -1.9, 0.3]));
  labels.push(L('Vagina → genital chamber', 'Opens into genital chamber (gynatrium)', [0, -1.8, 0.2]));
  labels.push(L('Ootheca', 'Dark, chitinous capsule with 14–16 eggs; 9–10 per female', [0, -2.7, 0.35]));
  return { g, labels, note: 'Female: 8 ovarioles per ovary; spermatheca in 6th segment; ootheca with 14–16 eggs; nymphs moult ~13 times; paurometabolous development.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-7-2', unit: U2, ch: 'Ch 7 — Structural Organisation in Animals', fig: 'Fig 7.14–7.18', title: 'Cockroach: morphology & anatomy',
  desc: 'Periplaneta americana — external features, alimentary canal, nervous system and reproductive systems as given in NCERT.',
  points: ['Open circulation: 13-chambered tubular heart; haemolymph with haemocytes.', 'Respiration: 10 pairs of spiracles → tracheae (no blood involvement).', 'Excretion: Malpighian tubules (uricotelic); fat body, nephrocytes, urecose glands also help.', 'Mosaic vision by compound eyes; ootheca; paurometabolous development.'],
  variants: [{ name: 'Morphology', build: roachMorph }, { name: 'Digestive', build: roachDigest }, { name: 'Nervous', build: roachNerve }, { name: 'Male reproductive', build: roachMale }, { name: 'Female reproductive', build: roachFemale }]
}));

/* frog */
function frogOutline(g, op = 0.25) {
  g.add(H.ell(0.9, 1.3, 0.5, C.dgreen, [0, 0.2, 0], { op }));
  g.add(H.ell(0.6, 0.55, 0.4, C.dgreen, [0, 1.7, 0], { op }));
}
function frogMorph() {
  const g = H.grp(), labels = [];
  g.add(H.ell(1.0, 0.55, 1.5, '#4d7c0f', [0, 0, 0]));
  g.add(H.ell(0.65, 0.4, 0.7, '#4d7c0f', [0, 0.1, 1.8]));
  g.add(H.sphere(0.2, C.amber, [0.4, 0.45, 1.9])); g.add(H.sphere(0.2, C.amber, [-0.4, 0.45, 1.9]));
  g.add(H.disc(0.16, C.brown, [0.6, 0.25, 1.45], [0, PI / 2 + 0.4, 0])); g.add(H.disc(0.16, C.brown, [-0.6, 0.25, 1.45], [0, -PI / 2 - 0.4, 0]));
  g.add(H.sphere(0.04, C.ink, [0.15, 0.3, 2.45])); g.add(H.sphere(0.04, C.ink, [-0.15, 0.3, 2.45]));
  for (const s of [-1, 1]) { g.add(H.tube([[s * 0.8, -0.1, 1.2], [s * 1.4, -0.3, 1.4], [s * 1.7, -0.5, 1.9]], 0.09, '#4d7c0f')); for (let k = 0; k < 4; k++) g.add(H.rod([s * 1.7, -0.5, 1.9], [s * (1.7 + (k - 1.5) * 0.15), -0.55, 2.35], 0.03, '#4d7c0f')); g.add(H.tube([[s * 0.9, -0.1, -0.8], [s * 1.9, 0.3, -1.2], [s * 1.5, -0.4, -1.9], [s * 2.4, -0.55, -2.3]], 0.14, '#4d7c0f')); for (let k = 0; k < 5; k++) g.add(H.rod([s * 2.4, -0.55, -2.3], [s * (2.4 + (k - 2) * 0.2), -0.6, -2.9], 0.035, '#4d7c0f')); g.add(H.extrude([[0, 0], [s * 0.8, 0.02], [s * 0.4, 0.55]], 0.02, C.lime, [s * 2.0, -0.6, -2.9], [PI / 2, 0, 0], { op: 0.8 })); }
  labels.push(L('Head', 'Flat, triangular; mouth with sticky bilobed tongue', [0, 0.3, 2.2]));
  labels.push(L('Bulging eyes with nictitating membrane', 'Protects eye in water', [0.4, 0.5, 1.9]));
  labels.push(L('Tympanum', 'Membranous ear-drum receives sound', [0.7, 0.25, 1.45]));
  labels.push(L('External nostrils', 'On the snout', [0.15, 0.3, 2.45]));
  labels.push(L('Trunk', 'No neck or tail; skin moist, slimy (mucus) — cutaneous respiration', [0, 0.5, 0]));
  labels.push(L('Forelimb (4 digits)', 'Male has copulatory pads on 1st digit (sexual dimorphism)', [-1.5, -0.45, 1.85]));
  labels.push(L('Hind limb (5 webbed digits)', 'Long, muscular — leaping & swimming', [2.0, -0.3, -1.6]));
  labels.push(L('Webbed feet', 'Web between digits', [2.2, -0.6, -2.95]));
  return { g, labels, note: 'Rana tigrina: poikilotherm; camouflage (mimicry); aestivation & hibernation; dorsal olive-green, ventral pale yellow; males have vocal sacs.' };
}
function frogDigest() {
  const g = H.grp(), labels = [];
  frogOutline(g);
  g.add(H.tube([[0, 1.9, 0.1], [0, 1.5, 0.1], [0, 1.2, 0.1]], 0.08, C.pink));
  g.add(H.tube([[0, 1.2, 0.1], [0.25, 0.8, 0.1], [0.3, 0.3, 0.1], [0.1, 0, 0.1]], 0.16, C.amber));
  g.add(H.ell(0.7, 0.35, 0.25, '#7f1d1d', [-0.3, 1.0, -0.1], { op: 0.9 })); g.add(H.sphere(0.12, C.green, [-0.45, 0.85, 0.15]));
  g.add(H.ell(0.35, 0.12, 0.1, C.yellow, [0.35, 0.05, 0.25]));
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([0.45 * Math.sin(t * 5 * PI) * (1 - t * 0.3), -0.05 - t * 1.1, 0.1 + 0.15 * Math.cos(t * 5 * PI)]); }
  g.add(H.tube(pts, 0.07, C.pink, { seg: 60 }));
  g.add(H.tube([[pts[16][0], pts[16][1], pts[16][2]], [0, -1.35, 0.1], [0, -1.7, 0.1]], 0.14, C.purple));
  g.add(H.cyl(0.12, 0.12, 0.25, C.red, [0, -1.9, 0.1]));
  g.add(H.ell(0.3, 0.2, 0.2, C.cyan, [0.45, -1.7, 0.1], { op: 0.6 }));
  labels.push(L('Buccal cavity → pharynx', 'Bilobed tongue; teeth on upper jaw', [0, 1.9, 0.3]));
  labels.push(L('Oesophagus', 'Short tube to stomach', [0, 1.5, 0.2]));
  labels.push(L('Stomach', 'Gastric glands: HCl + pepsin', [0.3, 0.5, 0.3]));
  labels.push(L('Liver (3 lobes) & gall bladder', 'Bile stored in gall bladder', [-0.5, 1.0, 0.2]));
  labels.push(L('Pancreas', 'Pancreatic juice to duodenum via common bile duct (hepatopancreatic)', [0.35, 0.05, 0.4]));
  labels.push(L('Small intestine (duodenum + ileum)', 'Coiled; villi & microvilli absorb', [0.4, -0.6, 0.3]));
  labels.push(L('Rectum', 'Large intestine; opens into cloaca', [0, -1.5, 0.3]));
  labels.push(L('Cloaca', 'Common chamber for faeces, urine & gametes', [0, -1.9, 0.25]));
  labels.push(L('Urinary bladder', 'Opens into cloaca', [0.45, -1.7, 0.3]));
  return { g, labels, note: 'Frog digestive: short alimentary canal (carnivore); duodenum receives hepatopancreatic duct; digestion completed in intestine; cloacal aperture.' };
}
function frogUrino(male) {
  const g = H.grp(), labels = [];
  frogOutline(g);
  for (const s of [-1, 1]) {
    g.add(H.ell(0.22, 0.75, 0.15, '#7f1d1d', [s * 0.45, 0.3, 0]));
    for (let k = 0; k < 6; k++) g.add(H.rod([s * 0.45, 0.9 - k * 0.25, 0.1], [s * 0.9, 0.85 - k * 0.25, 0.1], 0.015, C.yellow, { seg: 4 }));
    g.add(H.tube([[s * 0.6, -0.4, 0.05], [s * 0.4, -1.0, 0.05], [0, -1.6, 0.05]], 0.05, C.yellow));
    g.add(H.ell(0.18, 0.28, 0.12, C.amber, [s * 0.5, 1.4, 0.15], { op: 0.8 }));
    if (male) { g.add(H.ell(0.15, 0.25, 0.12, C.pink, [s * 0.12, 0.6, 0.15])); for (let k = 0; k < 6; k++) g.add(H.tube([[s * 0.2, 0.75 - k * 0.1, 0.15], [s * 0.3, 0.7 - k * 0.1, 0.1]], 0.012, C.white)); g.add(H.rod([s * 0.35, 0.95, 0.06], [s * 0.35, -0.35, 0.06], 0.02, C.cyan)); }
    else { for (let k = 0; k < 14; k++) g.add(H.sphere(0.05, C.ink, [s * (0.9 + 0.25 * Math.cos(k * 1.2)), 0.8 - k * 0.11, 0.15 + 0.2 * Math.sin(k * 1.2)], { seg: 6 })); g.add(H.tube([[s * 1.0, 1.2, 0.05], [s * 1.35, 0.6, 0.1], [s * 1.2, -0.3, 0.15], [s * 1.3, -0.9, 0.1], [s * 0.5, -1.4, 0.05], [0, -1.6, 0.05]], 0.035, C.pink)); g.add(H.ell(0.15, 0.3, 0.12, C.orange, [s * 0.7, -1.15, 0.1], { op: 0.7 })); }
  }
  g.add(H.cyl(0.14, 0.14, 0.3, C.red, [0, -1.85, 0.05]));
  g.add(H.ell(0.35, 0.22, 0.2, C.cyan, [0.35, -1.85, 0.15], { op: 0.6 }));
  labels.push(L('Kidneys (mesonephric)', 'Compact, dark red, bean-like; dorsal', [0.45, 0.3, 0.15]));
  labels.push(L('Adrenal gland', 'Yellowish strip on ventral kidney surface', [-0.45, 0.9, 0.12]));
  labels.push(L('Fat bodies', 'Yellow finger-like — store food for hibernation', [0.5, 1.4, 0.3]));
  if (male) { labels.push(L('Testes (pair)', 'Yellowish ovoid; attached to kidney by mesorchium', [-0.12, 0.6, 0.3])); labels.push(L('Vasa efferentia (10–12)', 'Carry sperm into Bidder\'s canal in kidney', [0.3, 0.6, 0.1])); labels.push(L('Bidder\'s canal', 'Longitudinal canal within kidney', [0.35, 0.3, 0.06])); labels.push(L('Urinogenital duct', 'Common duct for urine & sperm → cloaca', [0.4, -1.0, 0.05])); }
  else { labels.push(L('Ovaries (pair)', 'Near kidneys; no functional connection with kidney', [1.0, 0.4, 0.3])); labels.push(L('Oviducts', 'Separate from kidney ducts; open into cloaca', [1.3, -0.4, 0.15])); labels.push(L('Ovisac', 'Dilated posterior oviduct stores ova', [0.7, -1.15, 0.25])); labels.push(L('Ureter', 'Carries only urine in female', [-0.4, -1.0, 0.05])); labels.push(L('2500–3000 ova', 'Laid at a time; external fertilisation in water', [-1.0, 0.4, 0.3])); }
  labels.push(L('Cloaca', 'Common opening for urine, gametes, faeces', [0, -1.85, 0.2]));
  labels.push(L('Urinary bladder', 'Thin-walled, from ventral cloaca', [0.35, -1.85, 0.3]));
  return { g, labels, note: male ? 'Male frog: testes → vasa efferentia → Bidder\'s canal → urinogenital duct → cloaca. Ureotelic.' : 'Female frog: ovaries → oviducts (separate from kidney) → ovisac → cloaca; external fertilisation; tadpole larva.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-7-3', unit: U2, ch: 'Ch 7 — Structural Organisation in Animals', fig: 'Fig 7.19–7.21', title: 'Frog: morphology, digestive & urinogenital systems',
  desc: 'Rana tigrina — the common Indian bull frog — external morphology, alimentary canal, and the urinogenital system of male and female.',
  points: ['Heart 3-chambered (2 auricles + 1 ventricle); sinus venosus & conus arteriosus; RBCs nucleated.', 'Respiration: cutaneous (water), buccal & pulmonary (land); lungs simple sacs.', 'Brain: forebrain (olfactory lobes, cerebral hemispheres, diencephalon), midbrain (optic lobes), hindbrain (cerebellum, medulla); 10 pairs cranial nerves.', 'Ureotelic; mesonephric kidneys; external fertilisation; tadpole undergoes metamorphosis.'],
  variants: [{ name: 'Morphology', build: frogMorph }, { name: 'Digestive', build: frogDigest }, { name: 'Male urinogenital', build: () => frogUrino(true) }, { name: 'Female urinogenital', build: () => frogUrino(false) }]
}));


/* ---------- Ch 8 Cell: The Unit of Life ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-8-4', unit: U3, ch: 'Ch 8 — Cell: The Unit of Life', fig: 'Fig 8.4', title: 'Fluid mosaic model of plasma membrane',
  desc: 'Singer & Nicolson (1972): the membrane is a quasi-fluid lipid bilayer in which proteins float — integral proteins span the bilayer, peripheral proteins lie on the surface. Lipid ~52%, protein ~40% in RBC membrane.',
  points: ['Phospholipids: polar (hydrophilic) heads outside, non-polar (hydrophobic) tails inside — tails protected from water.', 'Fluid nature allows lateral movement of lipids/proteins → growth, endocytosis, cell division, junctions.', 'Transport: passive (simple diffusion, osmosis, facilitated) vs active (needs ATP, e.g. Na⁺/K⁺ pump).', 'Cholesterol & glycoproteins/glycolipids (carbohydrate chains on outer face) are also present.'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    const W = 5, D = 2.6, nx = 14, nz = 7;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = -W / 2 + (i + 0.5) * W / nx, z = -D / 2 + (k + 0.5) * D / nz;
      if (Math.abs(x - 0.9) < 0.55 && Math.abs(z) < 0.5) continue; if (Math.abs(x + 1.3) < 0.4 && Math.abs(z - 0.3) < 0.4) continue;
      for (const s of [1, -1]) {
        const head = H.sphere(0.16, C.lipid, [x, s * 0.55, z], { seg: 10 });
        g.add(H.ex(head, 0, s * 0.6, 0));
        for (const dx of [-0.06, 0.06]) g.add(H.ex(H.rod([x + dx, s * 0.42, z], [x + dx * 1.5, s * 0.05, z + dx * (k % 2 ? 1 : -1)], 0.02, C.yellow, { seg: 5 }), 0, s * 0.6, 0));
      }
    }
    // integral protein (channel)
    const ip = H.grp([], [0.9, 0, 0]); ip.add(H.cyl(0.5, 0.5, 1.7, C.prot, [0, 0, 0], null, { seg: 20 })); ip.add(H.cyl(0.18, 0.18, 1.75, C.ink, [0, 0, 0], null, { seg: 12 })); g.add(H.ex(ip, 0, 0, 1.4));
    // integral (single pass) protein
    g.add(H.ex(H.ell(0.35, 0.95, 0.35, C.orange, [-1.3, 0, 0.3]), 0, 0, 1.2));
    // peripheral proteins
    g.add(H.ex(H.ell(0.42, 0.22, 0.32, C.purple, [-0.1, 0.85, -0.6]), 0, 0.9, 0));
    g.add(H.ex(H.ell(0.4, 0.2, 0.3, C.purple, [1.9, -0.85, 0.5]), 0, -0.9, 0));
    // cholesterol
    g.add(H.ex(H.box(0.12, 0.42, 0.12, C.red, [-2.0, 0.28, -0.2]), 0, 0.6, 0));
    g.add(H.ex(H.box(0.12, 0.42, 0.12, C.red, [0.1, -0.28, 0.9]), 0, -0.6, 0));
    // glycoprotein & glycolipid chains (outer face)
    const chain = (p) => { const c = H.grp(); let cur = V3(...p); for (let k = 0; k < 5; k++) { const nxt = cur.clone().add(V3(0.12 * Math.sin(k * 1.7), 0.22, 0.1 * Math.cos(k * 1.3))); c.add(H.rod(cur, nxt, 0.02, C.green)); c.add(H.sphere(0.06, C.green, nxt.toArray(), { seg: 7 })); cur = nxt; } return c; };
    g.add(H.ex(chain([0.9, 0.85, 0]), 0, 0, 1.4)); g.add(H.ex(chain([1.7, 0.7, -0.9]), 0, 0.6, 0));
    labels.push(L('Phospholipid bilayer', 'Two layers; hydrophilic heads face water, hydrophobic tails inward', [-2.3, 0.55, 1.1]));
    labels.push(L('Polar head (hydrophilic)', 'Phosphate group — faces aqueous exterior/cytoplasm', [-1.6, 0.55, -1.1]));
    labels.push(L('Non-polar tails (hydrophobic)', 'Fatty acid chains buried in the core', [2.1, 0.05, 1.1]));
    labels.push(L('Integral protein (channel)', 'Spans the membrane; transport of ions/molecules', [0.9, 0.85, 0]));
    labels.push(L('Peripheral protein', 'On the surface of the bilayer', [-0.1, 0.95, -0.6]));
    labels.push(L('Cholesterol', 'Stabilises fluidity', [-2.0, 0.28, -0.2]));
    labels.push(L('Glycoprotein / glycolipid', 'Carbohydrate chains on OUTER surface — recognition', [1.5, 1.7, -0.9]));
    labels.push(L('Extracellular side', 'Outside of the cell', [0, 1.2, 1.3]));
    labels.push(L('Cytoplasmic side', 'Inside of the cell', [0, -1.2, 1.3]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-8-5', unit: U3, ch: 'Ch 8 — Cell: The Unit of Life', fig: 'Fig 8.5', title: 'Mitochondrion (sectional view)',
  desc: 'The mitochondrion is a double-membrane-bound, sausage-shaped organelle (0.2–1.0 µm × 1–4 µm). The inner membrane forms cristae that enlarge surface area; the matrix contains its own circular DNA, 70S ribosomes and enzymes.',
  points: ['Outer membrane smooth & permeable; inner membrane infolded into cristae (site of ETS & oxidative phosphorylation).', 'Matrix: Krebs cycle enzymes, circular dsDNA, RNA, 70S ribosomes — semi-autonomous.', '"Powerhouse of the cell" — aerobic respiration, ATP production.', 'Divides by fission; visible under microscope only after Janus green staining.'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    const prof = (r, len) => { const p = []; for (let i = 0; i <= 10; i++) { const a = -PI / 2 + i / 10 * PI / 2; p.push([r * Math.cos(a), -len / 2 + r * Math.sin(a)]); } for (let i = 0; i <= 10; i++) { const a = i / 10 * PI / 2; p.push([r * Math.cos(a), len / 2 + r * Math.sin(a)]); } return p; };
    // outer membrane: back half (opaque) + front half (transparent, explodes away)
    const back = H.lathe(prof(1.15, 3.0), C.orange, null, [0, 0, PI / 2], { seg: 40, phiStart: 0, phiLen: PI, op: 0.9, side: THREE.DoubleSide });
    back.rotation.set(PI / 2, 0, PI / 2); g.add(back);
    const front = H.lathe(prof(1.17, 3.0), C.orange, null, null, { seg: 40, phiStart: PI, phiLen: PI, op: 0.12, dw: false, side: THREE.DoubleSide });
    front.rotation.set(PI / 2, 0, PI / 2); g.add(H.ex(front, 0, 0, 2.2));
    // inner membrane
    const inner = H.lathe(prof(0.95, 2.7), '#b45309', null, null, { seg: 40, phiStart: 0, phiLen: PI, op: 0.9, side: THREE.DoubleSide });
    inner.rotation.set(PI / 2, 0, PI / 2); g.add(H.ex(inner, 0, -0.0, 0));
    // cristae (shelf-like folds)
    const cr = H.grp();
    for (let i = 0; i < 7; i++) { const x = -1.3 + i * 0.43; const side = i % 2 ? 1 : -1; const hgt = 1.35; cr.add(H.box(0.1, hgt, 0.9, '#ea580c', [x, side * (0.95 - hgt / 2) * 0.55, -0.35], null, { op: 0.95 })); for (let k = 0; k < 5; k++) { cr.add(H.sphere(0.045, C.red, [x + 0.08, side * (0.95 - hgt / 2) * 0.55 - hgt / 2 + 0.2 + k * 0.24, -0.35 + (k % 2 ? 0.3 : -0.3)], { seg: 6, e: 0.7 })); } }
    g.add(H.ex(cr, 0, 0, 1.0));
    // matrix contents
    const mx = H.grp();
    mx.add(H.tube([[0.2, 0.3, -0.6], [0.6, 0.45, -0.5], [0.9, 0.2, -0.65], [0.7, -0.1, -0.5], [0.3, 0.0, -0.6]], 0.025, C.dna, { closed: true, seg: 40 }));
    const rng = H.rng(6); for (let i = 0; i < 14; i++) mx.add(H.sphere(0.04, C.purple, [(rng() - 0.5) * 2.6, (rng() - 0.5) * 1.2, -0.55 + (rng() - 0.5) * 0.5], { seg: 6 }));
    g.add(H.ex(mx, 0, -1.2, 0));
    labels.push(L('Outer membrane', 'Smooth, porous; limits the organelle', [1.1, 0.9, -0.3]));
    labels.push(L('Inner membrane', 'Selectively permeable; folded into cristae; bears ETS complexes', [-1.55, 0.3, 0.1]));
    labels.push(L('Cristae', 'Infoldings of inner membrane — increase surface area for oxidative phosphorylation', [-0.44, 0.45, -0.35]));
    labels.push(L('F₁ particles (oxysomes)', 'ATP synthase heads on cristae', [0.42, -0.4, -0.05]));
    labels.push(L('Matrix', 'Inner compartment: Krebs cycle enzymes, DNA, ribosomes', [0.4, -0.6, -0.55]));
    labels.push(L('Circular DNA', 'Own genome — semi-autonomous', [0.6, 0.2, -0.6]));
    labels.push(L('70S ribosomes', 'Prokaryote-like ribosomes in matrix', [-0.9, -0.3, -0.5]));
    labels.push(L('Intermembrane (perimitochondrial) space', 'Between the two membranes; H⁺ accumulates here', [-1.0, 1.05, -0.3]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-8-6', unit: U3, ch: 'Ch 8 — Cell: The Unit of Life', fig: 'Fig 8.6', title: 'Chloroplast (sectional view)',
  desc: 'Chloroplasts are lens-shaped, double-membrane plastids (5–10 µm × 2–4 µm). Thylakoids stacked as grana lie in the stroma; stroma lamellae connect grana. Light reactions occur on thylakoid membranes; the Calvin cycle in stroma.',
  points: ['Outer membrane, inner membrane (less permeable), stroma, thylakoid system.', 'Grana: 40–60 per chloroplast, each a stack of thylakoids; stroma lamellae interconnect them.', 'Stroma contains enzymes of carbohydrate & protein synthesis, circular DNA & 70S ribosomes.', 'Chlorophyll pigments in thylakoid membrane; mesophyll cell has 20–40 chloroplasts.'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    const prof = (rx, ry) => { const p = []; for (let i = 0; i <= 20; i++) { const a = -PI / 2 + i / 20 * PI; p.push([rx * Math.cos(a), ry * Math.sin(a)]); } return p; };
    const back = H.lathe(prof(1.2, 2.2), C.dgreen, null, null, { seg: 40, phiStart: 0, phiLen: PI, op: 0.9, side: THREE.DoubleSide }); back.rotation.set(PI / 2, 0, PI / 2); g.add(back);
    const front = H.lathe(prof(1.22, 2.22), C.dgreen, null, null, { seg: 40, phiStart: PI, phiLen: PI, op: 0.12, dw: false, side: THREE.DoubleSide }); front.rotation.set(PI / 2, 0, PI / 2); g.add(H.ex(front, 0, 0, 2.4));
    const inner = H.lathe(prof(1.05, 2.05), C.green, null, null, { seg: 40, phiStart: 0, phiLen: PI, op: 0.6, side: THREE.DoubleSide }); inner.rotation.set(PI / 2, 0, PI / 2); g.add(inner);
    // grana stacks
    const gr = H.grp();
    const stacks = [[-1.2, 0.1, -0.3, 6], [-0.3, -0.4, -0.5, 8], [0.5, 0.35, -0.3, 7], [1.3, -0.2, -0.4, 5], [0.1, 0.55, -0.6, 4]];
    stacks.forEach(([x, y, z, n]) => { for (let k = 0; k < n; k++) gr.add(H.cyl(0.32, 0.32, 0.06, C.leaf, [x, y - n * 0.05 + k * 0.1, z], null, { seg: 20 })); });
    // stroma lamellae connecting
    for (let i = 0; i < stacks.length - 1; i++) { const a = stacks[i], b = stacks[i + 1]; gr.add(H.tube([[a[0], a[1], a[2]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.15, (a[2] + b[2]) / 2], [b[0], b[1], b[2]]], 0.03, C.lime)); }
    g.add(H.ex(gr, 0, 0, 1.2));
    const mx = H.grp();
    mx.add(H.tube([[0.9, 0.7, -0.5], [1.3, 0.75, -0.4], [1.5, 0.5, -0.55], [1.2, 0.35, -0.5]], 0.025, C.dna, { closed: true, seg: 30 }));
    mx.add(H.ell(0.28, 0.16, 0.14, C.white, [-0.7, -0.75, -0.5], { op: 0.9 }));
    const rng = H.rng(8); for (let i = 0; i < 16; i++) mx.add(H.sphere(0.04, C.purple, [(rng() - 0.5) * 3.2, (rng() - 0.5) * 1.6, -0.6 + (rng() - 0.5) * 0.4], { seg: 6 }));
    g.add(H.ex(mx, 0, -1.3, 0));
    labels.push(L('Outer membrane', 'Smooth, permeable', [1.5, 0.9, -0.2]));
    labels.push(L('Inner membrane', 'Relatively less permeable', [-1.7, 0.6, 0]));
    labels.push(L('Granum', 'Stack of thylakoids (like coins) — light reactions', [-0.3, -0.4, -0.5]));
    labels.push(L('Thylakoid', 'Flattened membranous sac bearing chlorophyll & photosystems', [0.5, 0.65, -0.3]));
    labels.push(L('Stroma lamellae', 'Flat membranous tubules connecting grana (intergranal thylakoids)', [0.1, 0.1, -0.4]));
    labels.push(L('Stroma', 'Matrix: Calvin cycle enzymes, DNA, ribosomes', [-1.0, -0.3, -0.5]));
    labels.push(L('Circular DNA', 'Chloroplast genome — semi-autonomous', [1.3, 0.6, -0.45]));
    labels.push(L('Starch grain', 'Stored product of photosynthesis', [-0.7, -0.75, -0.5]));
    labels.push(L('Ribosomes (70S)', 'Protein synthesis in stroma', [0.6, -0.9, -0.5]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-8-7', unit: U3, ch: 'Ch 8 — Cell: The Unit of Life', fig: 'Fig 8.7', title: 'Structure of the nucleus',
  desc: 'The nucleus (Robert Brown, 1831) is bounded by a double nuclear envelope with pores, encloses nucleoplasm, chromatin and one or more nucleoli. The outer membrane is continuous with ER and bears ribosomes.',
  points: ['Perinuclear space 10–50 nm between the two membranes.', 'Nuclear pores: passage of RNA & proteins in both directions.', 'Nucleolus: non-membranous; site of active rRNA synthesis.', 'Chromatin = DNA + histone & non-histone proteins + RNA; condenses into chromosomes during division.'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    g.add(H.sphere(1.6, C.nuc, null, { phi: PI, phiStart: PI, op: 0.9, side: THREE.DoubleSide }));
    g.add(H.sphere(1.5, C.purple, null, { phi: PI, phiStart: PI, op: 0.5, side: THREE.DoubleSide }));
    g.add(H.ex(H.sphere(1.62, C.nuc, null, { phi: PI, phiStart: 0, op: 0.18, dw: false, side: THREE.DoubleSide }), 0, 0, 2.3));
    for (let i = 0; i < 18; i++) { const a = (i * 2.39), b = Math.acos(1 - 2 * (i + 0.5) / 18); const d = V3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); if (d.z > 0.15) continue; const p = d.clone().multiplyScalar(1.55); const t = H.torus(0.12, 0.04, C.yellow, p.toArray(), null, { seg: 8, tseg: 16 }); t.quaternion.setFromUnitVectors(V3(0, 0, 1), d); g.add(t); }
    g.add(H.ex(H.sphere(0.45, C.pink, [0.3, 0.2, -0.4], { e: 0.5 }), 0, 0, 1.0));
    const chr = H.grp(); const rng = H.rng(13); for (let i = 0; i < 6; i++) { const pts = []; for (let k = 0; k < 6; k++) pts.push([(rng() - 0.5) * 2.2, (rng() - 0.5) * 2.2, -1.1 + rng() * 0.9]); chr.add(H.tube(pts, 0.03, C.dna, { seg: 40 })); } g.add(H.ex(chr, 0, 0, 0.6));
    // ER continuous with outer membrane + ribosomes
    g.add(H.tube([[1.6, 0.2, -0.3], [2.1, 0.5, -0.4], [2.6, 0.3, -0.2], [3.0, 0.6, -0.4]], 0.06, C.mem, { op: 0.8 }));
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; g.add(H.sphere(0.05, C.purple, [1.68 * Math.cos(a), 1.68 * Math.sin(a), -0.2], { seg: 6 })); }
    for (let i = 0; i < 6; i++) g.add(H.sphere(0.045, C.purple, [1.7 + i * 0.25, 0.3 + 0.2 * Math.sin(i * 1.5) + 0.08, -0.3], { seg: 6 }));
    labels.push(L('Nuclear envelope (2 membranes)', 'Outer membrane continuous with ER; perinuclear space between', [-1.2, 1.1, -0.3]));
    labels.push(L('Nuclear pore', 'Passage for RNA & proteins', [1.1, 1.1, -0.3]));
    labels.push(L('Nucleolus', 'Dense, non-membranous; rRNA synthesis', [0.3, 0.2, -0.4]));
    labels.push(L('Chromatin', 'DNA + histones; euchromatin (loose) & heterochromatin (condensed)', [-0.6, -0.5, -0.8]));
    labels.push(L('Nucleoplasm', 'Nuclear matrix', [-0.9, 0.3, -0.6]));
    labels.push(L('Endoplasmic reticulum', 'Continuous with outer nuclear membrane', [2.6, 0.3, -0.2]));
    labels.push(L('Ribosomes', 'On outer membrane & RER', [1.9, 0.55, -0.3]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-8-8', unit: U3, ch: 'Ch 8 — Cell: The Unit of Life', fig: 'Fig 8.8', title: 'Chromosome types by centromere position',
  desc: 'Every chromosome has a primary constriction (centromere) with kinetochores. Based on centromere position, chromosomes are metacentric, sub-metacentric, acrocentric or telocentric.',
  points: ['Metacentric: middle centromere, equal arms. Sub-metacentric: one short & one long arm.', 'Acrocentric: centromere near end — one very short, one very long arm. Telocentric: terminal centromere.', 'Secondary constriction gives a satellite (SAT chromosome).', 'Chromatid = one of two identical copies; centromere holds sister chromatids.'],
  build() {
    const g = H.grp(), labels = [];
    const chrom = (x, frac, col) => { const len = 2.6, yc = -len / 2 + len * frac; for (const s of [-0.13, 0.13]) { const pts = [[x + s * 1.6, -len / 2, 0], [x + s, yc - 0.35, 0], [x + s * 0.4, yc, 0], [x + s, yc + 0.35, 0], [x + s * 1.6, len / 2, 0]]; g.add(H.tube(pts, 0.14, col, { seg: 30, tension: 0.4 })); } g.add(H.sphere(0.17, C.yellow, [x, yc, 0], { e: 0.6 })); return [x, yc, 0]; };
    const a = chrom(-2.1, 0.5, C.purple), b = chrom(-0.7, 0.32, C.blue), c = chrom(0.7, 0.14, C.teal), d = chrom(2.1, 0.02, C.pink);
    labels.push(L('Metacentric', 'Centromere in the middle → two equal arms', a));
    labels.push(L('Sub-metacentric', 'Centromere slightly away from middle → one shorter, one longer arm', b));
    labels.push(L('Acrocentric', 'Centromere close to the end → one extremely short, one very long arm', c));
    labels.push(L('Telocentric', 'Terminal centromere', d));
    labels.push(L('Sister chromatids', 'Two identical copies joined at centromere', [-2.1 + 0.21, 1.3, 0]));
    labels.push(L('Short arm (p)', 'Above the centromere', [0.7 + 0.2, -1.0, 0]));
    labels.push(L('Long arm (q)', 'Below the centromere', [0.7 - 0.2, 0.5, 0]));
    return { g, labels };
  }
}));

/* ---------- Ch 10 Cell Cycle ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-10-1', unit: U3, ch: 'Ch 10 — Cell Cycle and Cell Division', fig: 'Fig 10.1', title: 'The cell cycle',
  desc: 'A typical human cell cycle takes ~24 h: interphase (G₁, S, G₂ ~ 95%) followed by M phase (~1 h). Cells that stop dividing enter the quiescent G₀ stage.',
  points: ['G₁: cell metabolically active, grows, prepares DNA replication. S: DNA replicates — DNA doubles (2C→4C), chromosome number stays same (2n).', 'G₂: proteins synthesised for mitosis. M phase: karyokinesis + cytokinesis.', 'Yeast cell cycle ≈ 90 min. Centriole duplicates in S phase (animal cells).', 'G₀ (quiescent): cells remain metabolically active but do not proliferate (e.g. heart cells).'],
  build() {
    const g = H.grp(), labels = [];
    const seg = (a0, a1, col) => g.add(H.torus(1.7, 0.28, col, null, null, { arc: a1 - a0, rot: [0, 0, a0], tseg: 40 }));
    // angles: G1 ~ 40%, S ~ 35%, G2 ~ 20%, M ~ 5%
    const M = 0.06 * TAU, G1 = 0.40 * TAU, S = 0.34 * TAU, G2 = 0.20 * TAU;
    let a = PI / 2 - M / 2; seg(a, a + M, C.red); a -= G1; seg(a, a + G1, C.green); a -= S; seg(a, a + S, C.blue); a -= G2; seg(a, a + G2, C.purple);
    const mid = (start, len) => [1.7 * Math.cos(start + len / 2), 1.7 * Math.sin(start + len / 2), 0.3];
    const aM = PI / 2 - M / 2, aG1 = aM - G1, aS = aG1 - S, aG2 = aS - G2;
    g.add(H.text('M', { size: 0.3, bold: true, pos: mid(aM, M) })); g.add(H.text('G₁', { size: 0.3, bold: true, pos: mid(aG1, G1) })); g.add(H.text('S', { size: 0.3, bold: true, pos: mid(aS, S) })); g.add(H.text('G₂', { size: 0.3, bold: true, pos: mid(aG2, G2) }));
    g.add(H.text('Interphase', { size: 0.26, pos: [0, -0.2, 0], color: C.grey })); g.add(H.text('≈ 24 h (human)', { size: 0.18, pos: [0, -0.55, 0], color: C.grey }));
    g.add(H.arc(2.15, aG1 + G1 * 0.5, aG1 + G1 * 0.4, C.white, { r: 0.02, hl: 0.16 }));
    // G0 branch
    const p = [1.7 * Math.cos(aG1 + G1 * 0.25), 1.7 * Math.sin(aG1 + G1 * 0.25), 0];
    g.add(H.arrow(p, [p[0] * 1.55, p[1] * 1.55, 0], C.amber, { r: 0.025 })); g.add(H.sphere(0.32, C.amber, [p[0] * 1.8, p[1] * 1.8, 0], { op: 0.8 })); g.add(H.text('G₀', { size: 0.26, bold: true, pos: [p[0] * 1.8, p[1] * 1.8, 0.35] }));
    labels.push(L('M phase (mitosis)', 'Karyokinesis + cytokinesis; ~1 h of 24 h', [0, 1.7, 0.3]));
    labels.push(L('G₁ phase (gap 1)', 'Growth; cell prepares for DNA replication', mid(aG1, G1)));
    labels.push(L('S phase (synthesis)', 'DNA replication: 2C → 4C; chromosome number unchanged', mid(aS, S)));
    labels.push(L('G₂ phase (gap 2)', 'Proteins & RNA for mitosis; growth continues', mid(aG2, G2)));
    labels.push(L('G₀ (quiescent stage)', 'Exit from G₁; metabolically active but not dividing', [p[0] * 1.8, p[1] * 1.8, 0]));
    labels.push(L('Interphase', 'G₁ + S + G₂ — 95% of the cycle', [0, -0.2, 0]));
    return { g, labels };
  }
}));

/* mitosis stage builders */
function cellShell(g, rx = 2.2, ry = 1.7, col = C.mem) { g.add(H.ell(rx, ry, ry * 0.8, col, null, { op: 0.15, side: THREE.DoubleSide, dw: false })); }
function chromX(x, y, z, col, s = 1, rot = 0) { const grp = H.grp([], [x, y, z], [0, 0, rot]); for (const d of [-1, 1]) grp.add(H.tube([[d * 0.22 * s, -0.5 * s, 0], [d * 0.06 * s, 0, 0], [d * 0.22 * s, 0.5 * s, 0]], 0.07 * s, col, { seg: 16 })); grp.add(H.sphere(0.09 * s, C.yellow, [0, 0, 0], { seg: 10, e: 0.6 })); return grp; }
function chromSingle(x, y, z, col, s = 1, bend = 1) { return H.tube([[x - 0.2 * s * bend, y - 0.5 * s, z], [x, y, z], [x - 0.2 * s * bend, y + 0.5 * s, z]], 0.07 * s, col, { seg: 16 }); }
function centrosome(g, x, y, z, rays = 10) { g.add(H.rod([x - 0.12, y, z], [x + 0.12, y, z], 0.05, C.orange)); g.add(H.rod([x, y - 0.12, z + 0.1], [x, y + 0.12, z + 0.1], 0.05, C.orange)); for (let i = 0; i < rays; i++) { const a = i / rays * TAU; g.add(H.rod([x, y, z], [x + 0.35 * Math.cos(a), y + 0.35 * Math.sin(a), z + 0.1 * Math.sin(a * 3)], 0.01, C.white, { seg: 4 })); } }
function spindle(g, x0, x1, fibers = 14, toChrom = true, yspread = 0.9) { for (let i = 0; i < fibers; i++) { const t = (i / (fibers - 1) - 0.5) * 2; const y = t * yspread, z = 0.25 * Math.sin(i * 2.1); g.add(H.line([[x0, 0, 0], [0, y, z], [x1, 0, 0]], C.white, { op: 0.5 })); } }
function mitProphase() {
  const g = H.grp(), labels = []; cellShell(g);
  g.add(H.sphere(1.15, C.nuc, null, { op: 0.25, side: THREE.DoubleSide, dw: false }));
  const cols = [C.purple, C.blue, C.pink, C.teal]; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; g.add(chromX(0.55 * Math.cos(a), 0.55 * Math.sin(a), 0.2 * Math.sin(a * 2), cols[i], 0.8, a)); }
  centrosome(g, -1.5, 0.6, 0); centrosome(g, 1.5, -0.6, 0);
  labels.push(L('Chromosomes condense', 'Each has 2 chromatids joined at centromere (replicated in S phase)', [0.55 * Math.cos(0.4), 0.55 * Math.sin(0.4), 0.2]));
  labels.push(L('Centrosomes move apart', 'Each with 2 centrioles; radiate microtubules (asters)', [-1.5, 0.6, 0]));
  labels.push(L('Nuclear envelope (intact, then disassembles)', 'Nucleolus, Golgi, ER disappear by end of prophase', [-0.8, 0.8, 0]));
  labels.push(L('Aster', 'Radiating microtubules from centrosome', [1.5, -0.6, 0]));
  return { g, labels, note: 'Prophase: chromatin condenses into chromosomes; centrosome moves to opposite poles; nucleolus & nuclear envelope disappear.' };
}
function mitMetaphase() {
  const g = H.grp(), labels = []; cellShell(g);
  centrosome(g, -1.9, 0, 0, 12); centrosome(g, 1.9, 0, 0, 12); spindle(g, -1.9, 1.9);
  const cols = [C.purple, C.blue, C.pink, C.teal]; for (let i = 0; i < 4; i++) g.add(chromX(0, -0.9 + i * 0.6, 0.25 * Math.sin(i * 2), cols[i], 0.7, PI / 2));
  g.add(H.plane(0.02, 3.2, C.yellow, [0, 0, 0], [0, PI / 2, 0], { op: 0.25 }));
  labels.push(L('Metaphase plate (equator)', 'Chromosomes aligned at the equatorial plane', [0, 1.3, 0]));
  labels.push(L('Spindle fibres', 'Attach to kinetochores of centromeres', [-1.0, 0.4, 0]));
  labels.push(L('Chromosome (2 chromatids)', 'Best stage to study morphology — most condensed', [0, -0.9, 0.2]));
  labels.push(L('Pole (centrosome)', 'Spindle poles at opposite ends', [1.9, 0, 0]));
  labels.push(L('Kinetochore', 'Disc-shaped structure on centromere where spindle fibres attach', [0, 0.3, 0]));
  return { g, labels, note: 'Metaphase: nuclear envelope completely gone; chromosomes at the metaphase plate; spindle fibres attached to kinetochores.' };
}
function mitAnaphase() {
  const g = H.grp(), labels = []; cellShell(g, 2.5, 1.5);
  centrosome(g, -2.2, 0, 0, 12); centrosome(g, 2.2, 0, 0, 12);
  const cols = [C.purple, C.blue, C.pink, C.teal]; for (let i = 0; i < 4; i++) { const y = -0.9 + i * 0.6, z = 0.25 * Math.sin(i * 2); const l = chromSingle(-0.9, y, z, cols[i], 0.7, -1); l.rotation.z = -PI / 2; l.position.set(-0.9, y, z); g.add(H.tube([[-0.6, y + 0.15, z], [-0.95, y, z], [-0.6, y - 0.15, z]], 0.05, cols[i], { seg: 12 })); g.add(H.tube([[0.6, y + 0.15, z], [0.95, y, z], [0.6, y - 0.15, z]], 0.05, cols[i], { seg: 12 })); g.add(H.sphere(0.07, C.yellow, [-0.95, y, z], { seg: 8 })); g.add(H.sphere(0.07, C.yellow, [0.95, y, z], { seg: 8 })); g.add(H.line([[-2.2, 0, 0], [-0.95, y, z]], C.white, { op: 0.5 })); g.add(H.line([[2.2, 0, 0], [0.95, y, z]], C.white, { op: 0.5 })); }
  g.add(H.arrow([-1.2, 1.2, 0], [-1.8, 1.2, 0], C.yellow, { r: 0.02 })); g.add(H.arrow([1.2, 1.2, 0], [1.8, 1.2, 0], C.yellow, { r: 0.02 }));
  labels.push(L('Centromere splits', 'Sister chromatids separate → daughter chromosomes', [-0.95, 0.3, 0]));
  labels.push(L('Chromatids move to poles', 'Centromere leads, arms trail (V-shape)', [0.95, -0.9, 0.2]));
  labels.push(L('Spindle fibres shorten', 'Pull daughter chromosomes apart', [1.6, -0.3, 0]));
  labels.push(L('Cell elongates', 'Poles move further apart', [0, 1.4, 0]));
  return { g, labels, note: 'Anaphase: centromeres split; each chromatid becomes a daughter chromosome; move to opposite poles with centromere leading.' };
}
function mitTelophase() {
  const g = H.grp(), labels = []; cellShell(g, 2.6, 1.4);
  g.add(H.torus(1.3, 0.06, C.yellow, [0, 0, 0], [0, PI / 2, 0], { op: 0.8 }));
  for (const s of [-1, 1]) { g.add(H.sphere(0.85, C.nuc, [s * 1.3, 0, 0], { op: 0.3, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(0.2, C.pink, [s * 1.3 + 0.2, 0.2, 0], { op: 0.8 })); const rng = H.rng(s + 5); for (let i = 0; i < 4; i++) { const pts = []; for (let k = 0; k < 5; k++) pts.push([s * 1.3 + (rng() - 0.5) * 1.1, (rng() - 0.5) * 1.1, (rng() - 0.5) * 0.8]); g.add(H.tube(pts, 0.03, C.dna, { seg: 30 })); } }
  labels.push(L('Cleavage furrow', 'Animal cytokinesis: furrow deepens from periphery → centre', [0, 1.3, 0]));
  labels.push(L('Nuclear envelope re-forms', 'Around each chromosome cluster', [-1.3, 0.85, 0]));
  labels.push(L('Chromosomes decondense', 'Lose individuality → chromatin mass', [1.3, -0.4, 0.3]));
  labels.push(L('Nucleolus reappears', 'Golgi & ER re-form', [1.5, 0.2, 0]));
  labels.push(L('Two daughter nuclei', 'Identical to parent (equational division)', [-1.3, 0, 0]));
  return { g, labels, note: 'Telophase: chromosomes cluster at poles, decondense; nuclear envelope, nucleolus, Golgi, ER re-form. Cytokinesis: animal — furrow; plant — cell plate (middle lamella).' };
}
function cytokinesisPlant() {
  const g = H.grp(), labels = []; g.add(H.box(4.6, 2.6, 2.0, C.leaf, null, null, { op: 0.15, dw: false }));
  g.add(H.box(4.62, 2.62, 2.02, C.dgreen, null, null, { wire: true, op: 0.5 }));
  g.add(H.box(0.08, 2.4, 1.8, C.yellow, [0, 0, 0], null, { op: 0.85 }));
  for (let i = 0; i < 12; i++) g.add(H.sphere(0.07, C.orange, [0, -1.0 + i * 0.18, 0.5 * Math.sin(i * 1.7)], { seg: 6 }));
  for (const s of [-1, 1]) { g.add(H.sphere(0.75, C.nuc, [s * 1.3, 0, 0], { op: 0.35, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(0.18, C.pink, [s * 1.3 + 0.15, 0.15, 0], { op: 0.8 })); }
  labels.push(L('Cell plate', 'Forms at centre & grows outward to meet walls — becomes middle lamella', [0, 1.2, 0]));
  labels.push(L('Golgi vesicles (phragmoplast)', 'Deposit wall material at the plate', [0, 0.3, 0.55]));
  labels.push(L('Rigid cell wall', 'Prevents furrowing — hence cell plate', [2.3, 1.3, 0]));
  labels.push(L('Daughter nucleus', 'Karyokinesis complete', [-1.3, 0, 0]));
  return { g, labels, note: 'Plant cytokinesis: cell plate grows centrifugally (centre → periphery). Syncytium (liquid endosperm of coconut) when karyokinesis is not followed by cytokinesis.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-10-2', unit: U3, ch: 'Ch 10 — Cell Cycle and Cell Division', fig: 'Fig 10.2', title: 'Stages of mitosis',
  desc: 'Mitosis (equational division) produces two genetically identical daughter cells. Karyokinesis: prophase → metaphase → anaphase → telophase; followed by cytokinesis.',
  points: ['Occurs in diploid somatic cells (haploid in some plants/insects).', 'Metaphase: chromosomes most condensed — karyotype studies.', 'Anaphase: centromere splits; chromatids → chromosomes.', 'Significance: growth, repair, maintains nucleo-cytoplasmic ratio, restores cell size.'],
  variants: [{ name: 'Prophase', build: mitProphase }, { name: 'Metaphase', build: mitMetaphase }, { name: 'Anaphase', build: mitAnaphase }, { name: 'Telophase', build: mitTelophase }, { name: 'Cytokinesis (plant)', build: cytokinesisPlant }]
}));

/* meiosis prophase I */
function homPair(g, x, y, z, colA, colB, opts = {}) {
  const gap = opts.gap ?? 0.35, s = 0.9;
  const strand = (dx, col, chiasma) => { const pts = chiasma ? [[x + dx, y - 0.7, z], [x + dx * 0.6, y - 0.25, z], [x - dx * 0.6, y + 0.25, z], [x + dx, y + 0.7, z]] : [[x + dx, y - 0.7, z], [x + dx * 0.7, y, z], [x + dx, y + 0.7, z]]; return H.tube(pts, 0.06 * s, col, { seg: 24 }); };
  if (opts.duplicated) { g.add(strand(-gap - 0.12, colA)); g.add(strand(-gap + 0.12, opts.cross ? colB : colA, opts.cross)); g.add(strand(gap - 0.12, opts.cross ? colA : colB, opts.cross)); g.add(strand(gap + 0.12, colB)); g.add(H.sphere(0.08, C.yellow, [x - gap, y, z], { seg: 8 })); g.add(H.sphere(0.08, C.yellow, [x + gap, y, z], { seg: 8 })); }
  else { g.add(strand(-gap, colA)); g.add(strand(gap, colB)); }
}
function meiLeptotene() {
  const g = H.grp(), labels = []; cellShell(g); g.add(H.sphere(1.3, C.nuc, null, { op: 0.2, side: THREE.DoubleSide, dw: false }));
  const rng = H.rng(2); const cols = [C.purple, C.pink, C.blue, C.teal]; for (let i = 0; i < 4; i++) { const pts = []; for (let k = 0; k < 6; k++) pts.push([(rng() - 0.5) * 2.2, (rng() - 0.5) * 2.2, (rng() - 0.5) * 1.2]); g.add(H.tube(pts, 0.05, cols[i], { seg: 40 })); }
  labels.push(L('Leptotene', 'Chromosomes become gradually visible as thin threads; compaction begins', [0.4, 0.4, 0.3]));
  labels.push(L('Nuclear envelope intact', 'Prophase I is very long', [-1.0, 0.9, 0]));
  labels.push(L('Thin chromosome thread', 'Already replicated (2 chromatids) but not distinct', [-0.5, -0.6, 0.2]));
  return { g, labels, note: 'Leptotene: "thin thread" stage; chromosomes visible under light microscope.' };
}
function meiZygotene() {
  const g = H.grp(), labels = []; cellShell(g); g.add(H.sphere(1.3, C.nuc, null, { op: 0.2, side: THREE.DoubleSide, dw: false }));
  homPair(g, -0.6, 0.2, 0, C.purple, C.pink, { gap: 0.16 }); homPair(g, 0.7, -0.2, 0.1, C.blue, C.teal, { gap: 0.16 });
  g.add(H.box(0.05, 1.4, 0.04, C.white, [-0.6, 0.2, 0], null, { op: 0.7 })); g.add(H.box(0.05, 1.4, 0.04, C.white, [0.7, -0.2, 0.1], null, { op: 0.7 }));
  labels.push(L('Zygotene — synapsis', 'Homologous chromosomes pair up', [-0.6, 0.9, 0]));
  labels.push(L('Synaptonemal complex', 'Protein ladder joining the paired homologues', [-0.6, 0.2, 0]));
  labels.push(L('Bivalent (tetrad)', 'Pair of homologues = 4 chromatids', [0.7, -0.2, 0.1]));
  return { g, labels, note: 'Zygotene: synapsis of homologous chromosomes with synaptonemal complex → bivalents (tetrads).' };
}
function meiPachytene() {
  const g = H.grp(), labels = []; cellShell(g); g.add(H.sphere(1.3, C.nuc, null, { op: 0.2, side: THREE.DoubleSide, dw: false }));
  homPair(g, -0.6, 0.2, 0, C.purple, C.pink, { duplicated: true, cross: true, gap: 0.3 }); homPair(g, 0.8, -0.2, 0.1, C.blue, C.teal, { duplicated: true, cross: true, gap: 0.3 });
  g.add(H.sphere(0.1, C.yellow, [-0.6, 0.2, 0.08], { e: 0.9 })); g.add(H.sphere(0.1, C.yellow, [0.8, -0.2, 0.18], { e: 0.9 }));
  labels.push(L('Pachytene — crossing over', 'Exchange of segments between non-sister chromatids of homologues', [-0.6, 0.2, 0.08]));
  labels.push(L('Four chromatids visible', 'Each bivalent appears as a tetrad', [0.8, 0.5, 0.1]));
  labels.push(L('Recombination nodules', 'Sites of crossing over; enzyme recombinase', [0.8, -0.2, 0.18]));
  labels.push(L('Non-sister chromatids', 'One from each homologue', [-0.9, -0.5, 0]));
  return { g, labels, note: 'Pachytene: bivalents appear as tetrads; crossing over at recombination nodules — genetic recombination.' };
}
function meiDiplotene() {
  const g = H.grp(), labels = []; cellShell(g); g.add(H.sphere(1.3, C.nuc, null, { op: 0.2, side: THREE.DoubleSide, dw: false }));
  const pair = (x, y, cA, cB) => { for (const s of [-1, 1]) { const col = s < 0 ? cA : cB; g.add(H.tube([[x + s * 0.55, y - 0.8, 0], [x + s * 0.12, y - 0.1, 0], [x + s * 0.5, y + 0.8, 0]], 0.06, col, { seg: 20 })); g.add(H.tube([[x + s * 0.35, y - 0.8, 0.1], [x + s * 0.05, y - 0.1, 0.1], [x + s * 0.3, y + 0.8, 0.1]], 0.06, col, { seg: 20 })); } g.add(H.sphere(0.1, C.yellow, [x, y - 0.1, 0.05], { e: 0.9 })); };
  pair(-0.7, 0.2, C.purple, C.pink); pair(0.7, -0.2, C.blue, C.teal);
  labels.push(L('Diplotene', 'Synaptonemal complex dissolves; homologues begin to separate', [-0.7, 0.9, 0]));
  labels.push(L('Chiasma (pl. chiasmata)', 'X-shaped point where recombined homologues stay attached', [-0.7, 0.1, 0.05]));
  labels.push(L('Prolonged diplotene', 'Oocytes of some vertebrates stay here for months/years (dictyotene)', [0.7, -0.2, 0.05]));
  return { g, labels, note: 'Diplotene: dissolution of synaptonemal complex; recombined homologues separate except at chiasmata.' };
}
function meiDiakinesis() {
  const g = H.grp(), labels = []; cellShell(g);
  const pair = (x, y, cA, cB) => { for (const s of [-1, 1]) { const col = s < 0 ? cA : cB; g.add(H.tube([[x + s * 0.7, y - 0.55, 0], [x + s * 0.5, y, 0], [x + s * 0.7, y + 0.55, 0]], 0.08, col, { seg: 16 })); g.add(H.tube([[x + s * 0.5, y - 0.55, 0.15], [x + s * 0.3, y, 0.15], [x + s * 0.5, y + 0.55, 0.15]], 0.08, col, { seg: 16 })); } g.add(H.sphere(0.09, C.yellow, [x - 0.4, y + 0.55, 0.08], { e: 0.9 })); g.add(H.sphere(0.09, C.yellow, [x + 0.4, y - 0.55, 0.08], { e: 0.9 })); };
  pair(-0.8, 0.2, C.purple, C.pink); pair(0.8, -0.2, C.blue, C.teal);
  centrosome(g, -1.8, 0.5, 0); centrosome(g, 1.8, -0.5, 0);
  labels.push(L('Diakinesis', 'Terminalisation of chiasmata — move to the ends', [-0.8, 0.9, 0]));
  labels.push(L('Terminalised chiasma', 'Homologues held only at tips', [-1.2, 0.75, 0.08]));
  labels.push(L('Chromosomes fully condensed', 'Nucleolus & nuclear envelope disappear; spindle assembles', [0.8, -0.2, 0.15]));
  labels.push(L('Meiotic spindle forming', 'Transition to metaphase I', [1.8, -0.5, 0]));
  return { g, labels, note: 'Diakinesis: terminalisation of chiasmata; nucleolus disappears; nuclear envelope breaks down; spindle forms — end of prophase I.' };
}
function meiOverview() {
  const g = H.grp(), labels = [];
  const cell = (x, y, s, n, col, chromCols) => { g.add(H.ell(0.7 * s, 0.6 * s, 0.5 * s, col, [x, y, 0], { op: 0.18, side: THREE.DoubleSide, dw: false })); chromCols.forEach((c, i) => g.add(chromX(x + (i - (chromCols.length - 1) / 2) * 0.28 * s, y, 0, c, 0.45 * s, n ? 0 : 0.3))); };
  cell(0, 1.9, 1.3, 1, C.mem, [C.purple, C.pink, C.blue, C.teal]);
  g.add(H.arrow([-0.5, 1.1, 0], [-1.6, 0.5, 0], C.white, { r: 0.02 })); g.add(H.arrow([0.5, 1.1, 0], [1.6, 0.5, 0], C.white, { r: 0.02 }));
  cell(-1.6, 0, 1.0, 1, C.green, [C.purple, C.blue]); cell(1.6, 0, 1.0, 1, C.green, [C.pink, C.teal]);
  const single = (x, y, cols) => { g.add(H.ell(0.5, 0.42, 0.35, C.amber, [x, y, 0], { op: 0.18, side: THREE.DoubleSide, dw: false })); cols.forEach((c, i) => g.add(chromSingle(x + (i - 0.5) * 0.25, y, 0, c, 0.4))); };
  [[-2.4, -1.8], [-0.8, -1.8], [0.8, -1.8], [2.4, -1.8]].forEach((p, i) => { g.add(H.arrow([i < 2 ? -1.6 : 1.6, -0.6, 0], [p[0], -1.3, 0], C.white, { r: 0.015, head: 0.15 })); single(p[0], p[1], i < 2 ? [C.purple, C.blue] : [C.pink, C.teal]); });
  g.add(H.text('Meiosis I (reductional)', { size: 0.2, pos: [3.0, 0.7, 0], color: C.yellow })); g.add(H.text('Meiosis II (equational)', { size: 0.2, pos: [3.0, -1.1, 0], color: C.yellow }));
  labels.push(L('Diploid parent cell (2n = 4)', 'Homologous pairs; DNA replicated in S phase', [0, 1.9, 0.6]));
  labels.push(L('Meiosis I — homologues separate', 'Reductional: chromosome number halves (2n → n); chromatids stay together', [-1.6, 0, 0.5]));
  labels.push(L('Meiosis II — chromatids separate', 'Like mitosis; no DNA replication before it (short interkinesis)', [-0.8, -1.8, 0.35]));
  labels.push(L('Four haploid cells', 'Genetically different (crossing over + independent assortment)', [2.4, -1.8, 0.35]));
  return { g, labels, note: 'Meiosis: one DNA replication, two divisions → 4 haploid cells; conserves chromosome number across generations and creates variation.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-10-3', unit: U3, ch: 'Ch 10 — Cell Cycle and Cell Division', fig: 'Fig 10.3', title: 'Meiosis I — Prophase I stages',
  desc: 'Prophase I is the longest phase of meiosis, subdivided into leptotene, zygotene, pachytene, diplotene and diakinesis. Crossing over in pachytene creates genetic recombination.',
  points: ['Leptotene → Zygotene (synapsis, synaptonemal complex) → Pachytene (crossing over, recombination nodules) → Diplotene (chiasmata) → Diakinesis (terminalisation).', 'Metaphase I: bivalents on equator; Anaphase I: homologues separate (reductional); chromatids remain attached.', 'Interkinesis: short, no DNA replication. Meiosis II is equational.', 'Result: 4 haploid, genetically different cells.'],
  variants: [{ name: 'Leptotene', build: meiLeptotene }, { name: 'Zygotene', build: meiZygotene }, { name: 'Pachytene', build: meiPachytene }, { name: 'Diplotene', build: meiDiplotene }, { name: 'Diakinesis', build: meiDiakinesis }, { name: 'Meiosis overview', build: meiOverview }]
}));

/* ---------- Ch 11 Photosynthesis ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-11-2', unit: U4, ch: 'Ch 11 — Photosynthesis in Higher Plants', fig: 'Fig 11.2', title: 'Light Harvesting Complex (LHC)',
  desc: 'Each photosystem has a reaction centre (a single chlorophyll a molecule) surrounded by an antenna of accessory pigments. Antenna pigments absorb different wavelengths and funnel energy to the reaction centre.',
  points: ['PS I reaction centre = P700; PS II reaction centre = P680 (absorption peak wavelength).', 'Accessory pigments: chlorophyll b, xanthophylls, carotenoids — widen absorption range & protect chlorophyll a from photo-oxidation.', 'Chlorophyll a is the chief pigment; action spectrum peaks in blue & red.', 'LHC = antenna pigments + proteins bound in thylakoid membrane.'],
  build() {
    const g = H.grp(), labels = [];
    // thylakoid membrane slab
    g.add(H.box(5, 0.35, 2.6, C.dgreen, [0, -1.0, 0], null, { op: 0.7 }));
    // funnel of pigments
    const rings = [[1.5, 0.6, C.orange, 14], [1.05, 0.2, C.yellow, 10], [0.6, -0.15, C.lime, 6]];
    rings.forEach(([R, y, col, n]) => { for (let i = 0; i < n; i++) { const a = i / n * TAU; g.add(H.cyl(0.14, 0.14, 0.12, col, [R * Math.cos(a), y, R * Math.sin(a)], null, { seg: 8, e: 0.5 })); g.add(H.line([[R * Math.cos(a), y, R * Math.sin(a)], [0, -0.55, 0]], C.white, { op: 0.35 })); } });
    g.add(H.sphere(0.26, C.green, [0, -0.55, 0], { e: 0.9 }));
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const p0 = [2.4 * Math.cos(a), 1.8, 2.4 * Math.sin(a)]; g.add(H.arrow(p0, [1.5 * Math.cos(a), 0.75, 1.5 * Math.sin(a)], C.yellow, { r: 0.015, head: 0.15 })); }
    g.add(H.arrow([0, -0.8, 0], [0.9, -1.5, 0.9], C.cyan, { r: 0.03 })); g.add(H.text('e⁻', { size: 0.22, pos: [1.1, -1.6, 1.1], color: C.cyan }));
    labels.push(L('Reaction centre (chlorophyll a)', 'P680 in PS II / P700 in PS I — the only molecule that loses an electron', [0, -0.55, 0]));
    labels.push(L('Antenna pigments', 'Chlorophyll b, carotenoids, xanthophylls absorb & transfer energy', [1.5, 0.6, 0]));
    labels.push(L('Light photons', 'Absorbed across many wavelengths', [2.4, 1.8, 0]));
    labels.push(L('Energy funnelled inward', 'Resonance transfer to reaction centre', [0.7, 0.05, 0.7]));
    labels.push(L('Thylakoid membrane', 'LHC embedded here', [-2.2, -1.0, 0.8]));
    labels.push(L('Excited electron ejected', 'Goes to primary electron acceptor', [0.9, -1.5, 0.9]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-11-4', unit: U4, ch: 'Ch 11 — Photosynthesis in Higher Plants', fig: 'Fig 11.4', title: 'Z-scheme of light reaction',
  desc: 'Non-cyclic photophosphorylation: electrons flow from water (via PS II → electron transport chain → PS I) to NADP⁺, producing ATP, NADPH and O₂. Plotted against redox potential the path looks like a "Z".',
  points: ['PS II (P680) absorbs 680 nm; electrons pass through pheophytin, PQ, cytochrome b₆f, PC to PS I.', 'PS I (P700) re-excites electrons → ferredoxin → NADP⁺ reductase → NADPH.', 'Water splitting (PS II, inner thylakoid side): 2H₂O → 4H⁺ + O₂ + 4e⁻ (Mn, Ca, Cl⁻ needed).', 'Cyclic photophosphorylation (PS I only, stroma lamellae): only ATP, no NADPH or O₂.'],
  build() {
    const g = H.grp(), labels = [];
    const G = H.graph({ w: 5, h: 3.2, xr: [0, 10], yr: [-1.2, 1.4], xl: '', yl: 'Redox potential (V)', yt: [[1.0, '+1.0'], [0, '0'], [-1.0, '−1.0']], nx: 10, ny: 6 });
    g.add(G);
    const P = (x, y) => G.map(x, y, 0.1);
    const nodes = [['P680', 1, 0.9, C.orange], ['P680*', 1.6, -0.8, C.yellow], ['Pheo', 2.3, -0.6, C.grey], ['PQ', 3.2, -0.1, C.grey], ['Cyt b₆f', 4.0, 0.2, C.blue], ['PC', 4.8, 0.4, C.grey], ['P700', 5.6, 0.45, C.green], ['P700*', 6.2, -1.15, C.lime], ['Fd', 7.2, -0.7, C.grey], ['NADP⁺ reductase', 8.3, -0.4, C.purple], ['NADPH', 9.4, -0.3, C.pink]];
    const pts = nodes.map(n => P(n[1], n[2]));
    for (let i = 0; i < pts.length - 1; i++) g.add(H.arrow(pts[i], pts[i + 1], (i === 0 || i === 6) ? C.yellow : C.cyan, { r: 0.025, head: 0.14 }));
    nodes.forEach((n, i) => { g.add(H.sphere(0.12, n[3], pts[i], { e: 0.6 })); g.add(H.text(n[0], { size: 0.16, pos: [pts[i][0] + (i === 0 ? -0.35 : 0.0), pts[i][1] + (i === 1 || i === 7 ? -0.28 : 0.28), 0.12], color: n[3] })); });
    g.add(H.arrow(P(0.2, 1.2), P(0.85, 0.95), C.red, { r: 0.02, head: 0.12 })); g.add(H.text('H₂O → 2H⁺ + ½O₂ + 2e⁻', { size: 0.15, pos: P(1.0, 1.3), color: C.red }));
    g.add(H.text('hν', { size: 0.2, pos: P(0.6, 0.0), color: C.yellow })); g.add(H.text('hν', { size: 0.2, pos: P(5.3, -0.3), color: C.yellow }));
    g.add(H.text('ATP', { size: 0.18, pos: P(4.0, 0.7), color: C.amber }));
    labels.push(L('Photosystem II (P680)', 'Absorbs red light 680 nm; electrons replaced by splitting water', pts[0]));
    labels.push(L('Water-splitting complex', 'On inner thylakoid membrane; releases O₂ & H⁺ into lumen', P(0.2, 1.2)));
    labels.push(L('Electron transport chain', 'Pheophytin → PQ → cytochrome b₆f → plastocyanin (downhill)', pts[3]));
    labels.push(L('Cytochrome b₆f — ATP synthesis', 'Proton gradient across thylakoid drives ATP synthase (chemiosmosis)', pts[4]));
    labels.push(L('Photosystem I (P700)', 'Absorbs 700 nm; electrons re-excited', pts[6]));
    labels.push(L('Ferredoxin → NADP⁺ reductase', 'Electrons reduce NADP⁺ + H⁺ → NADPH (stroma side)', pts[8]));
    labels.push(L('NADPH', 'Reducing power used in Calvin cycle', pts[10]));
    labels.push(L('Redox potential axis', 'Excited states have more negative potential (top = +, bottom = −)', P(-0.4, -1.0)));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-11-6', unit: U4, ch: 'Ch 11 — Photosynthesis in Higher Plants', fig: 'Fig 11.6', title: 'Calvin cycle (C₃ pathway)',
  desc: 'The biosynthetic (dark) phase in stroma: CO₂ is fixed to RuBP by RuBisCO forming 3-PGA (carboxylation), reduced using ATP & NADPH (reduction), and RuBP is regenerated (regeneration).',
  points: ['First stable product: 3-phosphoglyceric acid (3-PGA, 3-carbon) — hence C₃ pathway (Calvin).', 'Per CO₂: 3 ATP + 2 NADPH. Per glucose (6 CO₂): 18 ATP + 12 NADPH.', 'RuBisCO = most abundant protein on Earth; also has oxygenase activity (photorespiration).', 'Regeneration of RuBP needs 1 ATP per CO₂ (phosphorylation).'],
  build() {
    const g = H.grp(), labels = [];
    const cy = H.cycle({ R: 1.7, nodes: [
      { name: 'RuBP (5C)', color: C.green, step: 'CO₂ + RuBisCO', sc: C.yellow },
      { name: '3-PGA (3C) ×2', color: C.orange, step: 'ATP, NADPH', inner: 'Reduction', sc: C.pink },
      { name: 'Triose phosphate (3C)', color: C.cyan, step: 'ATP', inner: 'Regeneration' }
    ], a0: PI / 2, center: 'Calvin cycle', ac: '#94a3b8' });
    g.add(cy); const np = cy.nodePos;
    g.add(H.arrow([np[2][0] + 0.2, np[2][1] - 0.3, 0], [np[2][0] + 1.6, np[2][1] - 1.4, 0], C.yellow, { r: 0.03 }));
    g.add(H.text('→ Sucrose / starch', { size: 0.18, pos: [np[2][0] + 2.0, np[2][1] - 1.7, 0], color: C.yellow }));
    g.add(H.arrow([-2.9, 1.8, 0], [np[0][0] - 0.9, np[0][1] + 0.15, 0], C.red, { r: 0.03 })); g.add(H.text('CO₂', { size: 0.22, bold: true, pos: [-3.1, 2.0, 0], color: C.red }));
    g.add(H.text('Carboxylation', { size: 0.15, pos: [1.2, 1.5, 0], color: C.pink }));
    labels.push(L('Carboxylation', 'CO₂ + RuBP → 2 × 3-PGA, catalysed by RuBisCO (most crucial step)', [1.2, 1.5, 0]));
    labels.push(L('RuBP (ribulose-1,5-bisphosphate)', '5-carbon CO₂ acceptor', np[0]));
    labels.push(L('3-PGA (first stable product)', '3-phosphoglyceric acid — 3 carbons', np[1]));
    labels.push(L('Reduction', 'Uses 2 ATP + 2 NADPH per CO₂ → triose phosphate (glyceraldehyde-3-P)', [np[1][0] - 0.6, np[1][1] - 1.0, 0]));
    labels.push(L('Regeneration', 'Triose-P → RuBP using 1 ATP per CO₂', [np[2][0] - 0.8, np[2][1] + 0.9, 0]));
    labels.push(L('Output: sugar', '1 of every 6 triose-P leaves the cycle to make glucose', [np[2][0] + 1.6, np[2][1] - 1.4, 0]));
    labels.push(L('CO₂ input', '6 turns fix 6 CO₂ for one hexose', [-3.1, 2.0, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-11-7', unit: U4, ch: 'Ch 11 — Photosynthesis in Higher Plants', fig: 'Fig 11.7', title: 'Hatch–Slack (C₄) pathway',
  desc: 'C₄ plants (maize, sorghum, sugarcane) fix CO₂ first in mesophyll cells into oxaloacetic acid (4C) using PEP carboxylase; the 4C acid is shuttled to bundle-sheath cells where CO₂ is released for the Calvin cycle — Kranz anatomy.',
  points: ['Primary CO₂ acceptor: PEP (3C); enzyme PEP carboxylase (PEPcase) in mesophyll; first product OAA (4C).', 'Bundle-sheath cells: thick walls, no intercellular spaces, many chloroplasts (agranal), contain RuBisCO — Calvin cycle here.', 'Pyruvate (3C) returns to mesophyll, regenerates PEP using ATP.', 'No photorespiration; higher productivity; tolerate high temperature.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.box(2.9, 3.2, 1.2, C.lime, [-1.6, 0, 0], null, { op: 0.15, dw: false })); g.add(H.box(2.92, 3.22, 1.22, C.lime, [-1.6, 0, 0], null, { wire: true, op: 0.6 }));
    g.add(H.box(2.9, 3.2, 1.2, C.dgreen, [1.6, 0, 0], null, { op: 0.2, dw: false })); g.add(H.box(2.92, 3.22, 1.22, C.dgreen, [1.6, 0, 0], null, { wire: true, op: 0.8 }));
    g.add(H.box(0.12, 3.2, 1.25, C.brown, [0, 0, 0], null, { op: 0.6 }));
    g.add(H.cyl(0.4, 0.4, 1.1, C.xy, [1.9, -0.6, 0.0], null, { seg: 12, op: 0.6 }));
    const N = (name, p, col) => { g.add(H.sphere(0.16, col, p, { e: 0.5 })); g.add(H.text(name, { size: 0.16, pos: [p[0], p[1] + 0.3, p[2]], bold: true, color: col })); return p; };
    const pep = N('PEP (3C)', [-2.5, 0.9, 0.3], C.cyan), oaa = N('OAA (4C)', [-0.8, 0.9, 0.3], C.orange), mal = N('Malate (4C)', [-0.8, -0.6, 0.3], C.amber), mal2 = N('Malate', [0.9, -0.6, 0.3], C.amber), pyr2 = N('Pyruvate (3C)', [0.9, 0.9, 0.3], C.purple), pyr = N('Pyruvate', [-2.5, -0.6, 0.3], C.purple);
    g.add(H.arrow([-3.2, 1.6, 0.3], [-2.55, 1.1, 0.3], C.red, { r: 0.025 })); g.add(H.text('CO₂ (atm)', { size: 0.16, pos: [-3.3, 1.8, 0.3], color: C.red }));
    g.add(H.arrow([pep[0] + 0.2, pep[1], 0.3], [oaa[0] - 0.2, oaa[1], 0.3], C.white, { r: 0.02 })); g.add(H.text('PEP carboxylase', { size: 0.14, pos: [-1.65, 1.15, 0.3], color: C.yellow }));
    g.add(H.arrow([oaa[0], oaa[1] - 0.2, 0.3], [mal[0], mal[1] + 0.2, 0.3], C.white, { r: 0.02 }));
    g.add(H.arrow([mal[0] + 0.2, mal[1], 0.3], [mal2[0] - 0.2, mal2[1], 0.3], C.white, { r: 0.02 }));
    g.add(H.arrow([mal2[0], mal2[1] + 0.2, 0.3], [pyr2[0], pyr2[1] - 0.2, 0.3], C.white, { r: 0.02 })); g.add(H.text('decarboxylation', { size: 0.13, pos: [1.6, 0.15, 0.3], color: C.yellow }));
    g.add(H.arrow([pyr2[0] - 0.2, pyr2[1], 0.3], [-2.3, -0.4, 0.3], C.white, { r: 0.015, head: 0.12 }));
    g.add(H.arrow([pyr[0], pyr[1] + 0.2, 0.3], [pep[0], pep[1] - 0.2, 0.3], C.white, { r: 0.02 })); g.add(H.text('ATP', { size: 0.14, pos: [-2.8, 0.15, 0.3], color: C.amber }));
    g.add(H.arrow([mal2[0] + 0.2, mal2[1] + 0.1, 0.3], [2.1, 0.2, 0.3], C.red, { r: 0.02 })); g.add(H.text('CO₂', { size: 0.16, pos: [2.2, 0.4, 0.3], color: C.red }));
    g.add(H.torus(0.42, 0.05, C.green, [2.3, 0.9, 0.3], null, { e: 0.6 })); g.add(H.text('Calvin cycle', { size: 0.14, pos: [2.3, 0.9, 0.35], color: C.green }));
    labels.push(L('Mesophyll cell', 'Primary CO₂ fixation; has PEPcase, lacks RuBisCO', [-1.6, 1.7, 0]));
    labels.push(L('Bundle-sheath cell', 'Thick-walled, agranal chloroplasts; RuBisCO & Calvin cycle', [1.6, 1.7, 0]));
    labels.push(L('PEP carboxylase', 'Fixes CO₂ to phosphoenol pyruvate → OAA', [-1.65, 1.15, 0.3]));
    labels.push(L('Oxaloacetic acid (OAA)', 'First product, 4-carbon dicarboxylic acid', oaa));
    labels.push(L('Malate / aspartate shuttle', '4C acid transported to bundle sheath', mal));
    labels.push(L('Decarboxylation in bundle sheath', 'Releases CO₂ (concentrated) for RuBisCO; pyruvate returns', mal2));
    labels.push(L('PEP regeneration', 'Pyruvate + ATP → PEP in mesophyll', pyr));
    labels.push(L('Vascular bundle', 'Kranz (wreath) anatomy around it', [1.9, -0.6, 0.55]));
    return { g, labels };
  }
}));

/* ---------- Ch 12 Respiration ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-12-1', unit: U4, ch: 'Ch 12 — Respiration in Plants', fig: 'Fig 12.1', title: 'Glycolysis (EMP pathway)',
  desc: 'Glycolysis (Embden–Meyerhof–Parnas) occurs in the cytoplasm: glucose (6C) is broken into two pyruvic acid (3C) molecules in 10 steps, with net gain of 2 ATP and 2 NADH + H⁺.',
  points: ['Energy investment: 2 ATP used (hexokinase & phosphofructokinase steps).', 'Payoff: 4 ATP by substrate-level phosphorylation + 2 NADH (at glyceraldehyde-3-P dehydrogenase).', 'Fructose-1,6-bisphosphate splits into DHAP + 3-phosphoglyceraldehyde (PGAL).', 'Pyruvate fate: aerobic (Krebs), lactic acid fermentation, or alcoholic fermentation.'],
  build() {
    const g = H.grp(), labels = [];
    const steps = [['Glucose', C.green], ['Glucose-6-phosphate', C.lime], ['Fructose-6-phosphate', C.lime], ['Fructose-1,6-bisphosphate', C.yellow], ['DHAP + 3-PGAL (2×)', C.orange], ['1,3-bisphosphoglycerate', C.amber], ['3-phosphoglycerate', C.pink], ['2-phosphoglycerate', C.pink], ['Phosphoenol pyruvate (PEP)', C.purple], ['Pyruvic acid (2×)', C.red]];
    const pts = steps.map((s, i) => { const t = i / (steps.length - 1); const a = t * PI * 1.3 - PI / 2; return [1.4 * Math.cos(a), 2.6 - t * 5.2, -1.4 * Math.sin(a)]; });
    steps.forEach((s, i) => { g.add(H.sphere(0.16, s[1], pts[i], { e: 0.55 })); g.add(H.text(s[0], { size: 0.17, pos: [pts[i][0] * 1.25, pts[i][1] + 0.26, pts[i][2] * 1.25], bold: true, color: s[1] })); if (i < steps.length - 1) g.add(H.arrow(pts[i], pts[i + 1], '#94a3b8', { r: 0.02, head: 0.15 })); });
    const tag = (i, txt, col) => g.add(H.text(txt, { size: 0.14, pos: [(pts[i][0] + pts[i + 1][0]) / 2 * 1.35, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2 * 1.35], color: col }));
    tag(0, 'ATP → ADP (hexokinase)', C.amber); tag(2, 'ATP → ADP (PFK)', C.amber); tag(3, 'aldolase (split)', C.grey); tag(4, 'NAD⁺ → NADH + H⁺', C.cyan); tag(5, 'ADP → ATP', C.yellow); tag(7, '−H₂O (enolase)', C.grey); tag(8, 'ADP → ATP (pyruvate kinase)', C.yellow);
    labels.push(L('Glucose (6C)', 'Start; from sucrose by invertase', pts[0]));
    labels.push(L('Energy investment (2 ATP used)', 'Hexokinase & phosphofructokinase phosphorylate the sugar', pts[2]));
    labels.push(L('Fructose-1,6-bisphosphate splits', 'Into DHAP + 3-phosphoglyceraldehyde (PGAL) — 3C each', pts[3]));
    labels.push(L('NADH formed', 'PGAL → 1,3-bisphosphoglycerate (oxidation)', pts[4]));
    labels.push(L('Substrate-level phosphorylation', '1,3-BPGA → 3-PGA gives ATP directly', pts[5]));
    labels.push(L('PEP → pyruvate', 'Second ATP-yielding step', pts[8]));
    labels.push(L('Pyruvic acid (2 × 3C)', 'Net: 2 ATP + 2 NADH per glucose', pts[9]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-12-3', unit: U4, ch: 'Ch 12 — Respiration in Plants', fig: 'Fig 12.3', title: 'Krebs cycle (TCA cycle)',
  desc: 'In the mitochondrial matrix, acetyl-CoA (2C) condenses with oxaloacetate (4C) to form citrate (6C). Per turn: 3 NADH + H⁺, 1 FADH₂, 1 GTP (→ATP), 2 CO₂; OAA is regenerated.',
  points: ['Link reaction: pyruvate → acetyl-CoA + CO₂ + NADH (pyruvate dehydrogenase, needs Mg²⁺, NAD⁺, CoA).', 'First step: citrate synthase; only substrate-level phosphorylation: succinyl-CoA → succinate (GTP).', 'Decarboxylations at isocitrate → α-KG and α-KG → succinyl-CoA.', 'FADH₂ at succinate → fumarate (succinate dehydrogenase, on inner membrane).'],
  build() {
    const g = H.grp(), labels = [];
    const cy = H.cycle({ R: 2.0, ts: 0.17, nodes: [
      { name: 'Citrate (6C)', color: C.green, step: 'isomerisation' },
      { name: 'Isocitrate (6C)', color: C.lime, step: 'NADH, CO₂', sc: C.cyan },
      { name: 'α-Ketoglutarate (5C)', color: C.yellow, step: 'NADH, CO₂', sc: C.cyan },
      { name: 'Succinyl-CoA (4C)', color: C.orange, step: 'GTP → ATP', sc: C.amber },
      { name: 'Succinate (4C)', color: C.red, step: 'FADH₂', sc: C.pink },
      { name: 'Fumarate (4C)', color: C.purple, step: '+ H₂O' },
      { name: 'Malate (4C)', color: C.blue, step: 'NADH', sc: C.cyan },
      { name: 'Oxaloacetate (4C)', color: C.teal, step: 'citrate synthase', sc: C.yellow }
    ], a0: PI / 2 + 0.35, center: 'Krebs cycle', cc: C.white });
    g.add(cy); const np = cy.nodePos;
    g.add(H.arrow([-0.2, 3.4, 0], [np[0][0] - 0.4, np[0][1] + 0.2, 0], C.orange, { r: 0.03 })); g.add(H.text('Acetyl-CoA (2C)', { size: 0.2, bold: true, pos: [-0.9, 3.6, 0], color: C.orange }));
    g.add(H.text('CoA released', { size: 0.13, pos: [0.6, 3.1, 0], color: C.grey }));
    g.add(H.text('Pyruvate → Acetyl-CoA + CO₂ + NADH', { size: 0.14, pos: [-0.9, 4.0, 0], color: C.grey }));
    labels.push(L('Acetyl-CoA enters', 'From pyruvate (link reaction) — 2C unit', [-0.9, 3.6, 0]));
    labels.push(L('Citrate (first product, 6C)', 'OAA + acetyl-CoA → citric acid (citrate synthase)', np[0]));
    labels.push(L('Isocitrate → α-KG', 'Oxidative decarboxylation: NADH + CO₂ released', np[1]));
    labels.push(L('α-Ketoglutarate → succinyl-CoA', 'Second decarboxylation: NADH + CO₂', np[2]));
    labels.push(L('Succinyl-CoA → succinate', 'Only substrate-level phosphorylation: GTP → ATP', np[3]));
    labels.push(L('Succinate → fumarate', 'FADH₂ produced (succinate dehydrogenase)', np[4]));
    labels.push(L('Malate → oxaloacetate', 'Third NADH; OAA regenerated', np[6]));
    labels.push(L('Per turn', '3 NADH, 1 FADH₂, 1 GTP, 2 CO₂ — 2 turns per glucose', [0, -0.4, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-12-4', unit: U4, ch: 'Ch 12 — Respiration in Plants', fig: 'Fig 12.4', title: 'Electron Transport System (ETS)',
  desc: 'On the inner mitochondrial membrane, electrons from NADH (complex I) and FADH₂ (complex II) pass through ubiquinone, complex III, cytochrome c and complex IV to O₂. Proton pumping builds a gradient used by ATP synthase (complex V).',
  points: ['Complex I: NADH dehydrogenase; II: succinate dehydrogenase; III: cytochrome bc₁; IV: cytochrome c oxidase (Cu centres); V: ATP synthase (F₀ + F₁).', 'Mobile carriers: ubiquinone (UQ) & cytochrome c.', 'NADH → ~3 ATP (2.5); FADH₂ → ~2 ATP (1.5); O₂ is final electron acceptor → H₂O.', 'Oxidative phosphorylation (chemiosmosis): H⁺ flow through F₀ drives F₁ to make ATP.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.box(6.2, 0.5, 2, C.orange, [0, 0, 0], null, { op: 0.6 }));
    g.add(H.text('Intermembrane space (high H⁺)', { size: 0.16, pos: [0, 1.35, 0], color: C.grey })); g.add(H.text('Matrix (low H⁺)', { size: 0.16, pos: [0, -1.35, 0], color: C.grey }));
    const cx = [['I', -2.4, C.blue, 0.5, 0.9], ['II', -1.3, C.teal, 0.4, 0.6], ['III', 0.0, C.purple, 0.5, 0.9], ['IV', 1.4, C.red, 0.5, 0.9], ['V', 2.6, C.amber, 0.35, 0.6]];
    cx.forEach(([n, x, col, w, h]) => { g.add(H.box(w, h, 0.9, col, [x, n === 'II' ? -0.15 : 0, 0], null, { e: 0.35 })); g.add(H.text(n, { size: 0.22, bold: true, pos: [x, 0, 0.5], top: true })); });
    g.add(H.sphere(0.3, C.amber, [2.6, -0.75, 0], { e: 0.5 })); g.add(H.text('F₁', { size: 0.16, pos: [2.6, -0.75, 0.32], top: true }));
    g.add(H.sphere(0.14, C.yellow, [-0.65, 0.05, 0.3], { e: 0.7 })); g.add(H.text('UQ', { size: 0.15, pos: [-0.65, 0.35, 0.3] }));
    g.add(H.sphere(0.12, C.pink, [0.7, 0.45, 0.3], { e: 0.7 })); g.add(H.text('Cyt c', { size: 0.15, pos: [0.7, 0.75, 0.3] }));
    // electron path
    const ep = [[-2.4, -0.2, 0.5], [-0.65, 0.05, 0.5], [0, 0, 0.5], [0.7, 0.45, 0.5], [1.4, 0, 0.5], [1.75, -0.5, 0.5]];
    g.add(H.tube(ep, 0.03, C.cyan, { seg: 40, e: 0.8 }));
    g.add(H.tube([[-1.3, -0.4, 0.5], [-0.65, 0.05, 0.5]], 0.03, C.cyan, { e: 0.8 }));
    // proton pumps
    [-2.4, 0, 1.4].forEach(x => g.add(H.arrow([x, -0.45, 0.6], [x, 0.85, 0.6], C.yellow, { r: 0.02, head: 0.15 })));
    g.add(H.arrow([2.6, 0.85, 0.6], [2.6, -0.5, 0.6], C.yellow, { r: 0.03, head: 0.2 }));
    g.add(H.text('H⁺', { size: 0.15, pos: [-2.4, 1.0, 0.6], color: C.yellow })); g.add(H.text('H⁺', { size: 0.15, pos: [0, 1.0, 0.6], color: C.yellow })); g.add(H.text('H⁺', { size: 0.15, pos: [1.4, 1.0, 0.6], color: C.yellow })); g.add(H.text('H⁺', { size: 0.15, pos: [2.6, 1.0, 0.6], color: C.yellow }));
    g.add(H.text('NADH → NAD⁺', { size: 0.15, pos: [-2.4, -0.95, 0.3], color: C.cyan })); g.add(H.text('FADH₂ → FAD', { size: 0.15, pos: [-1.3, -0.95, 0.3], color: C.cyan }));
    g.add(H.text('½O₂ + 2H⁺ + 2e⁻ → H₂O', { size: 0.14, pos: [1.6, -0.95, 0.3], color: C.red })); g.add(H.text('ADP + Pi → ATP', { size: 0.15, pos: [2.7, -1.15, 0.3], color: C.amber }));
    labels.push(L('Complex I (NADH dehydrogenase)', 'Accepts e⁻ from NADH; pumps H⁺; passes e⁻ to UQ', [-2.4, 0.45, 0]));
    labels.push(L('Complex II (succinate DH)', 'FADH₂ e⁻ enter here → UQ (no H⁺ pumping)', [-1.3, -0.15, 0.45]));
    labels.push(L('Ubiquinone (UQ)', 'Mobile lipid-soluble carrier in membrane', [-0.65, 0.05, 0.3]));
    labels.push(L('Complex III (cytochrome bc₁)', 'Oxidises UQH₂; e⁻ to cytochrome c; pumps H⁺', [0, 0.45, 0]));
    labels.push(L('Cytochrome c', 'Small mobile peripheral protein on outer surface of inner membrane', [0.7, 0.45, 0.3]));
    labels.push(L('Complex IV (cytochrome c oxidase)', 'Cyt a, a₃ + 2 Cu; reduces O₂ to H₂O', [1.4, 0.45, 0]));
    labels.push(L('Complex V (ATP synthase)', 'F₀ channel in membrane + F₁ head in matrix; H⁺ flow → ATP', [2.6, -0.75, 0]));
    labels.push(L('Inner mitochondrial membrane', 'Cristae bear ETS', [-3.1, 0, 0.5]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-13-5', unit: U4, ch: 'Ch 13 — Plant Growth and Development', fig: 'Fig 13.5', title: 'Sigmoid growth curve',
  desc: 'Growth of a cell/organ/organism over time follows an S-shaped (sigmoid) curve: lag phase, log (exponential) phase, and stationary phase. Typical of cells in culture and organs in nature.',
  points: ['Lag phase: slow initial growth. Log phase: rapid exponential — both progeny cells keep dividing. Stationary: nutrients limit growth.', 'Arithmetic growth: only one daughter cell keeps dividing → linear (Lt = L₀ + rt).', 'Geometric growth: Wt = W₀ eʳᵗ (r = relative growth rate, efficiency index).', 'Absolute growth rate vs relative growth rate (per unit initial parameter).'],
  build() {
    const g = H.grp(), labels = [];
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [0, 10], xl: 'Time', yl: 'Growth (size)', curves: [{ f: x => 9.6 / (1 + Math.exp(-(x - 5) * 1.1)), color: C.green, r: 0.04 }, { f: x => 0.9 * x, color: C.amber, dashed: true }], vl: [{ x: 2.5, y: 9.6 }, { x: 7.5, y: 9.6 }] });
    g.add(G);
    g.add(H.text('Lag', { size: 0.18, pos: G.map(1.2, 8.5), color: C.grey })); g.add(H.text('Log (exponential)', { size: 0.18, pos: G.map(5, 8.5), color: C.grey })); g.add(H.text('Stationary', { size: 0.18, pos: G.map(8.8, 8.5), color: C.grey }));
    labels.push(L('Lag phase', 'Slow start — cells preparing to divide', G.map(1.5, 0.5)));
    labels.push(L('Log / exponential phase', 'Geometric growth: rate maximum; Wt = W₀eʳᵗ', G.map(5, 4.8)));
    labels.push(L('Stationary phase', 'Growth slows as nutrients become limiting; plateau', G.map(9, 9.4)));
    labels.push(L('Sigmoid (S) curve', 'Characteristic of all organisms in natural environment', G.map(6.5, 8.2)));
    labels.push(L('Arithmetic growth (dashed)', 'Linear: one cell divides, other differentiates (root elongation at constant rate)', G.map(8.5, 7.6)));
    return { g, labels };
  }
}));


/* ---------- Ch 14 Breathing ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-14-1', unit: U5, ch: 'Ch 14 — Breathing and Exchange of Gases', fig: 'Fig 14.1', title: 'Human respiratory system',
  desc: 'Air passes through external nostrils → nasal chamber → pharynx → larynx → trachea → primary, secondary, tertiary bronchi → bronchioles → terminal bronchioles → alveoli. Lungs lie in the thoracic chamber covered by double-layered pleura.',
  points: ['Conducting part (nostrils → terminal bronchioles): clears, humidifies, warms air. Respiratory/exchange part: alveoli & ducts.', 'Trachea, bronchi & initial bronchioles supported by incomplete cartilaginous rings.', 'Larynx = sound box; epiglottis prevents food entry.', 'Diaphragm & intercostal muscles change thoracic volume; ~300 million alveoli.'],
  explode: 'Separate',
  build() {
    const g = H.grp(), labels = [];
    // head/face profile hint
    g.add(H.tube([[-0.3, 3.4, 0], [0.2, 3.1, 0], [0.35, 2.7, 0], [0.1, 2.5, 0]], 0.08, C.pink, { op: 0.6 }));
    g.add(H.tube([[0.1, 2.5, 0], [0.05, 2.25, 0], [0, 2.0, 0]], 0.1, C.orange));
    g.add(H.box(0.42, 0.3, 0.3, C.amber, [0, 1.85, 0]));
    // trachea with rings
    g.add(H.cyl(0.16, 0.16, 1.5, C.mem, [0, 0.95, 0], null, { op: 0.5 }));
    for (let i = 0; i < 8; i++) g.add(H.torus(0.17, 0.03, C.white, [0, 0.3 + i * 0.18, 0], [PI / 2, 0, 0], { arc: PI * 1.6, rot: [PI / 2, 0, -PI * 0.3] }));
    // lungs
    const lung = (s) => { const l = H.grp([], [s * 1.05, -0.9, 0]); l.add(H.lathe([[0, 1.2], [0.5, 1.05], [0.85, 0.4], [0.95, -0.6], [0.8, -1.3], [0, -1.35]], C.pink, null, null, { seg: 28, op: 0.35, side: THREE.DoubleSide, dw: false })); if (s > 0) l.add(H.torus(0.9, 0.02, C.white, [0, -0.1, 0], [0.3, 0, 0], { op: 0.5 })); l.add(H.torus(0.9, 0.02, C.white, [0, 0.5, 0], [0.5, 0, 0], { op: 0.5 })); return l; };
    g.add(H.ex(lung(-1), -1.2, 0, 0)); g.add(H.ex(lung(1), 1.2, 0, 0));
    // bronchial tree recursive
    const tree = H.grp();
    const rec = (p, dir, d, len, r) => { const e = p.clone().add(dir.clone().multiplyScalar(len)); tree.add(H.rod(p, e, r, d < 2 ? C.mem : C.cyan)); if (d >= 4) { tree.add(H.sphere(0.07, C.lime, e.toArray(), { seg: 8 })); return; } const a = Math.atan2(dir.y, dir.x); const spread = 0.55; rec(e, V3(Math.cos(a + spread), Math.sin(a + spread), 0.1 * (d % 2 ? 1 : -1)).normalize(), d + 1, len * 0.7, r * 0.7); rec(e, V3(Math.cos(a - spread), Math.sin(a - spread), -0.1 * (d % 2 ? 1 : -1)).normalize(), d + 1, len * 0.7, r * 0.7); };
    rec(V3(0, 0.2, 0), V3(-0.8, -0.6, 0).normalize(), 0, 0.9, 0.1); rec(V3(0, 0.2, 0), V3(0.8, -0.6, 0).normalize(), 0, 0.9, 0.1);
    g.add(tree);
    // diaphragm
    g.add(H.lathe([[0, -1.9], [1.0, -2.05], [2.2, -2.4]], C.red, null, null, { seg: 30, op: 0.6, side: THREE.DoubleSide }));
    // ribs hint
    for (let i = 0; i < 5; i++) g.add(H.torus(2.05, 0.03, C.bone, [0, 0.4 - i * 0.5, 0], [PI / 2 + 0.15, 0, 0], { arc: PI, rot: [PI / 2 + 0.15, 0, 0], op: 0.5 }));
    labels.push(L('Nasal chamber', 'Opens via external nostrils; hairs & mucus filter air', [0.2, 3.1, 0]));
    labels.push(L('Pharynx', 'Common passage for food & air', [0.05, 2.25, 0]));
    labels.push(L('Larynx (sound box)', 'Cartilaginous; epiglottis covers glottis during swallowing', [0, 1.85, 0.2]));
    labels.push(L('Trachea', 'Straight tube to mid-thorax (5th thoracic vertebra); C-shaped cartilage rings', [0, 0.95, 0.17]));
    labels.push(L('Primary bronchi', 'Trachea divides at T5 into right & left', [-0.55, -0.2, 0]));
    labels.push(L('Bronchioles → terminal bronchioles', 'Repeated branching; cartilage lost', [1.3, -1.0, 0]));
    labels.push(L('Alveoli', 'Thin, vascularised, irregular-walled sacs — gas exchange', [1.7, -1.6, 0.1]));
    labels.push(L('Lungs (in pleura)', 'Pleural fluid reduces friction; right lung 3 lobes, left 2', [-1.9, -0.6, 0]));
    labels.push(L('Diaphragm', 'Dome-shaped muscle; contracts (flattens) → inspiration', [1.0, -2.1, 0]));
    labels.push(L('Ribs (intercostal muscles)', 'External intercostals lift ribs → increase thoracic volume', [2.05, -0.6, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-14-3', unit: U5, ch: 'Ch 14 — Breathing and Exchange of Gases', fig: 'Fig 14.3', title: 'Alveolus & gas exchange with capillary',
  desc: 'Exchange of O₂ and CO₂ occurs by simple diffusion across the very thin diffusion membrane (< 1 mm total): squamous alveolar epithelium, basement substance, capillary endothelium. Driving force = partial pressure gradient.',
  points: ['pO₂: alveoli 104 mmHg, deoxygenated blood 40, tissues 40. pCO₂: alveoli 40, deoxygenated blood 45, tissues 45.', 'CO₂ solubility is 20–25× that of O₂ — so CO₂ diffuses well despite a smaller gradient.', 'O₂ carried mainly as oxyhaemoglobin (97%); CO₂ as bicarbonate (70%), carbamino-Hb (20–25%), dissolved (7%).', 'Chloride shift maintains ionic balance in RBC during bicarbonate exchange.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.sphere(1.5, C.pink, null, { phi: PI * 1.3, phiStart: PI * 0.35, op: 0.5, side: THREE.DoubleSide, dw: false }));
    g.add(H.sphere(1.4, C.mem, null, { phi: PI * 1.3, phiStart: PI * 0.35, op: 0.15, side: THREE.DoubleSide, dw: false }));
    // capillary wrapping
    const cap = []; for (let i = 0; i <= 40; i++) { const t = i / 40; const a = -0.6 + t * 2.2; cap.push([1.85 * Math.cos(a), -1.4 + t * 2.8, 1.85 * Math.sin(a)]); }
    g.add(H.tube(cap, 0.28, C.red, { seg: 60, op: 0.45, dw: false }));
    const cur = new THREE.CatmullRomCurve3(cap.map(vec));
    for (let i = 0; i < 8; i++) { const p = cur.getPoint(0.08 + i * 0.11); const rbc = H.torus(0.1, 0.06, i < 4 ? '#7f1d1d' : C.red, p.toArray(), null, { seg: 8, tseg: 16 }); rbc.lookAt(cur.getPoint(0.1 + i * 0.11)); g.add(rbc); }
    // gas arrows
    g.add(H.arrow([1.2, 0.5, 0.9], [1.7, 0.4, 1.2], C.blue, { r: 0.03 })); g.add(H.text('O₂', { size: 0.22, bold: true, pos: [1.0, 0.7, 0.9], color: C.blue }));
    g.add(H.arrow([1.75, -0.4, 1.15], [1.25, -0.5, 0.85], C.orange, { r: 0.03 })); g.add(H.text('CO₂', { size: 0.22, bold: true, pos: [1.0, -0.7, 0.85], color: C.orange }));
    g.add(H.text('pO₂ 104 · pCO₂ 40', { size: 0.16, pos: [0, 0.3, 0], color: C.grey })); g.add(H.text('(alveolar air, mmHg)', { size: 0.13, pos: [0, 0.05, 0], color: C.grey }));
    g.add(H.text('Deoxygenated: pO₂ 40 · pCO₂ 45', { size: 0.14, pos: [cap[3][0], cap[3][1] - 0.4, cap[3][2]], color: C.blue }));
    g.add(H.text('Oxygenated: pO₂ 95 · pCO₂ 40', { size: 0.14, pos: [cap[38][0], cap[38][1] + 0.4, cap[38][2]], color: C.red }));
    g.add(H.tube([[-1.5, 0.3, -0.2], [-2.2, 0.8, -0.3], [-2.8, 0.7, -0.2]], 0.2, C.mem, { op: 0.6 }));
    labels.push(L('Alveolar wall (squamous epithelium)', 'Single layer of thin cells (type I pneumocytes)', [-0.5, 1.4, 0.3]));
    labels.push(L('Alveolar cavity (air)', 'pO₂ 104 mmHg, pCO₂ 40 mmHg', [0, 0.3, 0]));
    labels.push(L('Pulmonary capillary', 'Endothelium one cell thick; wraps the alveolus', cap[20]));
    labels.push(L('Diffusion membrane', 'Alveolar epithelium + basement substance + capillary endothelium (< 1 mm)', [1.5, 0.05, 1.0]));
    labels.push(L('O₂ diffuses into blood', 'Gradient 104 → 40 mmHg; binds Hb → oxyhaemoglobin', [1.7, 0.4, 1.2]));
    labels.push(L('CO₂ diffuses into alveolus', 'Gradient 45 → 40 mmHg; from bicarbonate & carbamino-Hb', [1.75, -0.4, 1.15]));
    labels.push(L('RBC (deoxygenated)', 'Entering — from pulmonary artery', cap[3]));
    labels.push(L('RBC (oxygenated)', 'Leaving — to pulmonary vein', cap[38]));
    labels.push(L('Alveolar duct', 'Connects to respiratory bronchiole', [-2.2, 0.8, -0.3]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-14-5', unit: U5, ch: 'Ch 14 — Breathing and Exchange of Gases', fig: 'Fig 14.5', title: 'Oxygen dissociation curve',
  desc: 'Percentage saturation of haemoglobin with O₂ plotted against pO₂ gives a sigmoid curve. High pO₂, low pCO₂, low H⁺ and low temperature (alveoli) favour oxyhaemoglobin formation; the opposite (tissues) favours dissociation.',
  points: ['Sigmoid shape due to cooperative binding — each Hb binds 4 O₂.', 'Alveoli: pO₂ ~95–104 mmHg → ~97% saturation. Tissues: pO₂ ~40 → ~75%; ~5 mL O₂ delivered per 100 mL blood.', 'Right shift (↑pCO₂, ↑H⁺, ↑temp, ↑2,3-BPG): Hb releases O₂ more readily (Bohr effect).', 'P₅₀ ≈ 26–27 mmHg (pO₂ at 50% saturation).'],
  build() {
    const g = H.grp(), labels = [];
    const sat = (p, p50, n) => 100 * Math.pow(p, n) / (Math.pow(p, n) + Math.pow(p50, n));
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 100], yr: [0, 100], xl: 'pO₂ (mmHg)', yl: '% saturation of Hb', xt: [[20, '20'], [40, '40'], [60, '60'], [80, '80'], [100, '100']], yt: [[50, '50'], [100, '100']], nx: 10, ny: 5,
      curves: [{ f: x => sat(x, 26, 2.7), color: C.red, r: 0.04, label: 'normal' }, { f: x => sat(x, 36, 2.7), color: C.orange, dashed: true, label: '↑CO₂/H⁺/temp' }],
      marks: [{ x: 40, y: sat(40, 26, 2.7), color: C.blue, label: 'tissues (~75%)', dx: 0.2, dy: -0.25 }, { x: 95, y: sat(95, 26, 2.7), color: C.green, label: 'alveoli (~97%)', dx: -1.0, dy: 0.25 }, { x: 26, y: 50, color: C.yellow, label: 'P₅₀', dx: 0.3, dy: -0.2 }],
      hl: [{ y: 50, x: 26 }], vl: [{ x: 26, y: 50 }, { x: 40, y: sat(40, 26, 2.7) }] });
    g.add(G);
    labels.push(L('Sigmoid curve', 'Cooperative binding of 4 O₂ to Hb', G.map(50, sat(50, 26, 2.7))));
    labels.push(L('Alveolar region (plateau)', 'pO₂ ~95–104 mmHg — Hb nearly saturated (97%)', G.map(95, 97)));
    labels.push(L('Tissue region (steep)', 'pO₂ 40 mmHg — ~75% saturation; O₂ unloaded', G.map(40, 75)));
    labels.push(L('P₅₀', 'pO₂ at 50% saturation (~26 mmHg)', G.map(26, 50)));
    labels.push(L('Right shift (Bohr effect)', 'High pCO₂, H⁺, temperature → lower affinity → more O₂ released to tissues', G.map(60, sat(60, 36, 2.7))));
    return { g, labels };
  }
}));

/* ---------- Ch 15 Body Fluids & Circulation ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-15-2', unit: U5, ch: 'Ch 15 — Body Fluids and Circulation', fig: 'Fig 15.2', title: 'Human heart (sectional view)',
  desc: 'Mesodermal, four-chambered heart in the thoracic cavity, protected by double-walled pericardium. Atria are separated by the interatrial septum, ventricles by the interventricular septum; atrio-ventricular septum with tricuspid (right) and bicuspid/mitral (left) valves.',
  points: ['Valves: tricuspid (RA→RV), bicuspid/mitral (LA→LV), semilunar (pulmonary artery & aorta) — allow one-way flow.', 'Nodal tissue: SA node (right atrium, upper right corner) = pacemaker 70–75/min; AV node (lower left corner of RA); bundle of His; Purkinje fibres.', 'Cardiac cycle 0.8 s: atrial systole 0.1 s, ventricular systole 0.3 s, joint diastole 0.4 s; stroke volume 70 mL; cardiac output ~5 L/min.', 'Lub = closure of AV valves; Dub = closure of semilunar valves.'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    const mk = (fn) => fn();
    // four chambers as half-sectioned shells (front half removed)
    const half = { phi: PI, phiStart: PI, side: THREE.DoubleSide };
    const RA = H.ell(0.85, 0.75, 0.75, C.blue, [-0.95, 1.0, 0], Object.assign({ op: 0.55, dw: false }, half));
    const LA = H.ell(0.85, 0.75, 0.75, C.red, [0.95, 1.0, 0], Object.assign({ op: 0.55, dw: false }, half));
    const RV = H.lathe([[0, -1.7], [0.6, -1.3], [0.95, -0.4], [0.9, 0.35]], C.blue, [-0.75, 0, 0], null, { seg: 28, phiStart: PI, phiLen: PI, op: 0.55, dw: false, side: THREE.DoubleSide });
    const LV = H.lathe([[0, -2.1], [0.7, -1.6], [1.0, -0.4], [0.9, 0.35]], C.red, [0.75, 0, 0], null, { seg: 28, phiStart: PI, phiLen: PI, op: 0.55, dw: false, side: THREE.DoubleSide });
    // thick LV wall hint
    g.add(H.ex(RA, -1.2, 1.0, 0)); g.add(H.ex(LA, 1.2, 1.0, 0)); g.add(H.ex(RV, -1.2, -0.8, 0)); g.add(H.ex(LV, 1.2, -0.8, 0));
    g.add(H.ex(H.lathe([[0, -2.0], [0.55, -1.5], [0.8, -0.4], [0.75, 0.3]], C.muscle, [0.75, 0, 0], null, { seg: 28, phiStart: PI, phiLen: PI, op: 0.35, dw: false, side: THREE.DoubleSide }), 1.2, -0.8, 0));
    // septa
    g.add(H.box(0.22, 2.2, 1.2, C.muscle, [0, -0.7, -0.4], null, { op: 0.9 }));
    g.add(H.box(0.12, 1.2, 1.0, C.pink, [0, 1.0, -0.4], null, { op: 0.9 }));
    // valves
    const valve = (x, y, col, n, r) => { for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.3; g.add(H.extrude([[0, 0], [0.3, -0.1], [0.32, -0.4], [0, -0.5], [-0.32, -0.4], [-0.3, -0.1]], 0.02, col, [x + r * Math.cos(a), y, -0.3 + r * Math.sin(a) * 0.6], [0.5, a, 0], { sx: r * 1.2, sy: r * 1.2 })); } };
    valve(-0.85, 0.35, C.white, 3, 0.35); valve(0.85, 0.35, C.white, 2, 0.35);
    // great vessels
    const aorta = H.tube([[0.35, 0.4, -0.2], [0.3, 1.6, -0.2], [0.1, 2.6, -0.2], [-0.8, 2.9, -0.2], [-1.6, 2.5, -0.3], [-1.8, 1.8, -0.6]], 0.3, C.red, { seg: 40, op: 0.9 }); g.add(H.ex(aorta, 0, 0.9, 0));
    g.add(H.ex(H.tube([[-0.5, 2.9, -0.2], [-0.5, 3.5, -0.2]], 0.1, C.red), 0, 0.9, 0)); g.add(H.ex(H.tube([[-0.9, 2.9, -0.2], [-1.0, 3.5, -0.2]], 0.1, C.red), 0, 0.9, 0)); g.add(H.ex(H.tube([[-0.15, 2.8, -0.2], [0.0, 3.5, -0.2]], 0.1, C.red), 0, 0.9, 0));
    const pulm = H.tube([[-0.45, 0.4, 0.3], [-0.3, 1.4, 0.5], [-0.4, 2.2, 0.4], [-1.2, 2.3, 0.3]], 0.25, C.blue, { seg: 30, op: 0.9 }); g.add(H.ex(pulm, -0.3, 0.9, 0.3));
    g.add(H.ex(H.tube([[-0.5, 2.15, 0.4], [0.5, 2.25, 0.4], [1.3, 2.1, 0.3]], 0.2, C.blue, { op: 0.9 }), -0.3, 0.9, 0.3));
    g.add(H.ex(H.tube([[-1.4, 1.55, -0.3], [-1.6, 2.3, -0.4], [-1.7, 3.0, -0.5]], 0.24, C.blue, { op: 0.9 }), -1.2, 1.0, 0)); // SVC
    g.add(H.ex(H.tube([[-1.3, 0.4, -0.3], [-1.5, -0.6, -0.5], [-1.6, -1.6, -0.6]], 0.24, C.blue, { op: 0.9 }), -1.2, 1.0, 0)); // IVC
    for (let i = 0; i < 2; i++) { g.add(H.ex(H.tube([[1.6, 1.2 - i * 0.3, -0.2], [2.3, 1.4 - i * 0.4, -0.3], [2.9, 1.6 - i * 0.5, -0.3]], 0.12, C.red, { op: 0.9 }), 1.2, 1.0, 0)); } // pulmonary veins
    // conducting system
    const node = (p, col) => g.add(H.ex(H.sphere(0.12, col, p, { e: 0.9 }), -1.2, 1.0, 0));
    node([-1.35, 1.45, -0.3], C.yellow); node([-0.35, 0.55, -0.3], C.amber);
    g.add(H.tube([[-0.3, 0.5, -0.3], [-0.05, 0.1, -0.3], [-0.05, -0.8, -0.3]], 0.04, C.yellow, { e: 0.8 }));
    g.add(H.tube([[-0.05, -0.8, -0.3], [-0.3, -1.3, -0.3], [-0.8, -1.2, -0.2], [-1.1, -0.6, -0.1]], 0.03, C.yellow, { e: 0.8 })); g.add(H.tube([[-0.05, -0.8, -0.3], [0.3, -1.5, -0.3], [0.9, -1.4, -0.2], [1.3, -0.6, -0.1]], 0.03, C.yellow, { e: 0.8 }));
    labels.push(L('Right atrium', 'Receives deoxygenated blood from SVC, IVC & coronary sinus', [-0.95, 1.0, 0]));
    labels.push(L('Left atrium', 'Receives oxygenated blood from 4 pulmonary veins', [0.95, 1.0, 0]));
    labels.push(L('Right ventricle', 'Pumps to lungs via pulmonary artery', [-0.75, -0.6, 0.2]));
    labels.push(L('Left ventricle (thick wall)', 'Pumps to whole body via aorta — thickest wall', [0.75, -0.9, 0.2]));
    labels.push(L('Tricuspid valve', 'Right AV opening — 3 cusps', [-0.85, 0.35, -0.3]));
    labels.push(L('Bicuspid (mitral) valve', 'Left AV opening — 2 cusps', [0.85, 0.35, -0.3]));
    labels.push(L('Interventricular septum', 'Thick muscular wall between ventricles', [0, -0.7, -0.4]));
    labels.push(L('Interatrial septum', 'Thin wall between atria', [0, 1.0, -0.4]));
    labels.push(L('Aorta (with semilunar valve)', 'Systemic arch — arteries to head, arms, body', [-0.8, 2.9, -0.2]));
    labels.push(L('Pulmonary artery (semilunar valve)', 'Carries deoxygenated blood to lungs', [-0.4, 2.2, 0.4]));
    labels.push(L('Superior vena cava', 'From head & upper body', [-1.7, 3.0, -0.5]));
    labels.push(L('Inferior vena cava', 'From lower body', [-1.6, -1.6, -0.6]));
    labels.push(L('Pulmonary veins', 'Oxygenated blood from lungs → LA', [2.9, 1.6, -0.3]));
    labels.push(L('SA node (pacemaker)', 'Upper right corner of RA; 70–75 impulses/min', [-1.35, 1.45, -0.3]));
    labels.push(L('AV node', 'Lower-left corner of RA near AV septum', [-0.35, 0.55, -0.3]));
    labels.push(L('Bundle of His → Purkinje fibres', 'AV bundle in septum → branches → Purkinje fibres in ventricular walls', [-0.05, -0.8, -0.3]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-15-3', unit: U5, ch: 'Ch 15 — Body Fluids and Circulation', fig: 'Fig 15.3', title: 'Standard ECG waveform',
  desc: 'An electrocardiograph records electrical activity of the heart. A normal ECG has P, QRS and T waves; deviations indicate abnormalities. Counting QRS complexes per minute gives heart rate.',
  points: ['P wave: depolarisation of atria (atrial contraction).', 'QRS complex: depolarisation of ventricles (ventricular contraction begins).', 'T wave: ventricular repolarisation (return to normal); end of T = end of systole.', 'Standard leads: 3 electrical leads on wrists & left ankle; P–Q interval = AV conduction time.'],
  build() {
    const g = H.grp(), labels = [];
    const ecg = x => { let y = 0; const gs = (c, w, a) => a * Math.exp(-Math.pow((x - c) / w, 2)); y += gs(1.4, 0.22, 0.25); y -= gs(2.65, 0.06, 0.18); y += gs(2.8, 0.06, 1.0); y -= gs(2.98, 0.07, 0.3); y += gs(4.1, 0.32, 0.35); y += 0.05 * gs(4.9, 0.15, 0.6); return y; };
    const pts = []; for (let i = 0; i <= 260; i++) { const x = i / 260 * 6; pts.push([x, ecg(x)]); }
    const G = H.graph({ w: 5.2, h: 2.6, xr: [0, 6], yr: [-0.5, 1.2], xl: 'Time', yl: 'mV', nx: 12, ny: 6, curves: [{ pts, color: C.lime, r: 0.035, tension: 0 }], yt: [[0, '0'], [1, '1']] });
    g.add(G);
    const lab = (t, x, y, col) => g.add(H.text(t, { size: 0.22, bold: true, pos: G.map(x, y, 0.1), color: col }));
    lab('P', 1.4, 0.45, C.cyan); lab('Q', 2.55, -0.35, C.orange); lab('R', 2.8, 1.15, C.red); lab('S', 3.05, -0.45, C.orange); lab('T', 4.1, 0.55, C.purple);
    g.add(H.line([G.map(1.1, -0.2), G.map(2.6, -0.2)], C.grey)); g.add(H.text('P–Q interval', { size: 0.13, pos: G.map(1.85, -0.3), color: C.grey }));
    g.add(H.line([G.map(2.6, 0.9), G.map(4.6, 0.9)], C.grey)); g.add(H.text('Q–T interval', { size: 0.13, pos: G.map(3.6, 1.0), color: C.grey }));
    labels.push(L('P wave', 'Atrial depolarisation → atrial contraction', G.map(1.4, 0.25)));
    labels.push(L('QRS complex', 'Ventricular depolarisation → ventricular contraction starts', G.map(2.8, 1.0)));
    labels.push(L('T wave', 'Ventricular repolarisation (relaxation); end of T = end of systole', G.map(4.1, 0.35)));
    labels.push(L('P–Q interval', 'Conduction delay at AV node', G.map(1.85, -0.2)));
    labels.push(L('Q–T interval', 'Duration of ventricular systole', G.map(3.6, 0.9)));
    labels.push(L('Baseline (iso-electric)', 'No net electrical activity', G.map(5.5, 0)));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-15-4', unit: U5, ch: 'Ch 15 — Body Fluids and Circulation', fig: 'Fig 15.4', title: 'Double circulation',
  desc: 'Blood passes twice through the heart per cycle: pulmonary circulation (RV → lungs → LA) and systemic circulation (LV → body → RA). Oxygenated and deoxygenated blood never mix.',
  points: ['Pulmonary: RV → pulmonary artery (deoxygenated) → lungs → pulmonary veins (oxygenated) → LA.', 'Systemic: LV → aorta → arteries → tissues → veins → vena cavae → RA.', 'Hepatic portal system: intestine → hepatic portal vein → liver → hepatic vein.', 'Fishes: single circulation (2-chambered); amphibians/reptiles: incomplete double (3 chambers); birds & mammals: complete double.'],
  build() {
    const g = H.grp(), labels = [];
    const box = (x, y, w, h, col, txt) => { g.add(H.box(w, h, 0.5, col, [x, y, 0], null, { op: 0.35 })); g.add(H.box(w + 0.02, h + 0.02, 0.52, col, [x, y, 0], null, { wire: true })); g.add(H.text(txt, { size: 0.18, bold: true, pos: [x, y, 0.3], top: true })); };
    box(0, 2.2, 3.2, 1.0, C.pink, 'Lungs'); box(0, -2.2, 3.2, 1.0, C.amber, 'Body tissues');
    box(-0.9, 0.5, 1.2, 0.7, C.blue, 'RA'); box(-0.9, -0.5, 1.2, 0.8, C.blue, 'RV'); box(0.9, 0.5, 1.2, 0.7, C.red, 'LA'); box(0.9, -0.5, 1.2, 0.8, C.red, 'LV');
    g.add(H.arrow([-0.9, 0.15, 0.1], [-0.9, -0.1, 0.1], C.white, { r: 0.02, head: 0.12 })); g.add(H.arrow([0.9, 0.15, 0.1], [0.9, -0.1, 0.1], C.white, { r: 0.02, head: 0.12 }));
    // pulmonary loop
    g.add(H.tube([[-1.3, -0.1, 0.1], [-2.2, 0.4, 0.1], [-2.3, 1.6, 0.1], [-1.5, 2.2, 0.1]], 0.08, C.blue)); g.add(H.cone(0.18, 0.3, C.blue, [-1.5, 2.2, 0.1], [0, 0, -PI / 2]));
    g.add(H.tube([[1.5, 2.2, 0.1], [2.3, 1.6, 0.1], [2.2, 0.9, 0.1], [1.5, 0.6, 0.1]], 0.08, C.red)); g.add(H.cone(0.18, 0.3, C.red, [1.5, 0.6, 0.1], [0, 0, PI / 2 + 0.5]));
    // systemic loop
    g.add(H.tube([[1.4, -0.7, 0.1], [2.5, -0.9, 0.1], [2.6, -2.0, 0.1], [1.7, -2.2, 0.1]], 0.08, C.red)); g.add(H.cone(0.18, 0.3, C.red, [1.7, -2.2, 0.1], [0, 0, PI / 2]));
    g.add(H.tube([[-1.7, -2.2, 0.1], [-2.6, -2.0, 0.1], [-2.6, -0.4, 0.1], [-1.5, 0.5, 0.1]], 0.08, C.blue)); g.add(H.cone(0.18, 0.3, C.blue, [-1.5, 0.5, 0.1], [0, 0, -PI / 2 - 0.6]));
    g.add(H.text('Pulmonary artery', { size: 0.14, pos: [-2.9, 1.2, 0.1], color: C.blue })); g.add(H.text('Pulmonary veins', { size: 0.14, pos: [2.9, 1.2, 0.1], color: C.red }));
    g.add(H.text('Aorta', { size: 0.14, pos: [3.0, -1.4, 0.1], color: C.red })); g.add(H.text('Vena cava', { size: 0.14, pos: [-3.1, -1.2, 0.1], color: C.blue }));
    labels.push(L('Pulmonary circulation', 'RV → pulmonary artery → lungs → pulmonary veins → LA', [-2.3, 1.6, 0.1]));
    labels.push(L('Systemic circulation', 'LV → aorta → body tissues → vena cavae → RA', [2.6, -2.0, 0.1]));
    labels.push(L('Lungs', 'Blood oxygenated; CO₂ released', [0, 2.2, 0.3]));
    labels.push(L('Body tissues', 'O₂ & nutrients delivered; CO₂ & wastes collected', [0, -2.2, 0.3]));
    labels.push(L('Right side (deoxygenated)', 'RA → RV', [-0.9, 0, 0.3]));
    labels.push(L('Left side (oxygenated)', 'LA → LV', [0.9, 0, 0.3]));
    return { g, labels };
  }
}));

/* ---------- Ch 16 Excretion ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-16-2', unit: U5, ch: 'Ch 16 — Excretory Products and their Elimination', fig: 'Fig 16.2', title: 'L.S. of human kidney',
  desc: 'Reddish-brown, bean-shaped kidneys (10–12 cm × 5–7 cm × 2–3 cm; 120–170 g) lie between the last thoracic and 3rd lumbar vertebrae. Outer cortex, inner medulla with pyramids projecting into calyces of the pelvis.',
  points: ['Hilum: notch where ureter, blood vessels & nerves enter; inside it the renal pelvis with calyces.', 'Medullary pyramids project into minor calyces; columns of Bertin = cortex between pyramids.', 'Each kidney ~1 million nephrons; cortical (85%) & juxtamedullary nephrons.', 'Kidney → ureter → urinary bladder → urethra; micturition reflex.'],
  build() {
    const g = H.grp(), labels = [];
    const bean = []; for (let i = 0; i <= 24; i++) { const t = -PI / 2 + i / 24 * PI; bean.push([1.15 * Math.cos(t) + 0.1, 1.9 * Math.sin(t)]); }
    // outer capsule half + full transparent
    g.add(H.lathe(bean, '#7f1d1d', null, null, { seg: 32, phiStart: PI, phiLen: PI, op: 0.85, side: THREE.DoubleSide }));
    g.add(H.lathe(bean.map(p => [p[0] * 0.85, p[1] * 0.9]), C.red, null, null, { seg: 32, phiStart: PI, phiLen: PI, op: 0.7, side: THREE.DoubleSide }));
    // pyramids
    for (let i = 0; i < 6; i++) { const a = -1.1 + i * 0.45; const p = [0.55 * Math.cos(a) + 0.1, 1.45 * Math.sin(a), 0]; const c = H.cone(0.28, 0.75, '#fb7185', p, [0, 0, -a - PI / 2], { seg: 8 }); g.add(c); g.add(H.cone(0.1, 0.12, C.white, [p[0] - 0.42 * Math.cos(a), p[1] - 0.42 * Math.sin(a), 0], [0, 0, -a + PI / 2], { seg: 8, op: 0.5 })); }
    // pelvis + calyces + ureter
    g.add(H.ell(0.35, 0.8, 0.25, C.yellow, [-0.45, 0, 0], { op: 0.85 }));
    for (let i = 0; i < 6; i++) { const a = -1.1 + i * 0.45; g.add(H.tube([[-0.45, 0.3 * Math.sin(a) * 2, 0], [0.1 + 0.1 * Math.cos(a), 1.05 * Math.sin(a), 0]], 0.08, C.yellow, { op: 0.85 })); }
    g.add(H.tube([[-0.5, -0.7, 0], [-0.7, -1.6, 0], [-0.8, -2.6, 0]], 0.1, C.yellow));
    g.add(H.tube([[-0.7, 0.35, 0.05], [-1.4, 0.5, 0.05], [-2.2, 0.55, 0.05]], 0.1, C.red)); g.add(H.tube([[-0.7, 0.05, -0.05], [-1.5, 0.15, -0.05], [-2.2, 0.15, -0.05]], 0.12, C.blue));
    labels.push(L('Capsule (fibrous)', 'Tough outer covering', [1.2, 0.6, 0]));
    labels.push(L('Cortex', 'Outer zone — Malpighian bodies, PCT, DCT', [0.95, 1.0, 0]));
    labels.push(L('Medulla (pyramids)', 'Conical medullary pyramids with loops of Henle & collecting ducts', [0.55 * Math.cos(-0.2) + 0.1, 1.45 * Math.sin(-0.2), 0]));
    labels.push(L('Columns of Bertin', 'Cortex extending between pyramids', [0.6, -0.55, 0]));
    labels.push(L('Renal papilla', 'Tip of pyramid projecting into minor calyx', [0.1 + 0.1 * Math.cos(0.7) - 0.3, 1.05 * Math.sin(0.7), 0]));
    labels.push(L('Calyces', 'Minor → major calyces collect urine', [-0.2, 0.8, 0]));
    labels.push(L('Renal pelvis', 'Funnel-shaped; continues as ureter', [-0.45, 0, 0]));
    labels.push(L('Ureter', 'Carries urine to bladder', [-0.8, -2.6, 0]));
    labels.push(L('Renal artery / vein', 'Enter/leave at the hilum', [-2.2, 0.35, 0]));
    labels.push(L('Hilum', 'Notch on concave side', [-0.9, 0.2, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-16-3', unit: U5, ch: 'Ch 16 — Excretory Products and their Elimination', fig: 'Fig 16.3', title: 'Structure of a nephron',
  desc: 'Each nephron = Malpighian body (glomerulus + Bowman\'s capsule) and a renal tubule (PCT → Henle\'s loop → DCT) draining into a collecting duct. Glomerular filtration ~125 mL/min (180 L/day); urine ~1.5 L/day.',
  points: ['Glomerulus: capillary tuft from afferent arteriole; efferent arteriole leaves — ultrafiltration through 3 layers (endothelium, basement membrane, podocytes with slit pores).', 'PCT: ~70–80% electrolytes & water reabsorbed; simple cuboidal brush-border epithelium; secretes H⁺, NH₃, K⁺.', 'Henle\'s loop: descending limb permeable to water, ascending limb impermeable to water but moves electrolytes.', 'DCT: conditional reabsorption of Na⁺, water (ADH); collecting duct concentrates urine; JGA secretes renin.'],
  build() {
    const g = H.grp(), labels = [];
    // Bowman's capsule + glomerulus
    const bc = [-1.9, 1.8, 0];
    g.add(H.sphere(0.72, C.amber, bc, { phi: PI * 1.4, phiStart: PI * 0.3, op: 0.35, side: THREE.DoubleSide, dw: false }));
    const glo = []; const rng = H.rng(17); for (let i = 0; i < 40; i++) { const a = i * 0.9, b = i * 0.37; glo.push([bc[0] + 0.42 * Math.sin(b) * Math.cos(a), bc[1] + 0.42 * Math.cos(b), bc[2] + 0.42 * Math.sin(b) * Math.sin(a)]); }
    g.add(H.tube(glo, 0.05, C.red, { seg: 200, tension: 0.6 }));
    g.add(H.tube([[-3.3, 2.4, 0], [-2.7, 2.2, 0], [bc[0] - 0.4, bc[1] + 0.3, 0]], 0.09, C.red)); g.add(H.tube([[bc[0] - 0.4, bc[1] - 0.2, 0.1], [-2.8, 1.5, 0.1], [-3.3, 1.5, 0.1]], 0.06, C.red));
    // PCT (coiled)
    const pct = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pct.push([bc[0] + 0.7 + t * 1.6 + 0.2 * Math.sin(t * 20), bc[1] - 0.1 + 0.28 * Math.cos(t * 20), 0.25 * Math.sin(t * 13)]); }
    g.add(H.tube(pct, 0.11, C.orange, { seg: 120 }));
    const pend = pct[40];
    // descending limb → loop → ascending
    g.add(H.tube([pend, [pend[0] + 0.1, 0.9, 0], [pend[0] + 0.1, -0.6, 0], [pend[0] + 0.1, -2.0, 0]], 0.07, C.yellow, { seg: 20 }));
    g.add(H.tube([[pend[0] + 0.1, -2.0, 0], [pend[0] + 0.35, -2.35, 0], [pend[0] + 0.6, -2.0, 0]], 0.07, C.yellow, { seg: 20 }));
    g.add(H.tube([[pend[0] + 0.6, -2.0, 0], [pend[0] + 0.6, -0.5, 0], [pend[0] + 0.6, 1.0, 0]], 0.1, C.lime, { seg: 20 }));
    // DCT
    const dct = []; for (let i = 0; i <= 30; i++) { const t = i / 30; dct.push([pend[0] + 0.6 + t * 1.0 + 0.15 * Math.sin(t * 16), 1.0 + 0.3 * t + 0.2 * Math.cos(t * 16), 0.2 * Math.sin(t * 10)]); }
    g.add(H.tube(dct, 0.1, C.teal, { seg: 90 }));
    const dend = dct[30];
    // collecting duct
    g.add(H.tube([[dend[0] + 0.05, dend[1], 0], [dend[0] + 0.35, 1.0, 0], [dend[0] + 0.35, -1.0, 0], [dend[0] + 0.35, -2.7, 0]], 0.14, C.purple, { seg: 20, op: 0.9 }));
    g.add(H.tube([[dend[0] + 0.35, 1.9, 0], [dend[0] + 0.05, 2.2, 0]], 0.06, C.teal, { op: 0.5 }));
    // vasa recta
    g.add(H.tube([[pend[0] + 0.35, 0.8, -0.35], [pend[0] + 0.28, -1.2, -0.35], [pend[0] + 0.35, -2.25, -0.35], [pend[0] + 0.45, -1.2, -0.35], [pend[0] + 0.5, 0.8, -0.35]], 0.03, C.red, { seg: 40, op: 0.8 }));
    // peritubular capillaries hint
    for (let i = 0; i < 5; i++) g.add(H.tube([[bc[0] + 0.9 + i * 0.3, bc[1] + 0.45, -0.35], [bc[0] + 1.05 + i * 0.3, bc[1] - 0.45, -0.35]], 0.02, C.red, { op: 0.6 }));
    g.add(H.plane(6, 5.4, C.dgrey, [0.3, -1.4, -0.6], null, { op: 0.15, dw: false })); g.add(H.line([[-3.3, 0.35, -0.55], [3.5, 0.35, -0.55]], C.grey, { dashed: true }));
    g.add(H.text('Cortex', { size: 0.16, pos: [3.2, 0.6, -0.5], color: C.grey })); g.add(H.text('Medulla', { size: 0.16, pos: [3.2, 0.1, -0.5], color: C.grey }));
    labels.push(L("Bowman's capsule", 'Double-walled cup; inner podocytes with slit pores', [bc[0] - 0.5, bc[1] + 0.5, 0]));
    labels.push(L('Glomerulus', 'Capillary tuft — ultrafiltration (GFR 125 mL/min)', bc));
    labels.push(L('Afferent arteriole', 'Wider — from renal artery; brings blood in', [-3.3, 2.4, 0]));
    labels.push(L('Efferent arteriole', 'Narrower — leaves glomerulus → peritubular capillaries', [-3.3, 1.5, 0.1]));
    labels.push(L('Proximal convoluted tubule (PCT)', 'Brush border; reabsorbs 70–80% water, glucose, amino acids, Na⁺', [pct[20][0], pct[20][1] + 0.35, 0]));
    labels.push(L('Descending limb of Henle', 'Thin; permeable to water, impermeable to salts', [pend[0] + 0.1, -0.8, 0]));
    labels.push(L('Loop of Henle (hairpin)', 'Dips into medulla; counter-current', [pend[0] + 0.35, -2.35, 0]));
    labels.push(L('Ascending limb (thick)', 'Impermeable to water; actively pumps NaCl out', [pend[0] + 0.6, -0.3, 0]));
    labels.push(L('Distal convoluted tubule (DCT)', 'Conditional Na⁺/water reabsorption; secretes H⁺, K⁺; JGA nearby', [dct[15][0], dct[15][1] + 0.35, 0]));
    labels.push(L('Collecting duct', 'Receives many nephrons; ADH ↑ water reabsorption; urea passes out', [dend[0] + 0.35, -2.0, 0]));
    labels.push(L('Vasa recta', 'U-shaped capillary parallel to Henle\'s loop (juxtamedullary nephrons)', [pend[0] + 0.28, -1.2, -0.35]));
    labels.push(L('Peritubular capillaries', 'Network around tubule for reabsorption/secretion', [bc[0] + 1.5, bc[1] + 0.45, -0.35]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-16-5', unit: U5, ch: 'Ch 16 — Excretory Products and their Elimination', fig: 'Fig 16.5', title: 'Counter-current mechanism',
  desc: 'Flow in opposite directions in the two limbs of Henle\'s loop and in the vasa recta builds and maintains an osmolarity gradient in the medulla (300 mOsm/L in cortex → 1200 mOsm/L at inner medulla), enabling production of concentrated urine.',
  points: ['NaCl transported by ascending limb is exchanged with descending limb of vasa recta; NaCl returns to interstitium by ascending vasa recta.', 'Urea diffuses from collecting duct into interstitium and re-enters the thin ascending limb (urea recycling).', 'Gradient allows collecting duct to lose water passively (ADH-dependent) → urine up to 4× concentrated (1200 mOsm/L).', 'Juxtamedullary nephrons with long loops are the main contributors.'],
  build() {
    const g = H.grp(), labels = [];
    // gradient bands
    const vals = [300, 600, 900, 1200]; vals.forEach((v, i) => { const y = 1.3 - i * 1.1; g.add(H.box(6.2, 1.05, 0.05, ['#1e3a5f', '#1d4ed8', '#7c3aed', '#be123c'][i], [0, y, -0.5], null, { op: 0.4 })); g.add(H.text(v + ' mOsm/L', { size: 0.16, pos: [-2.6, y, -0.45], color: C.grey })); });
    g.add(H.line([[-3.1, 1.85, -0.4], [3.1, 1.85, -0.4]], C.grey, { dashed: true })); g.add(H.text('Cortex ↑ / Medulla ↓', { size: 0.15, pos: [2.2, 2.0, -0.4], color: C.grey }));
    // Henle loop
    const HL = x => [[x, 1.9, 0], [x, 0, 0], [x, -1.9, 0], [x + 0.25, -2.25, 0], [x + 0.5, -1.9, 0], [x + 0.5, 0, 0], [x + 0.5, 1.9, 0]];
    const hl = HL(-1.5); g.add(H.tube(hl.slice(0, 4), 0.08, C.yellow, { seg: 30 })); g.add(H.tube(hl.slice(3), 0.11, C.lime, { seg: 30 }));
    // vasa recta
    const vr = HL(0.2); g.add(H.tube(vr, 0.06, C.red, { seg: 60 }));
    // collecting duct
    g.add(H.tube([[1.9, 1.9, 0], [1.9, 0, 0], [1.9, -2.2, 0]], 0.13, C.purple, { seg: 10, op: 0.9 }));
    // arrows: water out of descending & CD; NaCl out of ascending; urea
    for (let i = 0; i < 3; i++) { const y = 1.0 - i * 1.0; g.add(H.arrow([-1.6, y, 0.15], [-2.2, y, 0.15], C.cyan, { r: 0.015, head: 0.1 })); g.add(H.arrow([-0.9, y, 0.15], [-0.3, y, 0.15], C.orange, { r: 0.015, head: 0.1 })); g.add(H.arrow([1.75, y, 0.15], [1.2, y, 0.15], C.cyan, { r: 0.015, head: 0.1 })); }
    g.add(H.arrow([0.6, 0.5, 0.15], [0.15, 0.5, 0.15], C.orange, { r: 0.015, head: 0.1 })); g.add(H.arrow([0.75, -0.5, 0.15], [1.2, -0.5, 0.15], C.orange, { r: 0.015, head: 0.1 }));
    g.add(H.arrow([1.75, -1.6, 0.15], [-0.6, -1.6, 0.15], C.pink, { r: 0.015, head: 0.12 })); g.add(H.text('urea', { size: 0.14, pos: [0.6, -1.45, 0.15], color: C.pink }));
    g.add(H.text('H₂O', { size: 0.14, pos: [-2.5, 1.2, 0.15], color: C.cyan })); g.add(H.text('NaCl', { size: 0.14, pos: [-0.35, 1.2, 0.15], color: C.orange }));
    g.add(H.text('H₂O', { size: 0.14, pos: [1.15, 1.2, 0.15], color: C.cyan }));
    // flow arrows
    g.add(H.arrow([-1.5, 2.2, 0], [-1.5, 1.95, 0], C.white, { r: 0.015, head: 0.1 })); g.add(H.arrow([-1.0, 1.95, 0], [-1.0, 2.2, 0], C.white, { r: 0.015, head: 0.1 })); g.add(H.arrow([1.9, 2.3, 0], [1.9, 2.05, 0], C.white, { r: 0.015, head: 0.1 }));
    labels.push(L('Descending limb (Henle)', 'Water leaves passively as interstitium gets saltier — filtrate concentrates', [-1.5, 0.5, 0]));
    labels.push(L('Ascending limb (Henle)', 'Impermeable to water; NaCl actively pumped out → filtrate dilutes', [-1.0, 0.5, 0]));
    labels.push(L('Vasa recta (descending)', 'Takes up NaCl & loses water going down', [0.2, 0.5, 0]));
    labels.push(L('Vasa recta (ascending)', 'Returns NaCl to interstitium; carries water away — keeps gradient', [0.7, 0.5, 0]));
    labels.push(L('Collecting duct', 'Passes through gradient — water leaves (ADH), urea diffuses out', [1.9, 0, 0]));
    labels.push(L('Osmolarity gradient', '300 (cortex) → 1200 mOsm/L (inner medulla)', [-2.6, -2.0, -0.45]));
    labels.push(L('Urea recycling', 'From collecting duct into interstitium & thin ascending limb', [0.6, -1.6, 0.15]));
    return { g, labels };
  }
}));

/* ---------- Ch 17 Locomotion ---------- */
function sarcomere(contract = 0) {
  const g = H.grp(), labels = [];
  const half = 2.2 - contract * 0.55;
  for (const s of [-1, 1]) g.add(H.box(0.1, 1.6, 1.2, C.purple, [s * half, 0, 0], null, { e: 0.6 }));
  g.add(H.box(0.04, 1.4, 1.0, C.yellow, [0, 0, 0], null, { e: 0.6 }));
  // thick filaments (myosin) 3 rows
  for (let k = -1; k <= 1; k++) for (let z = -1; z <= 1; z += 2) { g.add(H.rod([-1.3, k * 0.45, z * 0.3], [1.3, k * 0.45, z * 0.3], 0.07, C.red)); for (let i = 0; i < 8; i++) { const x = -1.2 + i * 0.34; if (Math.abs(x) < 0.25) continue; g.add(H.rod([x, k * 0.45, z * 0.3], [x + (x > 0 ? 0.1 : -0.1), k * 0.45 + 0.16, z * 0.3 + 0.05], 0.025, C.orange, { seg: 5 })); } }
  // thin filaments (actin) from Z-lines into A band
  for (let k = -1.5; k <= 1.5; k += 1) for (let z = -1; z <= 1; z += 2) for (const s of [-1, 1]) g.add(H.rod([s * half, k * 0.45, z * 0.3], [s * (half - (1.55 + contract * 0.0)), k * 0.45, z * 0.3], 0.04, C.cyan));
  const hz = half - 1.55;
  labels.push(L('Z line (Z disc)', 'Boundary of sarcomere; thin filaments attach here', [half, 0.85, 0]));
  labels.push(L('Sarcomere', 'Functional unit — Z line to Z line', [0, -1.0, 0]));
  labels.push(L('A band (dark, anisotropic)', 'Length of thick myosin filaments — constant during contraction', [0.9, 0.7, 0.3]));
  labels.push(L('I band (light, isotropic)', 'Only thin actin filaments — shortens during contraction', [(half + 1.3) / 2, 0.3, 0.3]));
  labels.push(L('H zone', 'Central part of A band with only myosin — shortens/disappears', [hz > 0.15 ? hz / 2 : 0.08, -0.6, 0.3]));
  labels.push(L('M line', 'Centre of sarcomere holding thick filaments', [0, 0.5, 0]));
  labels.push(L('Thick filament (myosin)', 'Polymerised meromyosin with globular heads (cross bridges)', [-0.8, 0.45, -0.3]));
  labels.push(L('Thin filament (actin)', 'F-actin + tropomyosin + troponin', [-(half - 0.5), -0.68, 0.3]));
  labels.push(L('Cross bridges (myosin heads)', 'ATPase; bind actin during contraction', [0.68 + 0.1, 0.61, 0.35]));
  return { g, labels };
}
function actinFil() {
  const g = H.grp(), labels = [];
  for (const ph of [0, PI]) { const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([-2.8 + t * 5.6, 0.16 * Math.sin(t * 4 * TAU + ph), 0.16 * Math.cos(t * 4 * TAU + ph)]); } pts.forEach((p, i) => { if (i % 2 === 0) g.add(H.sphere(0.14, ph === 0 ? C.cyan : C.teal, p, { seg: 10 })); }); }
  for (const ph of [0, PI]) { const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([-2.8 + t * 5.6, 0.28 * Math.sin(t * 4 * TAU + ph + 1.5), 0.28 * Math.cos(t * 4 * TAU + ph + 1.5)]); } g.add(H.tube(pts, 0.035, C.orange, { seg: 120 })); }
  for (let i = 0; i < 4; i++) { const x = -2.1 + i * 1.4; g.add(H.sphere(0.16, C.pink, [x, 0.36, 0.1], { e: 0.5 })); g.add(H.sphere(0.12, C.purple, [x + 0.18, 0.3, -0.12], { e: 0.5 })); g.add(H.sphere(0.12, C.red, [x - 0.15, 0.42, -0.1], { e: 0.5 })); }
  labels.push(L('F-actin (2 helical strands)', 'Polymer of G-actin monomers, coiled around each other', [-1.5, 0.16, 0.16]));
  labels.push(L('G-actin monomer', 'Globular subunit', [0.5, -0.16, 0.16]));
  labels.push(L('Tropomyosin (2 filaments)', 'Runs along the F-actin grooves; masks myosin-binding sites at rest', [1.5, 0.28, 0]));
  labels.push(L('Troponin complex', 'At regular intervals on tropomyosin; binds Ca²⁺ to expose active sites', [0.7, 0.36, 0.1]));
  return { g, labels, note: 'Thin filament = 2 F-actin + 2 tropomyosin + troponin. Ca²⁺ binds troponin → tropomyosin shifts → active sites on actin exposed.' };
}
function myosinFil() {
  const g = H.grp(), labels = [];
  g.add(H.rod([-2.8, 0, 0], [2.8, 0, 0], 0.12, C.red));
  for (let i = 0; i < 14; i++) { const x = -2.5 + i * 0.38; if (Math.abs(x) < 0.35) continue; const a = i * 1.2; const d = V3(0, Math.cos(a), Math.sin(a)); const base = V3(x, 0, 0).add(d.clone().multiplyScalar(0.12)); const mid = base.clone().add(d.clone().multiplyScalar(0.28)).add(V3(x > 0 ? 0.12 : -0.12, 0, 0)); g.add(H.rod(base, mid, 0.035, C.orange)); g.add(H.ell(0.14, 0.1, 0.1, C.yellow, mid.clone().add(d.clone().multiplyScalar(0.12)).toArray(), { e: 0.5 })); }
  g.add(H.box(0.05, 0.5, 0.5, C.white, [0, 0, 0], null, { op: 0.5 }));
  labels.push(L('Thick filament', 'Polymer of many meromyosin units', [-1.5, -0.15, 0]));
  labels.push(L('Light meromyosin (LMM) — tail', 'Rod-like; forms the filament backbone', [1.2, 0, 0.1]));
  labels.push(L('Heavy meromyosin (HMM) — head + arm', 'Projects outward as cross bridge (S1 head + S2 arm)', [-0.98, 0.28, 0]));
  labels.push(L('Globular head', 'Active ATPase; has actin-binding site & ATP-binding site', [1.0, 0.45, 0.2]));
  labels.push(L('M line region (bare zone)', 'No heads at the centre', [0, 0.3, 0]));
  return { g, labels, note: 'Myosin = meromyosin units: heavy (globular head + short arm = cross bridge) & light (tail). Head has ATPase and actin-binding sites.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-17-2', unit: U5, ch: 'Ch 17 — Locomotion and Movement', fig: 'Fig 17.2', title: 'Sarcomere, actin & myosin filaments',
  desc: 'A muscle fibre (multinucleate, syncytium) contains myofibrils with alternating dark A and light I bands. Each sarcomere (Z line to Z line) has thick myosin and thin actin filaments; sarcoplasmic reticulum stores Ca²⁺.',
  points: ['Muscle → fascicles → fibres (sarcolemma, sarcoplasm) → myofibrils → sarcomeres.', 'I band bisected by Z line; A band has M line in centre; H zone = A band region without actin.', 'Thin filament: 2 F-actin, 2 tropomyosin, troponin. Thick: meromyosin (HMM head + LMM tail).', 'Red fibres: myoglobin-rich, many mitochondria (aerobic); white fibres: less myoglobin, anaerobic.'],
  variants: [{ name: 'Sarcomere', build: () => sarcomere(0) }, { name: 'Actin filament', build: actinFil }, { name: 'Myosin filament', build: myosinFil }]
}));

reg(Object.assign({}, B11, {
  id: 'b11-17-3', unit: U5, ch: 'Ch 17 — Locomotion and Movement', fig: 'Fig 17.3', title: 'Sliding filament theory',
  desc: 'Contraction occurs by sliding of thin filaments over thick filaments: myosin heads bind actin (cross bridges), pull actin toward the M line (power stroke), and the sarcomere shortens — A band constant, I band & H zone shorten.',
  points: ['Signal: motor neuron → neuromuscular junction → acetylcholine → action potential → Ca²⁺ released from sarcoplasmic reticulum.', 'Ca²⁺ binds troponin → tropomyosin shifts → active sites on actin exposed → myosin head (with ADP + Pi) binds.', 'Power stroke: ADP + Pi released; new ATP binds → cross bridge breaks; ATP hydrolysed → head cocked again.', 'Relaxation: Ca²⁺ pumped back into SR; masking of active sites; rigor mortis when ATP is absent.'],
  slide: 'Contract',
  build() {
    const res = sarcomere(0);
    const g = res.g;
    // tag movable parts: Z lines & actins; we rebuild positions on slide by scaling x of a group
    const rebuild = { t: 0 };
    const zl = g.children.filter(c => c.material && c.material.color && c.material.color.getHexString() === new THREE.Color(C.purple).getHexString());
    const act = g.children.filter(c => c.material && c.material.color && c.material.color.getHexString() === new THREE.Color(C.cyan).getHexString());
    zl.forEach(m => { m.userData.bx = m.position.x; }); act.forEach(m => { m.userData.bx = m.position.x; });
    g.add(H.text('Ca²⁺ → troponin', { size: 0.16, pos: [0, 1.4, 0], color: C.yellow })); g.add(H.arrow([-2.0, -1.2, 0.5], [-1.4, -1.2, 0.5], C.yellow, { r: 0.02 })); g.add(H.arrow([2.0, -1.2, 0.5], [1.4, -1.2, 0.5], C.yellow, { r: 0.02 }));
    const slide = t => { const k = 1 - 0.25 * t; zl.forEach(m => m.position.x = m.userData.bx * k); act.forEach(m => m.position.x = m.userData.bx * k); res.labels.forEach(l => { if (l._bx === undefined) l._bx = l.a[0]; if (l.t.startsWith('Z line') || l.t.startsWith('I band') || l.t.startsWith('Thin')) l.a[0] = l._bx * k; if (l.t.startsWith('H zone')) l.a[0] = l._bx * (1 - t * 0.9); }); };
    res.labels.push(L('Direction of actin sliding', 'Thin filaments pulled toward M line by cross-bridge cycling', [-1.7, -1.2, 0.5]));
    res.labels.push(L('Ca²⁺ release from SR', 'Binds troponin C — starts the cycle', [0, 1.4, 0]));
    return { g, labels: res.labels, slide };
  }
}));

/* skeleton */
function skSkull() {
  const g = H.grp(), labels = [];
  g.add(H.ell(1.2, 1.35, 1.4, C.bone, [0, 0.6, 0]));
  g.add(H.box(1.2, 0.9, 1.0, C.bone, [0, -0.7, 0.55]));
  g.add(H.box(1.1, 0.35, 0.8, '#e5decb', [0, -1.35, 0.6]));
  for (const s of [-1, 1]) { g.add(H.sphere(0.32, C.ink, [s * 0.42, 0.1, 1.15])); g.add(H.torus(0.34, 0.06, C.bone, [s * 0.42, 0.1, 1.15], null, { op: 0.9 })); }
  g.add(H.tube([[0, 0.2, 1.3], [0, -0.3, 1.5]], 0.1, C.bone));
  for (let i = -3; i <= 3; i++) g.add(H.box(0.12, 0.2, 0.08, C.white, [i * 0.15, -1.15, 1.02]));
  g.add(H.line([[-1.2, 0.9, 0], [1.2, 0.9, 0]], C.grey, { dashed: true })); g.add(H.line([[0, 1.9, 0], [0, 0.4, 1.35]], C.grey, { dashed: true }));
  g.add(H.torus(0.32, 0.04, C.bone, [0, -2.0, 0.4], [PI / 2, 0, 0], { arc: PI, rot: [PI / 2, 0, -PI / 2] }));
  labels.push(L('Cranial bones (8)', 'Frontal, 2 parietal, 2 temporal, occipital, sphenoid, ethmoid — protect brain', [0, 1.6, 0.5]));
  labels.push(L('Facial bones (14)', 'Form the front part; maxilla, zygomatic, nasal, mandible etc.', [0.7, -0.5, 0.9]));
  labels.push(L('Mandible (lower jaw)', 'Only movable skull bone', [0, -1.35, 1.0]));
  labels.push(L('Orbit', 'Eye socket', [0.42, 0.1, 1.45]));
  labels.push(L('Sutures', 'Immovable fibrous joints between skull bones', [0, 1.9, 0]));
  labels.push(L('Hyoid bone', 'U-shaped, at base of buccal cavity — counted with skull (22 + 1)', [0, -2.0, 0.7]));
  labels.push(L('Occipital condyles', 'Articulate with atlas — dicondylic skull', [0, -0.5, -1.0]));
  return { g, labels, note: 'Skull: 22 bones (8 cranial + 14 facial) + hyoid + 6 ear ossicles (malleus, incus, stapes ×2) = 29.' };
}
function skRibcage() {
  const g = H.grp(), labels = [];
  g.add(H.box(0.4, 2.6, 0.2, C.bone, [0, 0.4, 1.1]));
  g.add(H.rod([0, 2.6, 0], [0, -3.0, 0], 0.15, '#e5decb'));
  for (let i = 0; i < 24; i++) g.add(H.box(0.4, 0.14, 0.4, C.bone, [0, 2.5 - i * 0.23, 0]));
  for (let i = 0; i < 12; i++) { const y = 1.9 - i * 0.38; const R = 1.0 + 0.6 * Math.sin(i / 12 * PI) + 0.2; const true_ = i < 7, floating = i >= 10; for (const s of [-1, 1]) { const pts = []; for (let k = 0; k <= 12; k++) { const a = k / 12 * (floating ? 0.55 : true_ ? 1.0 : 0.85) * PI; pts.push([s * R * Math.sin(a), y - 0.35 * k / 12, -R * Math.cos(a) + R * 0.1]); } g.add(H.tube(pts, 0.05, floating ? C.amber : true_ ? C.bone : '#e5decb', { seg: 24 })); if (true_) g.add(H.tube([pts[12], [s * 0.2, y - 0.35, 1.1]], 0.04, C.cyan, { op: 0.8 })); else if (!floating) g.add(H.tube([pts[12], [s * 0.35, y - 0.55, 0.95]], 0.035, C.cyan, { op: 0.8 })); } }
  labels.push(L('Sternum (breast bone)', 'Flat bone in mid-ventral thorax', [0, 0.4, 1.2]));
  labels.push(L('True ribs (1–7)', 'Attach directly to sternum by hyaline cartilage', [1.5, 1.5, 0]));
  labels.push(L('False ribs (8–10)', 'Join 7th rib cartilage, not sternum directly', [1.55, -1.0, 0]));
  labels.push(L('Floating ribs (11–12)', 'No ventral attachment', [-0.9, -2.0, -0.9]));
  labels.push(L('Thoracic vertebrae (12)', 'Ribs articulate dorsally — bicephalic ribs', [0, 0.5, -0.2]));
  labels.push(L('Costal cartilage', 'Hyaline cartilage connecting rib to sternum', [0.3, 1.1, 1.0]));
  labels.push(L('Rib cage', '12 pairs of ribs + sternum + thoracic vertebrae', [-1.7, 0.6, 0]));
  return { g, labels, note: 'Ribs: 12 pairs; thin flat bones; 7 true, 3 false, 2 floating. Each rib has two articular surfaces (bicephalic).' };
}
function skPectoral() {
  const g = H.grp(), labels = [];
  g.add(H.tube([[-2.2, 1.2, 0.2], [-1.2, 1.4, 0.7], [0, 1.25, 0.9]], 0.09, C.bone));
  g.add(H.extrude([[0, 0], [1.3, 0.3], [1.6, -0.4], [1.0, -2.0], [0.3, -1.7], [-0.2, -0.8]], 0.08, C.bone, [-2.9, 0.9, -0.6], [0, 0.35, 0]));
  g.add(H.tube([[-2.6, 1.0, -0.4], [-2.2, 1.35, -0.1], [-1.7, 1.4, 0.1]], 0.08, C.bone));
  g.add(H.tube([[-2.3, 0.5, -0.2], [-1.9, 0.9, 0.2], [-1.8, 1.1, 0.35]], 0.07, C.bone));
  g.add(H.ring(0.05, 0.32, C.ink, [-1.75, 0.45, 0.1], [0, PI / 2 + 0.4, 0], { op: 0.8 }));
  g.add(H.sphere(0.35, '#e5decb', [-1.5, 0.35, 0.25])); g.add(H.rod([-1.5, 0.35, 0.25], [-1.35, -2.6, 0.3], 0.13, '#e5decb'));
  g.add(H.box(0.5, 2.6, 0.25, C.bone, [0.8, 0.0, 0.9]));
  labels.push(L('Clavicle (collar bone)', 'Long slender bone with two curvatures', [-1.2, 1.4, 0.7]));
  labels.push(L('Scapula (shoulder blade)', 'Large triangular flat bone on dorsal thorax (2nd–7th ribs)', [-2.4, 0.0, -0.7]));
  labels.push(L('Spine of scapula', 'Dorsal ridge ending in acromion', [-2.2, 1.35, -0.1]));
  labels.push(L('Acromion process', 'Flat expanded end of spine; articulates with clavicle', [-1.7, 1.4, 0.1]));
  labels.push(L('Coracoid process', 'Hook-like projection below acromion', [-1.8, 1.1, 0.35]));
  labels.push(L('Glenoid cavity', 'Depression articulating with head of humerus (ball & socket)', [-1.75, 0.45, 0.1]));
  labels.push(L('Humerus (head)', 'Upper arm bone fits into glenoid cavity', [-1.5, 0.35, 0.25]));
  labels.push(L('Sternum', 'Clavicle attaches ventrally here', [0.8, 0, 1.0]));
  return { g, labels, note: 'Pectoral girdle: each half = clavicle + scapula. Forelimb: humerus, radius, ulna, 8 carpals, 5 metacarpals, 14 phalanges = 30 bones.' };
}
function skPelvic() {
  const g = H.grp(), labels = [];
  for (const s of [-1, 1]) { const b = H.grp([], [s * 0.9, 0, 0], [0, s * 0.4, 0]); b.add(H.extrude([[0, 0], [0.5, 1.6], [1.3, 2.0], [1.7, 1.4], [1.1, 0.6], [0.8, 0]], 0.18, C.bone, [0, 0, 0], [0, 0, 0])); b.add(H.tube([[0.35, -0.1, 0], [0.1, -0.8, 0.1], [0.6, -1.3, 0.1]], 0.12, '#e5decb')); b.add(H.tube([[0.75, -0.1, 0.1], [1.0, -0.7, 0.2], [0.6, -1.3, 0.1]], 0.1, '#e5decb')); b.add(H.ring(0.06, 0.3, C.ink, [0.55, -0.05, 0.12], null, { op: 0.8 })); b.add(H.sphere(0.32, '#e5decb', [s > 0 ? 0.55 : 0.55, -0.05, 0.4])); g.add(b); }
  g.add(H.cone(0.55, 1.6, C.bone, [0, 0.6, -0.9], [PI, 0, 0], { seg: 6 })); g.add(H.rod([0, -0.2, -0.9], [0, -0.9, -0.7], 0.08, '#e5decb'));
  g.add(H.box(0.14, 0.5, 0.2, C.white, [0, -1.2, 1.1]));
  labels.push(L('Ilium', 'Large upper flared part (hip bone)', [1.6, 1.6, 0]));
  labels.push(L('Ischium', 'Lower posterior part — sits on it', [0.9, -0.8, 0.1]));
  labels.push(L('Pubis', 'Anterior part; two pubic bones meet at pubic symphysis', [1.5, -0.7, 0.3]));
  labels.push(L('Acetabulum', 'Cup-shaped cavity formed by all three bones — head of femur fits', [1.35, -0.05, 0.3]));
  labels.push(L('Femur (head)', 'Ball & socket hip joint', [1.35, -0.05, 0.7]));
  labels.push(L('Sacrum (5 fused)', 'Vertebral column joins girdle here', [0, 0.6, -0.9]));
  labels.push(L('Coccyx (4 fused)', 'Tail bone', [0, -0.9, -0.7]));
  labels.push(L('Pubic symphysis', 'Fibrous cartilage joint between pubic bones', [0, -1.2, 1.1]));
  labels.push(L('Coxal bone (each half)', 'Ilium + ischium + pubis fused', [-1.6, 1.0, 0]));
  return { g, labels, note: 'Pelvic girdle: two coxal bones each of ilium, ischium, pubis. Hind limb: femur (longest), tibia, fibula, patella, 7 tarsals, 5 metatarsals, 14 phalanges = 30.' };
}
function skVertebral() {
  const g = H.grp(), labels = [];
  const regions = [[7, C.cyan, 0.2], [12, C.bone, 0.24], [5, C.amber, 0.32]];
  let y = 3.0; const pos = {};
  regions.forEach(([n, col, r], ri) => { for (let i = 0; i < n; i++) { g.add(H.cyl(r, r, 0.14, col, [0.15 * Math.sin(y * 0.8), y, 0], null, { seg: 12 })); g.add(H.box(0.12, 0.08, 0.35, '#e5decb', [0.15 * Math.sin(y * 0.8), y, -r - 0.15])); g.add(H.cyl(r * 0.9, r * 0.9, 0.06, C.white, [0.15 * Math.sin(y * 0.8), y - 0.1, 0], null, { seg: 12, op: 0.6 })); if (i === 0) pos[ri] = [0.15 * Math.sin(y * 0.8), y, 0]; y -= 0.21 + ri * 0.03; } });
  g.add(H.cone(0.45, 0.9, C.bone, [0.1, y - 0.3, 0], [PI, 0, 0], { seg: 8 })); pos.s = [0.1, y - 0.3, 0]; g.add(H.rod([0.1, y - 0.8, 0], [0.15, y - 1.3, 0.1], 0.07, '#e5decb')); pos.c = [0.15, y - 1.2, 0.05];
  labels.push(L('Cervical (7)', 'Neck; C1 atlas (holds skull), C2 axis', pos[0]));
  labels.push(L('Thoracic (12)', 'Articulate with ribs', pos[1]));
  labels.push(L('Lumbar (5)', 'Largest; bear body weight', pos[2]));
  labels.push(L('Sacral (5 fused = sacrum)', 'Joins pelvic girdle', pos.s));
  labels.push(L('Coccygeal (4 fused = coccyx)', 'Tail bone', pos.c));
  labels.push(L('Intervertebral disc', 'Fibrocartilage between centra — cartilaginous joint', [0.15 * Math.sin(2.5 * 0.8), 2.4, 0]));
  labels.push(L('Neural canal', 'Central canal through which spinal cord passes', [0.15 * Math.sin(1.0 * 0.8), 1.0, 0]));
  labels.push(L('Vertebral formula', '7 + 12 + 5 + 1 + 1 = 26 bones (33 vertebrae)', [-1.2, 0, 0]));
  return { g, labels, note: 'Vertebral column: 26 bones — C7, T12, L5, sacrum (5 fused), coccyx (4 fused); protects spinal cord, supports head, attaches ribs & girdle.' };
}
reg(Object.assign({}, B11, {
  id: 'b11-17-4', unit: U5, ch: 'Ch 17 — Locomotion and Movement', fig: 'Fig 17.4–17.6', title: 'Human skeleton: skull, rib cage, girdles, vertebral column',
  desc: 'The human skeleton has 206 bones: axial (80 — skull, vertebral column, sternum, ribs) and appendicular (126 — limbs & girdles).',
  points: ['Skull 22 + hyoid 1 + ear ossicles 6 = 29 bones; dicondylic.', 'Vertebral column 26; rib cage: 12 pairs ribs + sternum.', 'Each limb 30 bones; pectoral girdle (clavicle + scapula) & pelvic girdle (ilium + ischium + pubis).', 'Joints: fibrous (sutures), cartilaginous (intervertebral), synovial (ball & socket, hinge, pivot, gliding, saddle).'],
  variants: [{ name: 'Skull', build: skSkull }, { name: 'Rib cage', build: skRibcage }, { name: 'Pectoral girdle', build: skPectoral }, { name: 'Pelvic girdle', build: skPelvic }, { name: 'Vertebral column', build: skVertebral }]
}));

/* ---------- Ch 18 Neural Control ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-18-1', unit: U5, ch: 'Ch 18 — Neural Control and Coordination', fig: 'Fig 18.1', title: 'Structure of a neuron',
  desc: 'A neuron has a cell body (cyton) with Nissl granules, short branched dendrites, and a single long axon ending in synaptic knobs. Myelinated axons (Schwann cells) show nodes of Ranvier; found in spinal & cranial nerves.',
  points: ['Dendrites transmit impulses TOWARDS the cell body; axon carries them AWAY.', 'Myelinated fibres (Schwann cells form myelin sheath) in spinal/cranial nerves; non-myelinated in autonomic & somatic nerves.', 'Types: multipolar (cerebral cortex), bipolar (retina), unipolar (embryonic stage).', 'Resting potential: axon membrane more permeable to K⁺; Na⁺/K⁺ pump (3 Na⁺ out, 2 K⁺ in); polarised.'],
  build() {
    const g = H.grp(), labels = [];
    const body = [-2.4, 0.2, 0];
    g.add(H.sphere(0.55, C.amber, body, { sx: 1.15, sy: 1, sz: 0.9 }));
    g.add(H.sphere(0.22, C.nuc, body)); g.add(H.sphere(0.08, C.pink, [body[0] + 0.08, body[1] + 0.06, 0.15]));
    const rng = H.rng(23); for (let i = 0; i < 20; i++) { const a = rng() * TAU, b = rng() * PI; g.add(H.sphere(0.045, C.purple, [body[0] + 0.42 * Math.sin(b) * Math.cos(a), body[1] + 0.4 * Math.cos(b), 0.35 * Math.sin(b) * Math.sin(a)], { seg: 6 })); }
    // dendrites
    const dend = (dir, d, p, len, r) => { const e = p.clone().add(dir.clone().multiplyScalar(len)); g.add(H.rod(p, e, r, C.amber)); if (d >= 2) return; const a = Math.atan2(dir.y, dir.x); dend(V3(Math.cos(a + 0.6), Math.sin(a + 0.6), 0.2).normalize(), d + 1, e, len * 0.65, r * 0.6); dend(V3(Math.cos(a - 0.6), Math.sin(a - 0.6), -0.2).normalize(), d + 1, e, len * 0.65, r * 0.6); };
    [[-1, 0.4], [-0.6, 1], [0, 1], [-1, -0.5], [-0.4, -1]].forEach(([x, y]) => dend(V3(x, y, 0).normalize(), 0, V3(...body).add(V3(x, y, 0).normalize().multiplyScalar(0.5)), 0.7, 0.05));
    // axon hillock + axon
    g.add(H.cone(0.22, 0.4, C.amber, [body[0] + 0.7, body[1], 0], [0, 0, -PI / 2]));
    g.add(H.rod([body[0] + 0.85, body[1], 0], [2.2, body[1], 0], 0.06, C.yellow));
    for (let i = 0; i < 5; i++) { const x = -1.2 + i * 0.75; g.add(H.capsule(0.17, 0.5, C.white, [x, body[1], 0], [0, 0, PI / 2], { op: 0.85 })); g.add(H.sphere(0.06, C.pink, [x, body[1] + 0.18, 0.05], { seg: 8 })); }
    // terminals
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.45; g.add(H.tube([[2.2, body[1], 0], [2.6, body[1] + 0.5 * Math.sin(a), 0.2 * Math.cos(a)], [3.0, body[1] + 0.9 * Math.sin(a), 0.3 * Math.cos(a)]], 0.03, C.yellow)); g.add(H.sphere(0.12, C.orange, [3.0, body[1] + 0.9 * Math.sin(a), 0.3 * Math.cos(a)], { e: 0.5 })); }
    g.add(H.arrow([-0.4, body[1] - 0.6, 0], [0.8, body[1] - 0.6, 0], C.cyan, { r: 0.02 })); g.add(H.text('impulse', { size: 0.14, pos: [0.2, body[1] - 0.8, 0], color: C.cyan }));
    labels.push(L('Cell body (cyton / soma)', 'Cytoplasm with typical organelles + Nissl granules', body));
    labels.push(L('Nucleus', 'With prominent nucleolus', [body[0], body[1] + 0.22, 0]));
    labels.push(L("Nissl's granules", 'Granular bodies (RER + ribosomes) in cyton & dendrites', [body[0] - 0.3, body[1] + 0.35, 0.3]));
    labels.push(L('Dendrites', 'Short, branched; carry impulses toward cell body', [body[0] - 1.1, body[1] + 0.9, 0]));
    labels.push(L('Axon hillock', 'Cone-shaped origin of axon; impulse generated here', [body[0] + 0.7, body[1] + 0.2, 0]));
    labels.push(L('Axon', 'Single long fibre carrying impulse away from cyton', [0.3, body[1], 0]));
    labels.push(L('Myelin sheath (Schwann cell)', 'Insulating lipid layers — saltatory conduction', [-0.45, body[1] + 0.17, 0]));
    labels.push(L('Node of Ranvier', 'Gap between adjacent myelin sheaths', [-0.825, body[1] - 0.06, 0]));
    labels.push(L('Schwann cell nucleus', 'Outside the myelin sheath (neurilemma)', [0.3, body[1] + 0.18, 0.05]));
    labels.push(L('Axon terminals — synaptic knobs', 'Bulb-like; contain synaptic vesicles with neurotransmitters', [3.0, body[1] + 0.9 * Math.sin(0.675), 0.3 * Math.cos(0.675)]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-18-2', unit: U5, ch: 'Ch 18 — Neural Control and Coordination', fig: 'Fig 18.2', title: 'Impulse transmission across a chemical synapse',
  desc: 'At a chemical synapse the pre- and post-synaptic membranes are separated by a synaptic cleft. The arriving impulse lets Ca²⁺ enter; vesicles fuse and release neurotransmitter into the cleft; it binds post-synaptic receptors, opening ion channels → new potential.',
  points: ['Electrical synapse: membranes in close proximity; current flows directly; faster; rare.', 'Chemical synapse: neurotransmitter (e.g. acetylcholine) released by exocytosis of synaptic vesicles on Ca²⁺ influx.', 'New potential may be excitatory (EPSP) or inhibitory (IPSP).', 'Conduction: axon depolarises as Na⁺ rushes in (action potential), repolarises as K⁺ flows out.'],
  slide: 'Release',
  build() {
    const g = H.grp(), labels = [];
    // presynaptic knob
    g.add(H.rod([-3.2, 0, 0], [-1.6, 0, 0], 0.22, C.yellow));
    g.add(H.sphere(0.95, C.amber, [-0.8, 0, 0], { phi: PI * 1.5, phiStart: PI * 0.75, op: 0.4, side: THREE.DoubleSide, dw: false }));
    g.add(H.sphere(0.9, C.amber, [-0.8, 0, 0], { op: 0.12, dw: false }));
    // mitochondria
    g.add(H.capsule(0.12, 0.35, C.orange, [-1.1, 0.45, 0.2], [0, 0, 0.5], { op: 0.9 }));
    // vesicles
    const ves = [];
    for (let i = 0; i < 6; i++) { const p = [-0.75 + 0.25 * Math.cos(i), 0.15 * Math.sin(i * 1.5) - 0.1, 0.25 * Math.sin(i)]; const v = H.sphere(0.13, C.cyan, p, { op: 0.9 }); v.userData.bp = V3(...p); g.add(v); ves.push(v); for (let k = 0; k < 4; k++) g.add(H.sphere(0.03, C.pink, [p[0] + 0.06 * Math.cos(k * 1.6), p[1] + 0.06 * Math.sin(k * 1.6), p[2]], { seg: 5 })); }
    // cleft & postsynaptic
    g.add(H.sphere(1.3, C.teal, [1.8, 0, 0], { phi: PI, phiStart: PI * 0.5, op: 0.45, side: THREE.DoubleSide, dw: false }));
    // receptors on postsynaptic membrane
    const recs = []; for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.28; const p = [1.8 - 1.3 * Math.cos(a), 1.3 * Math.sin(a), 0]; g.add(H.box(0.12, 0.25, 0.25, C.purple, p, [0, 0, 0], { e: 0.5 })); recs.push(p); }
    // neurotransmitter molecules (moving)
    const nt = []; for (let i = 0; i < 12; i++) { const m = H.sphere(0.04, C.pink, [0, 0, 0], { seg: 6, e: 0.8 }); m.visible = false; g.add(m); nt.push(m); }
    // Ca2+ arrows
    g.add(H.arrow([-0.3, 1.2, 0.2], [-0.5, 0.75, 0.2], C.lime, { r: 0.015, head: 0.1 })); g.add(H.text('Ca²⁺', { size: 0.16, pos: [-0.2, 1.35, 0.2], color: C.lime }));
    g.add(H.arrow([-3.0, 0.45, 0], [-2.2, 0.45, 0], C.white, { r: 0.015, head: 0.1 })); g.add(H.text('impulse', { size: 0.14, pos: [-2.6, 0.65, 0], color: C.white }));
    g.add(H.arrow([2.3, 0.45, 0], [3.0, 0.45, 0], C.white, { r: 0.015, head: 0.1, op: 0.5 }));
    const slide = t => { ves.forEach((v, i) => { const target = V3(0.05, v.userData.bp.y * 0.6, v.userData.bp.z * 0.6); v.position.copy(v.userData.bp).lerp(target, Math.min(1, t * 1.6)); v.material = H.mat(C.cyan, { op: t > 0.6 ? 0.9 - (t - 0.6) * 2 : 0.9 }); }); nt.forEach((m, i) => { const show = t > 0.45; m.visible = show; if (show) { const u = clamp((t - 0.45) / 0.55, 0, 1); const r = recs[i % 4]; m.position.set(lerp(0.15, r[0] - 0.1, u), lerp((i % 3 - 1) * 0.2, r[1], u), lerp((i % 2 - 0.5) * 0.3, 0, u)); } }); };
    labels.push(L('Axon terminal (pre-synaptic neuron)', 'Impulse arrives here', [-2.4, 0, 0.22]));
    labels.push(L('Synaptic knob (bouton)', 'Bulb-like ending with vesicles & mitochondria', [-1.0, 0.7, 0.4]));
    labels.push(L('Synaptic vesicles', 'Contain neurotransmitter (e.g. acetylcholine)', [-0.75 + 0.25, -0.1, 0.25]));
    labels.push(L('Ca²⁺ influx', 'Triggered by impulse; causes vesicle fusion & exocytosis', [-0.2, 1.35, 0.2]));
    labels.push(L('Pre-synaptic membrane', 'Vesicles fuse here', [0.12, 0, 0]));
    labels.push(L('Synaptic cleft', 'Fluid-filled gap between the two neurons', [0.35, -0.5, 0]));
    labels.push(L('Neurotransmitter', 'Diffuses across cleft', [0.3, 0.2, 0]));
    labels.push(L('Receptors on post-synaptic membrane', 'Binding opens ion channels → new potential (excitatory or inhibitory)', recs[0]));
    labels.push(L('Post-synaptic neuron (dendrite)', 'Impulse continues', [2.5, -0.5, 0]));
    return { g, labels, slide };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-18-3', unit: U5, ch: 'Ch 18 — Neural Control and Coordination', fig: 'Fig 18.3', title: 'Sagittal section of the human brain',
  desc: 'The brain (central neural system) is protected by the skull and three meninges (dura, arachnoid, pia mater). Forebrain = cerebrum, thalamus, hypothalamus; midbrain = cerebral peduncles + corpora quadrigemina; hindbrain = pons, cerebellum, medulla.',
  points: ['Cerebrum: longitudinal fissure into two hemispheres joined by corpus callosum; grey matter cortex (gyri/sulci) with association areas.', 'Hypothalamus: body temperature, hunger, thirst; neurosecretory cells; connected to pituitary. Limbic system (amygdala, hippocampus) — emotions, sexual behaviour.', 'Midbrain: cerebral aqueduct; 4 corpora quadrigemina (dorsal). Brain stem = midbrain + pons + medulla.', 'Medulla: respiration, cardiovascular reflexes, gastric secretions. Cerebellum: convoluted; balance & posture.'],
  build() {
    const g = H.grp(), labels = [];
    // cerebrum half
    const cer = H.ell(2.1, 1.55, 1.7, C.pink, [0, 0.5, 0], { phi: PI, phiStart: PI, op: 0.85, side: THREE.DoubleSide }); g.add(cer);
    // gyri as tubes on the cut face
    for (let i = 0; i < 8; i++) { const a = -0.3 + i * 0.42; const pts = []; for (let k = 0; k <= 8; k++) { const r = 1.35 + 0.12 * Math.sin(k * 1.8 + i); pts.push([2.0 * Math.cos(a + k * 0.05) * (r / 1.5), 0.5 + 1.45 * Math.sin(a + k * 0.05) * (r / 1.5), 0.02]); } g.add(H.tube(pts, 0.05, '#fda4af', { seg: 16 })); }
    g.add(H.torus(0.85, 0.09, C.white, [0, 0.55, 0.02], null, { arc: PI, tseg: 30 }));
    g.add(H.ell(0.45, 0.35, 0.3, C.purple, [0.1, 0.2, 0.05]));
    g.add(H.ell(0.35, 0.22, 0.25, C.orange, [0.2, -0.25, 0.05]));
    g.add(H.rod([0.35, -0.4, 0.05], [0.55, -0.85, 0.05], 0.06, C.yellow)); g.add(H.sphere(0.2, C.yellow, [0.6, -0.95, 0.05]));
    g.add(H.sphere(0.12, C.amber, [-0.6, 0.1, 0.05]));
    g.add(H.cyl(0.3, 0.35, 0.5, C.teal, [-0.2, -0.5, 0.05], [0, 0, 0.3]));
    g.add(H.ell(0.42, 0.35, 0.4, C.cyan, [-0.55, -0.95, 0.05]));
    g.add(H.lathe([[0, -0.4], [0.32, -0.3], [0.3, 0.3], [0, 0.4]], C.blue, [-0.75, -1.65, 0.05], [0, 0, 0.25], { seg: 16 }));
    g.add(H.rod([-0.85, -2.05, 0.05], [-1.0, -3.0, 0.05], 0.18, C.blue));
    const cb = H.ell(1.0, 0.75, 0.9, C.lime, [-1.7, -0.9, -0.2], { phi: PI, phiStart: PI, op: 0.9, side: THREE.DoubleSide }); g.add(cb);
    for (let i = 0; i < 6; i++) g.add(H.tube([[-2.5 + i * 0.3, -1.4, 0.0], [-2.4 + i * 0.3, -0.9 + 0.2 * Math.sin(i), 0.0], [-2.3 + i * 0.3, -0.4, 0.0]], 0.03, C.dgreen));
    labels.push(L('Cerebrum (cerebral cortex)', 'Largest part; grey matter outside with gyri & sulci; white matter (myelinated tracts) inside', [0.5, 1.5, 0.3]));
    labels.push(L('Corpus callosum', 'Tract of nerve fibres connecting the two hemispheres', [0, 1.4, 0.02]));
    labels.push(L('Thalamus', 'Major coordinating centre for sensory & motor signalling', [0.1, 0.2, 0.05]));
    labels.push(L('Hypothalamus', 'Temperature, hunger, thirst; neurohormones; below thalamus', [0.2, -0.25, 0.05]));
    labels.push(L('Pituitary gland', 'Hangs from hypothalamus by infundibulum (stalk)', [0.6, -0.95, 0.05]));
    labels.push(L('Pineal gland', 'Melatonin — circadian rhythm', [-0.6, 0.1, 0.05]));
    labels.push(L('Midbrain (cerebral aqueduct)', 'Between thalamus & pons; corpora quadrigemina dorsally', [-0.2, -0.5, 0.05]));
    labels.push(L('Pons', 'Fibre tracts connecting brain regions; breathing regulation', [-0.55, -0.95, 0.05]));
    labels.push(L('Cerebellum', 'Highly convoluted; balance, posture, coordination', [-1.9, -0.6, 0]));
    labels.push(L('Medulla oblongata', 'Respiration, heart & blood vessel control, gastric secretions', [-0.75, -1.65, 0.05]));
    labels.push(L('Spinal cord', 'Continues from medulla through foramen magnum', [-1.0, -3.0, 0.05]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B11, {
  id: 'b11-18-4', unit: U5, ch: 'Ch 18 — Neural Control and Coordination', fig: 'Fig 18.4', title: 'Reflex arc',
  desc: 'A reflex is an involuntary, rapid response to a peripheral stimulus. The pathway (reflex arc) = receptor → afferent (sensory) neuron → spinal cord (integration via interneuron) → efferent (motor) neuron → effector.',
  points: ['Afferent neuron enters via the dorsal root (cell body in dorsal root ganglion); efferent leaves via the ventral root.', 'Monosynaptic (knee jerk) vs polysynaptic (withdrawal) reflex — interneuron in grey matter.', 'Grey matter (butterfly-shaped, cell bodies) inside; white matter (myelinated tracts) outside in spinal cord.', 'Reflex action needs no brain involvement; brain is informed but response precedes awareness.'],
  build() {
    const g = H.grp(), labels = [];
    // spinal cord cross section
    g.add(H.cyl(1.1, 1.1, 0.8, C.white, [0, 0, 0], [PI / 2, 0, 0], { op: 0.5, seg: 32 }));
    g.add(H.extrude([[0, 0.6], [0.35, 0.75], [0.5, 0.35], [0.3, 0.1], [0.5, -0.4], [0.6, -0.7], [0.2, -0.65], [0, -0.45], [-0.2, -0.65], [-0.6, -0.7], [-0.5, -0.4], [-0.3, 0.1], [-0.5, 0.35], [-0.35, 0.75]], 0.82, C.grey, [0, 0, 0], null, { op: 0.95 }));
    g.add(H.cyl(0.05, 0.05, 0.85, C.ink, [0, 0, 0], [PI / 2, 0, 0], { seg: 8 }));
    // receptor (skin) & effector (muscle)
    g.add(H.box(0.5, 1.0, 0.4, C.skin, [3.4, 1.4, 0])); g.add(H.cone(0.06, 0.4, C.yellow, [3.4, 2.1, 0], [0, 0, 0])); g.add(H.text('stimulus', { size: 0.14, pos: [3.4, 2.5, 0], color: C.yellow }));
    g.add(H.capsule(0.28, 0.9, C.muscle, [3.4, -1.4, 0], [0, 0, 0.3]));
    // sensory neuron: receptor -> dorsal root ganglion -> dorsal horn
    g.add(H.tube([[3.2, 1.2, 0.1], [2.4, 1.3, 0.1], [1.6, 1.25, 0.1]], 0.05, C.blue));
    g.add(H.sphere(0.2, C.blue, [1.55, 1.25, 0.1])); g.add(H.torus(0.32, 0.06, C.grey, [1.5, 1.25, 0.1], null, { op: 0.6 }));
    g.add(H.tube([[1.4, 1.2, 0.1], [0.9, 1.0, 0.1], [0.5, 0.65, 0.1], [0.3, 0.45, 0.1]], 0.05, C.blue));
    // interneuron
    g.add(H.sphere(0.12, C.purple, [0.2, 0.0, 0.1])); g.add(H.tube([[0.3, 0.45, 0.1], [0.2, 0.15, 0.1]], 0.03, C.purple)); g.add(H.tube([[0.2, -0.12, 0.1], [0.3, -0.4, 0.1]], 0.03, C.purple));
    // motor neuron: ventral horn -> muscle
    g.add(H.sphere(0.15, C.red, [0.35, -0.5, 0.1]));
    g.add(H.tube([[0.5, -0.55, 0.1], [1.0, -0.9, 0.1], [1.8, -1.2, 0.1], [3.1, -1.3, 0.1]], 0.05, C.red));
    for (let i = 0; i < 3; i++) g.add(H.sphere(0.06, C.orange, [3.15 + i * 0.05, -1.3 + (i - 1) * 0.15, 0.1], { seg: 6 }));
    g.add(H.arrow([2.4, 1.5, 0.15], [1.9, 1.5, 0.15], C.white, { r: 0.012, head: 0.09 })); g.add(H.arrow([1.9, -1.45, 0.15], [2.5, -1.45, 0.15], C.white, { r: 0.012, head: 0.09 }));
    labels.push(L('Receptor (in skin)', 'Detects stimulus (e.g. heat, pin-prick)', [3.4, 1.4, 0.2]));
    labels.push(L('Afferent (sensory) neuron', 'Carries impulse to the spinal cord via dorsal root', [2.4, 1.3, 0.1]));
    labels.push(L('Dorsal root ganglion', 'Contains cell bodies of sensory neurons', [1.55, 1.25, 0.1]));
    labels.push(L('Dorsal horn (grey matter)', 'Sensory fibre enters here', [0.4, 0.55, 0.4]));
    labels.push(L('Interneuron', 'Connects sensory & motor neurons within grey matter (polysynaptic)', [0.2, 0.0, 0.1]));
    labels.push(L('Ventral horn — motor neuron cell body', 'Efferent neuron originates here', [0.35, -0.5, 0.1]));
    labels.push(L('Efferent (motor) neuron', 'Leaves via ventral root to effector', [1.8, -1.2, 0.1]));
    labels.push(L('Effector (muscle)', 'Contracts — response', [3.4, -1.4, 0.3]));
    labels.push(L('White matter', 'Outer myelinated tracts of spinal cord', [-0.9, 0.5, 0.4]));
    labels.push(L('Central canal', 'Contains cerebrospinal fluid', [0, 0, 0.45]));
    return { g, labels };
  }
}));

/* ---------- Ch 19 Chemical Coordination ---------- */
reg(Object.assign({}, B11, {
  id: 'b11-19-1', unit: U5, ch: 'Ch 19 — Chemical Coordination and Integration', fig: 'Fig 19.1', title: 'Endocrine glands in the human body',
  desc: 'Endocrine glands are ductless; their hormones (non-nutrient intercellular messengers in trace amounts) reach target organs by blood. The human endocrine system: pituitary, pineal, thyroid, parathyroid, adrenal, pancreas, gonads, thymus, plus hypothalamus and hormone-producing tissues.',
  points: ['Hypothalamus: releasing & inhibiting hormones (GnRH, somatostatin) → pituitary via portal circulation.', 'Pituitary: adenohypophysis (GH, PRL, TSH, ACTH, LH, FSH; MSH from pars intermedia) & neurohypophysis (oxytocin, vasopressin/ADH — made in hypothalamus).', 'Thyroid: T₃, T₄ (iodine), calcitonin. Parathyroid: PTH (↑Ca²⁺). Thymus: thymosins. Adrenal: cortex (glucocorticoids, mineralocorticoids, androgens) & medulla (adrenaline, noradrenaline).', 'Pancreas: insulin (β), glucagon (α). Testis: testosterone. Ovary: estrogen, progesterone. Pineal: melatonin. Heart: ANF; kidney: erythropoietin; GI: gastrin, secretin, CCK, GIP.'],
  build() {
    const g = H.grp(), labels = [];
    // stylised human silhouette (lathe torso + head + limbs)
    g.add(H.sphere(0.55, C.skin, [0, 3.2, 0], { op: 0.25, dw: false }));
    g.add(H.lathe([[0.25, 2.65], [0.9, 2.3], [1.0, 1.2], [0.85, 0.0], [0.9, -0.9], [0.5, -1.4], [0, -1.5]], C.skin, null, null, { seg: 24, op: 0.18, dw: false, side: THREE.DoubleSide }));
    for (const s of [-1, 1]) { g.add(H.rod([s * 0.95, 2.2, 0], [s * 1.35, -0.6, 0], 0.16, C.skin, { op: 0.18, dw: false })); g.add(H.rod([s * 0.45, -1.3, 0], [s * 0.55, -4.2, 0], 0.22, C.skin, { op: 0.18, dw: false })); }
    const gl = (p, r, col, sx = 1, sy = 1, sz = 1) => { g.add(H.ell(r * sx, r * sy, r * sz, col, p, { e: 0.6 })); return p; };
    const pin = gl([-0.15, 3.35, -0.1], 0.08, C.purple);
    const hyp = gl([0.05, 3.1, 0.05], 0.1, C.orange);
    const pit = gl([0.1, 2.85, 0.1], 0.1, C.yellow);
    const thy = gl([0, 2.2, 0.35], 0.14, C.red, 1.6, 1, 0.6);
    const par = gl([0.22, 2.2, 0.32], 0.05, C.lime); gl([-0.22, 2.2, 0.32], 0.05, C.lime);
    const thm = gl([0, 1.6, 0.4], 0.2, C.pink, 1, 1.3, 0.5);
    const adr = gl([-0.45, 0.3, 0.1], 0.12, C.amber); gl([0.45, 0.3, 0.1], 0.12, C.amber);
    const kid = [-0.45, -0.05, 0]; g.add(H.ell(0.18, 0.3, 0.15, '#7f1d1d', kid, { op: 0.6 })); g.add(H.ell(0.18, 0.3, 0.15, '#7f1d1d', [0.45, -0.05, 0], { op: 0.6 }));
    const pan = gl([0.15, 0.05, 0.35], 0.12, C.teal, 2.2, 0.8, 0.8);
    const gon = gl([-0.3, -1.05, 0.2], 0.13, C.blue); gl([0.3, -1.05, 0.2], 0.13, C.blue);
    const hrt = gl([0.2, 1.3, 0.35], 0.22, C.muscle, 0.9, 1, 0.8);
    labels.push(L('Hypothalamus', 'Neurosecretory cells → releasing/inhibiting hormones (e.g. GnRH, somatostatin)', hyp));
    labels.push(L('Pituitary (hypophysis)', 'Anterior: GH, PRL, TSH, ACTH, LH, FSH; posterior: oxytocin, vasopressin (ADH)', pit));
    labels.push(L('Pineal gland', 'Melatonin — 24-h (diurnal) rhythm', pin));
    labels.push(L('Thyroid', 'T₃, T₄ (need iodine; BMR) & calcitonin (↓ blood Ca²⁺)', thy));
    labels.push(L('Parathyroid (4)', 'PTH — ↑ blood Ca²⁺ (hypercalcemic)', par));
    labels.push(L('Thymus', 'Thymosins — T-lymphocyte differentiation; degenerates with age', thm));
    labels.push(L('Adrenal (on kidneys)', 'Cortex: cortisol, aldosterone, androgens; medulla: adrenaline, noradrenaline (emergency hormones)', adr));
    labels.push(L('Pancreas (islets of Langerhans)', 'α cells → glucagon (↑ glucose); β cells → insulin (↓ glucose)', pan));
    labels.push(L('Gonads (testis / ovary)', 'Testosterone (Leydig cells); estrogen & progesterone (ovary)', gon));
    labels.push(L('Heart (ANF)', 'Atrial natriuretic factor — lowers blood pressure', hrt));
    labels.push(L('Kidney (erythropoietin)', 'Stimulates erythropoiesis; JGA cells', kid));
    return { g, labels };
  }
}));


/* ================================================================
   4. BIOLOGY — CLASS 12
   ================================================================ */
const B12 = { sub: 'bio', cls: 12 };
const U6 = 'Unit 6 · Reproduction', U7 = 'Unit 7 · Genetics and Evolution', U8 = 'Unit 8 · Biology in Human Welfare', U9 = 'Unit 9 · Biotechnology', U10 = 'Unit 10 · Ecology';

/* ---------- Ch 1 Sexual Reproduction in Flowering Plants ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-1-2', unit: U6, ch: 'Ch 1 — Sexual Reproduction in Flowering Plants', fig: 'Fig 1.2', title: 'T.S. of a young anther',
  desc: 'A typical anther is bilobed, each lobe with two theca (dithecous) — four microsporangia (tetrasporangiate). Each microsporangium wall has epidermis, endothecium, middle layers and tapetum around the sporogenous tissue.',
  points: ['Wall layers (outside → in): epidermis, endothecium, middle layers (1–3), tapetum.', 'Tapetum: nourishes developing pollen; cells multinucleate with dense cytoplasm.', 'Sporogenous tissue → pollen mother cells (2n) → meiosis → microspore tetrads (n).', 'Anther dehiscence: endothecium (fibrous thickening) helps; longitudinal slit.'],
  build() {
    const g = H.grp(), labels = [];
    const lobe = (x, s) => { const l = H.grp([], [x, 0, 0]); for (const dy of [0.75, -0.75]) { const c = [0, dy, 0]; l.add(H.annulus(0.85, 0.75, 0.6, C.lime, c)); l.add(H.annulus(0.75, 0.62, 0.6, C.amber, c)); l.add(H.annulus(0.62, 0.5, 0.6, C.orange, c)); l.add(H.annulus(0.5, 0.36, 0.6, C.red, c, { op: 0.9 })); for (let i = 0; i < 7; i++) { const a = i * 0.9; l.add(H.sphere(0.11, C.purple, [0.22 * Math.cos(a), dy + 0.05, 0.22 * Math.sin(a) * 0.5], { seg: 8 })); } } return l; };
    g.add(lobe(-0.9)); g.add(lobe(0.9));
    g.add(H.box(0.6, 1.5, 0.6, C.green, [0, 0, 0], null, { op: 0.8 }));
    g.add(H.cyl(0.12, 0.12, 0.62, C.xy, [0, 0, 0], null, { seg: 10 })); g.add(H.cyl(0.24, 0.24, 0.62, C.ph, [0, 0, 0], null, { seg: 12, op: 0.5 }));
    labels.push(L('Epidermis', 'Outermost protective layer', [-0.9 + 0.8, 1.05, 0]));
    labels.push(L('Endothecium', 'Fibrous thickenings — helps dehiscence', [-0.9 + 0.68, 1.05, 0]));
    labels.push(L('Middle layers', '1–3 layers; ephemeral', [-0.9 + 0.56, 1.05, 0]));
    labels.push(L('Tapetum', 'Innermost nutritive layer; multinucleate cells', [-0.9 + 0.43, 1.05, 0]));
    labels.push(L('Sporogenous tissue → PMCs', 'Pollen mother cells undergo meiosis → microspore tetrads', [-0.9, 1.05, 0]));
    labels.push(L('Microsporangium (4 = tetrasporangiate)', 'Each theca has 2', [0.9, -0.75, 0.6]));
    labels.push(L('Connective', 'Sterile tissue between lobes', [0, 0.6, 0.3]));
    labels.push(L('Vascular bundle', 'In the connective', [0, 0.31, 0.15]));
    labels.push(L('Anther lobe (theca)', 'Bilobed, dithecous anther', [0.9, 0.75, 0.85]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-1-7', unit: U6, ch: 'Ch 1 — Sexual Reproduction in Flowering Plants', fig: 'Fig 1.7', title: 'Anatropous ovule (L.S.)',
  desc: 'The ovule (megasporangium) is attached to the placenta by a funicle. The body is inverted (anatropous) so the micropyle lies near the hilum. Integuments enclose the nucellus containing the embryo sac.',
  points: ['Funicle → hilum (junction) → raphe (ridge). Outer & inner integuments; micropyle (opening) at one end, chalaza at the other.', 'Nucellus = parenchymatous body with reserve food; MMC differentiates in the micropylar region of nucellus.', 'Embryo sac (female gametophyte) lies inside nucellus.', 'Most angiosperms: single MMC → 4 megaspores, one functional (monosporic).'],
  build() {
    const g = H.grp(), labels = [];
    const half = { phi: PI, phiStart: PI, side: THREE.DoubleSide };
    g.add(H.ell(1.4, 1.85, 1.2, C.amber, [0, 0, 0], Object.assign({ op: 0.85 }, half)));
    g.add(H.ell(1.22, 1.68, 1.05, C.orange, [0, 0, 0], Object.assign({ op: 0.85 }, half)));
    g.add(H.ell(1.02, 1.5, 0.9, C.lime, [0, 0, 0], Object.assign({ op: 0.9 }, half)));
    // micropyle gap at bottom
    g.add(H.box(0.28, 0.5, 0.5, C.ink, [0, -1.65, -0.2], null, { op: 0.8 }));
    // embryo sac
    g.add(H.ell(0.42, 1.0, 0.4, C.cyan, [0, -0.15, -0.2], { op: 0.5 }));
    g.add(H.sphere(0.13, C.pink, [0, -0.85, -0.2])); g.add(H.sphere(0.1, C.purple, [-0.18, -0.7, -0.15])); g.add(H.sphere(0.1, C.purple, [0.18, -0.7, -0.15]));
    g.add(H.sphere(0.09, C.yellow, [-0.1, -0.1, -0.2])); g.add(H.sphere(0.09, C.yellow, [0.1, -0.1, -0.2]));
    for (let i = 0; i < 3; i++) g.add(H.sphere(0.09, C.teal, [(i - 1) * 0.2, 0.65, -0.2]));
    // funicle and hilum
    g.add(H.tube([[1.3, 0.2, 0], [1.7, 0.9, 0], [1.9, 1.9, 0]], 0.12, C.green));
    g.add(H.tube([[1.3, 0.2, 0], [0.9, 1.2, -0.05], [0.2, 1.75, -0.05]], 0.07, C.dgreen));
    g.add(H.sphere(0.08, C.red, [1.35, 0.15, 0.05]));
    g.add(H.box(0.8, 0.25, 0.6, C.green, [2.3, 2.1, 0], null, { op: 0.8 }));
    labels.push(L('Funicle (stalk)', 'Attaches ovule to placenta', [1.7, 0.9, 0]));
    labels.push(L('Hilum', 'Junction of ovule body & funicle', [1.35, 0.15, 0.05]));
    labels.push(L('Raphe', 'Ridge formed by funicle fused with ovule body', [0.9, 1.2, -0.05]));
    labels.push(L('Outer integument', 'Outer protective envelope', [-1.3, 0.5, 0]));
    labels.push(L('Inner integument', 'Inner envelope', [-1.15, 0.0, 0]));
    labels.push(L('Micropyle', 'Small opening through integuments — pollen tube entry', [0, -1.65, 0]));
    labels.push(L('Chalaza', 'Basal part opposite the micropyle', [0, 1.55, -0.2]));
    labels.push(L('Nucellus', 'Mass of cells with reserve food; encloses embryo sac', [-0.7, -0.8, -0.2]));
    labels.push(L('Embryo sac (female gametophyte)', '7-celled, 8-nucleate', [0, -0.15, -0.2]));
    labels.push(L('Egg apparatus (egg + 2 synergids)', 'At the micropylar end', [0, -0.85, -0.2]));
    labels.push(L('Antipodal cells (3)', 'At the chalazal end', [0, 0.65, -0.2]));
    labels.push(L('Placenta', 'Ovule attached here', [2.3, 2.1, 0]));
    return { g, labels };
  }
}));

function megaStages() {
  const g = H.grp(), labels = [];
  const cellAt = (x, n, w = 0.5, h = 1.2) => { g.add(H.ell(w, h, w, C.lime, [x, 0, 0], { op: 0.35, side: THREE.DoubleSide, dw: false })); return x; };
  cellAt(-3.2, 1); g.add(H.sphere(0.18, C.nuc, [-3.2, 0, 0]));
  cellAt(-1.9, 2); g.add(H.sphere(0.15, C.nuc, [-1.9, 0.5, 0])); g.add(H.sphere(0.15, C.nuc, [-1.9, -0.5, 0])); g.add(H.line([[-2.4, 0, 0], [-1.4, 0, 0]], C.white));
  cellAt(-0.6, 4); for (let i = 0; i < 4; i++) { g.add(H.sphere(0.12, i === 3 ? C.yellow : C.grey, [-0.6, 0.85 - i * 0.57, 0], { e: i === 3 ? 0.9 : 0.3 })); if (i < 3) g.add(H.line([[-1.1, 0.57 - i * 0.57, 0], [-0.1, 0.57 - i * 0.57, 0]], C.white)); }
  cellAt(0.7, 1, 0.5, 0.9); g.add(H.sphere(0.16, C.yellow, [0.7, 0, 0], { e: 0.8 }));
  cellAt(1.9, 2, 0.5, 1.1); g.add(H.sphere(0.12, C.yellow, [1.9, 0.6, 0])); g.add(H.sphere(0.12, C.yellow, [1.9, -0.6, 0]));
  cellAt(3.1, 8, 0.55, 1.3); for (let i = 0; i < 4; i++) { g.add(H.sphere(0.09, C.yellow, [3.1 + (i % 2 - 0.5) * 0.25, 0.9 - Math.floor(i / 2) * 0.3, 0])); g.add(H.sphere(0.09, C.yellow, [3.1 + (i % 2 - 0.5) * 0.25, -0.9 + Math.floor(i / 2) * 0.3, 0])); }
  g.add(H.arrow([-2.6, -1.4, 0], [-2.4, -1.4, 0], C.white, { r: 0.015 })); g.add(H.text('meiosis I', { size: 0.13, pos: [-2.55, -1.6, 0], color: C.grey })); g.add(H.text('meiosis II', { size: 0.13, pos: [-1.25, -1.6, 0], color: C.grey })); g.add(H.text('3 degenerate', { size: 0.13, pos: [0.05, -1.6, 0], color: C.grey })); g.add(H.text('mitosis ×3', { size: 0.13, pos: [2.5, -1.6, 0], color: C.grey }));
  labels.push(L('Megaspore mother cell (MMC, 2n)', 'Single cell in nucellus near micropyle; large, dense cytoplasm', [-3.2, 0, 0]));
  labels.push(L('Meiosis', 'MMC → 4 haploid megaspores (linear tetrad)', [-1.9, 0, 0]));
  labels.push(L('Linear tetrad of megaspores', 'Only the chalazal one survives', [-0.6, 0.3, 0]));
  labels.push(L('Functional megaspore (n)', 'Develops into embryo sac — monosporic development', [0.7, 0, 0]));
  labels.push(L('2-nucleate stage', 'First free-nuclear mitosis', [1.9, 0, 0]));
  labels.push(L('8-nucleate embryo sac', 'Three mitoses → 8 nuclei (4 at each pole) — free nuclear divisions', [3.1, 0, 0]));
  return { g, labels, note: 'Megasporogenesis: MMC (2n) → meiosis → 4 megaspores; one functional → 3 mitoses → 8-nucleate, 7-celled embryo sac (Polygonum type).' };
}
function embryoSac() {
  const g = H.grp(), labels = [];
  g.add(H.ell(1.0, 2.2, 0.9, C.cyan, [0, 0, 0], { op: 0.2, side: THREE.DoubleSide, dw: false }));
  g.add(H.ell(1.02, 2.22, 0.92, C.cyan, [0, 0, 0], { wire: true, op: 0.4 }));
  // antipodals (top / chalazal)
  for (let i = 0; i < 3; i++) { g.add(H.sphere(0.32, C.teal, [(i - 1) * 0.5, 1.55, 0], { op: 0.7 })); g.add(H.sphere(0.12, C.nuc, [(i - 1) * 0.5, 1.55, 0])); }
  // central cell with 2 polar nuclei
  g.add(H.ell(0.85, 0.9, 0.75, C.yellow, [0, 0.1, 0], { op: 0.25 })); g.add(H.sphere(0.15, C.orange, [-0.2, 0.1, 0])); g.add(H.sphere(0.15, C.orange, [0.2, 0.1, 0]));
  // egg apparatus (bottom / micropylar)
  g.add(H.ell(0.35, 0.5, 0.35, C.pink, [0, -1.35, 0.1], { op: 0.8 })); g.add(H.sphere(0.13, C.nuc, [0, -1.25, 0.1]));
  for (const s of [-1, 1]) { g.add(H.ell(0.3, 0.55, 0.3, C.purple, [s * 0.5, -1.4, -0.1], { op: 0.8 })); g.add(H.sphere(0.11, C.nuc, [s * 0.5, -1.3, -0.1])); for (let k = 0; k < 4; k++) g.add(H.rod([s * (0.4 + k * 0.06), -1.85, -0.1], [s * (0.4 + k * 0.06), -2.05, -0.1], 0.015, C.white, { seg: 4 })); }
  labels.push(L('Antipodal cells (3)', 'At chalazal end; degenerate later', [0.5, 1.55, 0.3]));
  labels.push(L('Central cell', 'Large cell with 2 polar nuclei — becomes endosperm (3n) after triple fusion', [0.6, 0.4, 0.5]));
  labels.push(L('Polar nuclei (2)', 'Fuse with second male gamete → primary endosperm nucleus', [0.2, 0.1, 0.2]));
  labels.push(L('Egg cell', 'Fuses with one male gamete → zygote (syngamy)', [0, -1.35, 0.45]));
  labels.push(L('Synergids (2)', 'Guide pollen tube; one degenerates on tube entry', [-0.5, -1.4, 0.2]));
  labels.push(L('Filiform apparatus', 'Finger-like thickenings at micropylar tip of synergids', [0.5, -2.0, -0.1]));
  labels.push(L('Micropylar end ↓', 'Egg apparatus here', [0, -2.3, 0]));
  labels.push(L('Chalazal end ↑', 'Antipodals here', [0, 2.3, 0]));
  return { g, labels, note: '7-celled, 8-nucleate: 3 antipodals + 1 central cell (2 polar nuclei) + egg apparatus (egg + 2 synergids). Double fertilisation: syngamy + triple fusion.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-1-8', unit: U6, ch: 'Ch 1 — Sexual Reproduction in Flowering Plants', fig: 'Fig 1.8', title: 'Megasporogenesis & mature embryo sac',
  desc: 'The megaspore mother cell undergoes meiosis to form four megaspores; usually only one survives and forms the 7-celled, 8-nucleate female gametophyte by three free-nuclear mitoses followed by cell wall formation.',
  points: ['Monosporic development: single megaspore → embryo sac.', 'Egg apparatus at micropylar end (egg + 2 synergids with filiform apparatus); 3 antipodals at chalazal end; 2 polar nuclei in central cell.', 'Double fertilisation: syngamy (egg + male gamete → 2n zygote) and triple fusion (2 polar + male → 3n PEN).', 'Ovule → seed; ovary → fruit; integuments → seed coat.'],
  variants: [{ name: 'Megasporogenesis', build: megaStages }, { name: 'Mature embryo sac', build: embryoSac }]
}));

function embDicot() {
  const g = H.grp(), labels = [];
  for (const s of [-1, 1]) g.add(H.extrude([[0, 0], [s * 0.9, 0.4], [s * 1.2, 1.4], [s * 0.7, 2.2], [s * 0.1, 1.8], [0, 0.8]], 0.5, C.lime, [0, 0, 0], null, { op: 0.9 }));
  g.add(H.tube([[0, 0.9, 0.3], [0.05, 1.5, 0.3], [0, 2.0, 0.3]], 0.1, C.leaf));
  g.add(H.extrude([[0, 0], [0.2, 0.15], [0.25, 0.45], [0, 0.55], [-0.25, 0.45], [-0.2, 0.15]], 0.03, C.green, [0.15, 2.0, 0.3], [0, 0, -0.5])); g.add(H.extrude([[0, 0], [0.2, 0.15], [0.25, 0.45], [0, 0.55], [-0.25, 0.45], [-0.2, 0.15]], 0.03, C.green, [-0.15, 2.0, 0.3], [0, 0, 0.5]));
  g.add(H.lathe([[0.25, 0.9], [0.35, 0], [0.3, -0.8], [0.15, -1.5], [0, -1.8]], C.amber, [0, 0, 0.3], null, { seg: 20 }));
  g.add(H.cone(0.15, 0.4, C.bone, [0, -1.85, 0.3], [PI, 0, 0]));
  labels.push(L('Cotyledons (2)', 'Fleshy first leaves storing food', [-1.0, 1.4, 0.3]));
  labels.push(L('Plumule', 'Embryonic shoot tip with leaf primordia', [0, 2.2, 0.3]));
  labels.push(L('Epicotyl', 'Axis above cotyledon attachment', [0, 1.5, 0.45]));
  labels.push(L('Hypocotyl', 'Axis below cotyledon attachment', [0.35, -0.3, 0.3]));
  labels.push(L('Radicle', 'Embryonic root — emerges first', [0, -1.6, 0.3]));
  labels.push(L('Root cap', 'Covers radicle tip', [0, -1.9, 0.3]));
  labels.push(L('Embryonal axis', 'Plumule + hypocotyl + radicle (tigellum)', [0.3, 0.5, 0.45]));
  return { g, labels, note: 'Dicot embryo: two cotyledons + embryonal axis. Embryo develops at micropylar end; zygote → proembryo → globular → heart-shaped → mature.' };
}
function embMonocot() {
  const g = H.grp(), labels = [];
  g.add(H.extrude([[-0.9, -1.5], [0.3, -1.5], [0.7, -0.5], [0.7, 0.9], [0.3, 1.7], [-0.7, 1.7], [-1.0, 0.5]], 0.5, C.amber, [0, 0, 0], null, { op: 0.85 }));
  g.add(H.extrude([[-0.6, -1.0], [-0.1, -1.0], [0.1, -0.1], [-0.1, 0.9], [-0.5, 0.8]], 0.06, C.lime, [0, 0, 0.28]));
  g.add(H.rod([-0.35, -0.9, 0.35], [-0.3, -0.3, 0.35], 0.07, C.white)); g.add(H.ell(0.18, 0.4, 0.05, C.bone, [-0.35, -0.85, 0.35], { op: 0.5 }));
  g.add(H.rod([-0.3, 0.05, 0.35], [-0.25, 0.65, 0.35], 0.07, C.leaf)); g.add(H.ell(0.16, 0.42, 0.05, C.bone, [-0.25, 0.55, 0.35], { op: 0.5 }));
  g.add(H.box(0.15, 0.2, 0.06, C.pink, [-0.55, 0.3, 0.33]));
  labels.push(L('Scutellum', 'Single shield-shaped cotyledon lateral to embryonal axis', [0.45, 0.4, 0.3]));
  labels.push(L('Coleoptile', 'Hollow foliar sheath enclosing plumule', [-0.25, 0.55, 0.42]));
  labels.push(L('Plumule', 'Shoot apex with leaf primordia', [-0.25, 0.3, 0.42]));
  labels.push(L('Coleorhiza', 'Undifferentiated sheath enclosing radicle & root cap', [-0.35, -0.85, 0.42]));
  labels.push(L('Radicle', 'Embryonic root', [-0.33, -0.6, 0.42]));
  labels.push(L('Epiblast', 'Small outgrowth (vestige of second cotyledon) in grasses', [-0.55, 0.3, 0.4]));
  labels.push(L('Embryonal axis', 'Plumule + radicle', [-0.3, -0.1, 0.42]));
  return { g, labels, note: 'Monocot (grass) embryo: one cotyledon = scutellum; coleoptile & coleorhiza sheaths; epiblast.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-1-13', unit: U6, ch: 'Ch 1 — Sexual Reproduction in Flowering Plants', fig: 'Fig 1.13', title: 'Embryo: dicot vs monocot (grass)',
  desc: 'Embryogeny: zygote divides after some endosperm forms. A dicot embryo has an embryonal axis and two cotyledons; a grass (monocot) embryo has a single cotyledon (scutellum) with coleoptile and coleorhiza.',
  points: ['Endosperm develops before embryo (nutrition); free-nuclear (coconut water) or cellular.', 'Embryo development stages: proembryo → globular → heart-shaped → mature.', 'Seed: embryo + endosperm (if persistent) + seed coat; dormancy; viability varies (Lupinus arcticus 10,000 years).', 'Apomixis (seeds without fertilisation) & polyembryony (Citrus, mango).'],
  variants: [{ name: 'Dicot embryo', build: embDicot }, { name: 'Monocot (grass) embryo', build: embMonocot }]
}));

/* ---------- Ch 2 Human Reproduction ---------- */
function reproMale() {
  const g = H.grp(), labels = [];
  g.add(H.ell(0.9, 0.7, 0.6, C.yellow, [-0.3, 1.5, -0.2], { op: 0.45 }));
  g.add(H.tube([[0.2, 2.6, -0.2], [0.1, 2.1, -0.2], [-0.1, 1.9, -0.2]], 0.08, C.yellow, { op: 0.7 }));
  g.add(H.ell(0.4, 0.35, 0.3, C.orange, [-0.3, 0.55, 0], { op: 0.9 }));
  g.add(H.tube([[-0.3, 0.75, 0], [-0.4, 1.0, 0.1], [-0.3, 1.2, 0.1]], 0.05, C.orange));
  g.add(H.ell(0.35, 0.18, 0.2, C.pink, [-1.0, 0.85, 0.05]));
  g.add(H.tube([[0.1, 0.5, 0.1], [1.2, 0.2, 0.1], [2.0, -0.6, 0.1], [2.4, -1.4, 0.1]], 0.1, C.mem));
  g.add(H.ell(0.6, 0.85, 0.5, C.pink, [1.6, -2.2, 0], { op: 0.35 }));
  g.add(H.ell(0.4, 0.6, 0.35, C.purple, [1.6, -2.2, 0]));
  g.add(H.tube([[1.55, -1.7, 0.35], [1.35, -2.2, 0.4], [1.5, -2.7, 0.35]], 0.06, C.teal));
  g.add(H.tube([[1.5, -2.7, 0.35], [1.2, -2.0, 0.45], [0.7, -1.0, 0.35], [0.1, -0.1, 0.35], [-0.2, 0.4, 0.2]], 0.045, C.teal));
  g.add(H.sphere(0.1, C.amber, [0.15, 0.05, 0.15])); g.add(H.sphere(0.1, C.amber, [-0.15, 0.05, 0.15]));
  labels.push(L('Urinary bladder', 'Stores urine (not part of reproductive system)', [-0.3, 1.5, 0.4]));
  labels.push(L('Ureter', 'From kidney', [0.15, 2.4, -0.2]));
  labels.push(L('Seminal vesicle', 'Secretes fructose-rich fluid (bulk of semen)', [-1.0, 0.85, 0.05]));
  labels.push(L('Prostate gland', 'Surrounds urethra; alkaline secretion', [-0.3, 0.55, 0.3]));
  labels.push(L('Bulbourethral (Cowper\'s) glands', 'Lubricating secretion', [0, 0.05, 0.15]));
  labels.push(L('Vas deferens', 'Ascends into abdomen, loops over bladder, joins seminal vesicle duct → ejaculatory duct', [0.7, -1.0, 0.35]));
  labels.push(L('Testis (in scrotum)', 'Seminiferous tubules (spermatogenesis) + Leydig cells (testosterone); 2–2.5 °C below body temp', [1.6, -2.2, 0.4]));
  labels.push(L('Epididymis', 'Coiled tube on posterior testis — sperm maturation & storage', [1.35, -2.2, 0.45]));
  labels.push(L('Urethra (in penis)', 'Common passage for urine & semen; opens at urethral meatus', [2.0, -0.6, 0.1]));
  labels.push(L('Scrotum', 'Pouch keeping testes 2–2.5 °C below body temperature', [1.6, -2.85, 0]));
  return { g, labels, note: 'Male: testes (250 lobules, 1–3 seminiferous tubules each) → rete testis → vasa efferentia → epididymis → vas deferens → ejaculatory duct → urethra. Accessory glands: seminal vesicles, prostate, bulbourethral.' };
}
function reproFemale() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, 1.3], [0.9, 1.1], [1.0, 0.4], [0.5, -0.5], [0.35, -0.9], [0.35, -1.4]], C.pink, [0, 0, 0], null, { seg: 24, phiStart: PI, phiLen: PI, op: 0.85, side: THREE.DoubleSide }));
  g.add(H.lathe([[0, 1.05], [0.55, 0.9], [0.45, 0.3], [0.12, -0.5], [0.1, -1.4]], C.red, [0, 0, -0.02], null, { seg: 24, phiStart: PI, phiLen: PI, op: 0.6, side: THREE.DoubleSide }));
  g.add(H.lathe([[0.36, -1.4], [0.42, -2.0], [0.3, -2.6], [0, -2.7]], C.purple, [0, 0, 0], null, { seg: 20, phiStart: PI, phiLen: PI, op: 0.6, side: THREE.DoubleSide }));
  for (const s of [-1, 1]) { g.add(H.tube([[s * 0.85, 1.0, 0], [s * 1.6, 1.4, 0], [s * 2.3, 1.2, 0.1], [s * 2.8, 0.6, 0.1]], 0.1, C.orange)); g.add(H.lathe([[0.1, 0], [0.3, 0.3], [0.38, 0.55]], C.orange, [s * 2.8, 0.6, 0.1], [0, 0, s * 2.4], { seg: 14, op: 0.8 })); for (let k = 0; k < 6; k++) g.add(H.rod([s * (2.8 + 0.25 * Math.cos(k)), 0.3, 0.1 + 0.25 * Math.sin(k)], [s * (2.85 + 0.4 * Math.cos(k)), -0.05, 0.1 + 0.4 * Math.sin(k)], 0.02, C.orange)); g.add(H.ell(0.4, 0.55, 0.35, C.teal, [s * 2.6, -0.5, 0.1])); for (let k = 0; k < 4; k++) g.add(H.sphere(0.07, C.yellow, [s * (2.6 + 0.25 * Math.cos(k * 1.5)), -0.5 + 0.3 * Math.sin(k * 1.5), 0.4], { seg: 6 })); }
  labels.push(L('Ovary (pair)', 'Primary sex organ — ova & estrogen/progesterone; cortex with follicles', [2.6, -0.5, 0.45]));
  labels.push(L('Fimbriae (infundibulum)', 'Finger-like projections collecting the ovum at ovulation', [2.85, 0.1, 0.4]));
  labels.push(L('Ampulla', 'Wider part of oviduct — site of fertilisation', [2.3, 1.2, 0.1]));
  labels.push(L('Isthmus', 'Narrow part of fallopian tube joining uterus', [1.2, 1.25, 0]));
  labels.push(L('Fundus of uterus', 'Dome above the tube openings', [0, 1.3, 0]));
  labels.push(L('Uterine wall: perimetrium / myometrium / endometrium', 'Outer thin membrane; thick smooth muscle (contractions in labour); inner glandular lining (menstrual cycle)', [-0.95, 0.5, 0]));
  labels.push(L('Cervix', 'Narrow lower neck; cervical canal + vagina = birth canal', [0, -1.0, 0]));
  labels.push(L('Vagina', 'Muscular tube opening to exterior', [0, -2.2, 0]));
  labels.push(L('Uterine cavity', 'Lined by endometrium; embryo implants here', [0, 0.4, 0]));
  return { g, labels, note: 'Female: ovaries, oviducts (infundibulum–ampulla–isthmus), uterus (fundus, body, cervix; wall = perimetrium, myometrium, endometrium), vagina; external genitalia; mammary glands (15–20 lobes).' };
}
reg(Object.assign({}, B12, {
  id: 'b12-2-1', unit: U6, ch: 'Ch 2 — Human Reproduction', fig: 'Fig 2.1 & 2.2', title: 'Male & female reproductive systems',
  desc: 'The male system: testes, accessory ducts (rete testis, vasa efferentia, epididymis, vas deferens), glands and penis. The female system: ovaries, oviducts, uterus, cervix, vagina and external genitalia.',
  points: ['Testis ~4–5 cm, 250 lobules; seminiferous tubules lined by male germ cells & Sertoli cells; Leydig cells between tubules.', 'Semen = sperm + secretions of seminal vesicles, prostate, bulbourethral glands.', 'Ovary 2–4 cm, attached by mesovarium; stroma with follicles.', 'Fertilisation in ampullary-isthmic junction; implantation in endometrium.'],
  variants: [{ name: 'Male', build: reproMale }, { name: 'Female', build: reproFemale }]
}));

reg(Object.assign({}, B12, {
  id: 'b12-2-5', unit: U6, ch: 'Ch 2 — Human Reproduction', fig: 'Fig 2.5', title: 'T.S. of seminiferous tubule — spermatogenesis',
  desc: 'Spermatogonia (2n) at the periphery divide mitotically; primary spermatocytes undergo meiosis I → secondary spermatocytes (n) → meiosis II → spermatids → spermiogenesis → spermatozoa released into the lumen (spermiation).',
  points: ['Sertoli cells nourish germ cells; Leydig (interstitial) cells outside tubules secrete testosterone.', 'Hormonal control: GnRH → LH (Leydig → androgens) & FSH (Sertoli → factors for spermiogenesis).', 'Primary spermatocyte (2n) → 2 secondary (n) → 4 spermatids (n) → 4 sperms.', 'Starts at puberty; ~200–300 million sperms per ejaculate; 60% normal & 40% motile for fertility.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.annulus(2.3, 2.15, 0.6, C.amber, null, { op: 0.9 }));
    const ring = (r, n, size, col, y = 0) => { const out = []; for (let i = 0; i < n; i++) { const a = i / n * TAU + r; const p = [r * Math.cos(a), y, r * Math.sin(a)]; g.add(H.sphere(size, col, p, { seg: 10 })); out.push(p); } return out; };
    const spg = ring(1.95, 18, 0.16, C.blue); const psc = ring(1.55, 14, 0.2, C.purple); const ssc = ring(1.15, 12, 0.15, C.pink); const spt = ring(0.8, 10, 0.11, C.orange);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.3; g.add(H.sphere(0.06, C.yellow, [0.45 * Math.cos(a), 0.15, 0.45 * Math.sin(a)], { seg: 6 })); g.add(H.tube([[0.45 * Math.cos(a), 0.15, 0.45 * Math.sin(a)], [0.2 * Math.cos(a + 0.5), 0.15, 0.2 * Math.sin(a + 0.5)], [0.05 * Math.cos(a + 1), 0.18, 0.05 * Math.sin(a + 1)]], 0.012, C.yellow)); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.5; g.add(H.lathe([[0.3, 0], [0.22, 0.6], [0.12, 1.4], [0.05, 1.9]], C.lime, [2.05 * Math.cos(a), 0.3, 2.05 * Math.sin(a)], [0, -a, PI / 2 + 0.05], { seg: 10, op: 0.35 })); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.2; g.add(H.sphere(0.18, C.red, [2.7 * Math.cos(a), 0, 2.7 * Math.sin(a)], { e: 0.5 })); }
    labels.push(L('Basement membrane', 'Outer boundary of the tubule', [2.3, 0.3, 0]));
    labels.push(L('Spermatogonia (2n)', 'Outermost; divide by mitosis', spg[0]));
    labels.push(L('Primary spermatocyte (2n)', 'Undergoes meiosis I', psc[0]));
    labels.push(L('Secondary spermatocytes (n)', 'Products of meiosis I → meiosis II', ssc[0]));
    labels.push(L('Spermatids (n)', 'Haploid; transform into sperms (spermiogenesis)', spt[0]));
    labels.push(L('Spermatozoa in lumen', 'Heads embedded in Sertoli cells; released by spermiation', [0.45, 0.15, 0]));
    labels.push(L('Sertoli cell', 'Nurse cell — nutrition; secretes inhibin', [2.05 * Math.cos(0.5) - 0.9, 0.5, 2.05 * Math.sin(0.5) - 0.4]));
    labels.push(L('Leydig (interstitial) cells', 'Outside tubules; androgens (testosterone) under LH', [2.7 * Math.cos(0.2), 0, 2.7 * Math.sin(0.2)]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-2-6', unit: U6, ch: 'Ch 2 — Human Reproduction', fig: 'Fig 2.6', title: 'Structure of a human sperm',
  desc: 'A sperm is a microscopic structure enveloped by plasma membrane, with head (acrosome + haploid nucleus), neck, middle piece (mitochondria) and tail (flagellum).',
  points: ['Acrosome: cap-like, filled with enzymes for fertilisation (hyaluronidase).', 'Middle piece: numerous mitochondria supply energy for tail movement.', 'Tail: propels the sperm; sperm motile.', 'Head nucleus haploid; formed from spermatid by spermiogenesis.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.ell(0.55, 0.85, 0.3, C.teal, [-2.5, 0, 0], { op: 0.5 }));
    g.add(H.ell(0.5, 0.78, 0.25, C.nuc, [-2.5, -0.05, 0], { op: 0.9 }));
    g.add(H.ell(0.55, 0.35, 0.3, C.yellow, [-2.5, 0.6, 0], { op: 0.85, thetaStart: 0, theta: PI / 2 }));
    g.add(H.cyl(0.12, 0.14, 0.3, C.orange, [-2.5, -0.95, 0]));
    g.add(H.rod([-2.5, -1.1, 0], [-2.5, -2.2, 0], 0.07, C.grey));
    g.add(H.helix(0.14, 1.1, 8, 0.045, C.red, { pos: [-2.5, -1.65, 0] }));
    g.add(H.tube([[-2.5, -2.2, 0], [-2.3, -2.9, 0.05], [-2.6, -3.6, 0], [-2.2, -4.3, -0.05], [-2.5, -5.0, 0]], 0.04, C.cyan, { seg: 40 }));
    g.rotation.z = -PI / 2; g.position.set(0.3, -0.1, 0);
    const P = (x, y) => [y + 0.3, -x - 0.1, 0]; // rotated mapping
    labels.push(L('Head', 'Elongated haploid nucleus + acrosome', P(-2.5, 0)));
    labels.push(L('Acrosome', 'Cap-like; hydrolytic enzymes digest zona pellucida', P(-2.5, 0.75)));
    labels.push(L('Nucleus (haploid)', '23 chromosomes (22 + X or Y)', P(-2.5, -0.1)));
    labels.push(L('Neck (centrioles)', 'Short segment with proximal & distal centrioles', P(-2.5, -0.95)));
    labels.push(L('Middle piece', 'Spirally arranged mitochondria — energy for motility', P(-2.5, -1.65)));
    labels.push(L('Tail (flagellum)', 'Axoneme; propels the sperm', P(-2.5, -3.6)));
    labels.push(L('Plasma membrane', 'Envelops the whole sperm', P(-2.95, -2.5)));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-2-8', unit: U6, ch: 'Ch 2 — Human Reproduction', fig: 'Fig 2.8', title: 'Menstrual cycle — hormones, ovary & uterus',
  desc: 'A 28-day cycle: menstrual phase (days 1–5), follicular/proliferative phase (FSH ↑, estrogen ↑, endometrium regenerates), ovulation on day 14 (LH surge), luteal/secretory phase (corpus luteum → progesterone).',
  points: ['Menstruation results from breakdown of endometrium when corpus luteum degenerates (no fertilisation).', 'LH surge (mid-cycle, ~day 14) triggers rupture of Graafian follicle — ovulation.', 'Progesterone from corpus luteum maintains endometrium; if pregnancy, hCG sustains it.', 'Menarche (first cycle) & menopause (~50 years); cycle absent during pregnancy and may be absent in lactation.'],
  build() {
    const g = H.grp(), labels = [];
    const gs = (x, c, w, a) => a * Math.exp(-Math.pow((x - c) / w, 2));
    const est = x => 0.15 + gs(x, 12, 3, 0.75) + gs(x, 21, 4, 0.4), prog = x => 0.05 + gs(x, 21, 4.2, 0.9), lh = x => 0.15 + gs(x, 14, 1.0, 0.95), fsh = x => 0.3 + gs(x, 13, 1.2, 0.35) - 0.005 * x + gs(x, 3, 3, 0.15);
    const G = H.graph({ w: 5.4, h: 2.4, xr: [0, 28], yr: [0, 1.1], xl: 'Days', yl: 'Hormone level', xt: [[5, '5'], [14, '14'], [28, '28']], nx: 14, ny: 4, pos: [0, 1.3, 0],
      curves: [{ f: x => lh(x), color: C.red, r: 0.03, label: 'LH' }, { f: x => fsh(x), color: C.orange, r: 0.03, label: 'FSH' }, { f: x => est(x), color: C.green, r: 0.03, label: 'Estrogen' }, { f: x => prog(x), color: C.purple, r: 0.03, label: 'Progesterone' }], vl: [{ x: 14, y: 1.1 }] });
    g.add(G);
    // ovary row
    const ox = d => -2.7 + d / 28 * 5.4;
    for (let i = 0; i < 5; i++) { const d = 2 + i * 2.8; const r = 0.08 + i * 0.05; g.add(H.sphere(r, C.pink, [ox(d), -0.5, 0], { op: 0.8 })); g.add(H.sphere(r * 0.45, C.nuc, [ox(d), -0.5, 0])); }
    g.add(H.sphere(0.3, C.pink, [ox(14), -0.5, 0], { op: 0.5 })); g.add(H.sphere(0.12, C.yellow, [ox(14) + 0.35, -0.5, 0], { e: 0.8 }));
    for (let i = 0; i < 3; i++) { const d = 17 + i * 3.5; g.add(H.sphere(0.28 - i * 0.03, C.amber, [ox(d), -0.5, 0], { e: 0.4, op: 1 - i * 0.25 })); }
    g.add(H.sphere(0.12, C.grey, [ox(27), -0.5, 0], { op: 0.5 }));
    // endometrium thickness band
    const pts = []; for (let i = 0; i <= 56; i++) { const d = i / 2; const th = d < 5 ? 0.35 - d * 0.05 : 0.1 + Math.min(0.45, (d - 5) * 0.05) * (d > 26 ? (28 - d) / 2 : 1); pts.push([ox(d), -1.5 + th, 0]); }
    g.add(H.tube(pts, 0.03, C.red, { seg: 60 })); g.add(H.plane(5.4, 0.08, C.red, [0, -1.55, 0], null, { op: 0.6 }));
    g.add(H.text('Menstrual', { size: 0.13, pos: [ox(2.5), -2.0, 0], color: C.grey })); g.add(H.text('Proliferative (follicular)', { size: 0.13, pos: [ox(9.5), -2.0, 0], color: C.grey })); g.add(H.text('Secretory (luteal)', { size: 0.13, pos: [ox(21), -2.0, 0], color: C.grey }));
    labels.push(L('LH surge (day 14)', 'Triggers ovulation — rupture of Graafian follicle', G.map(14, 1.05).map((v, i) => i === 1 ? v + 1.3 : v)));
    labels.push(L('FSH', 'Stimulates follicular development in ovary', G.map(3, 0.55).map((v, i) => i === 1 ? v + 1.3 : v)));
    labels.push(L('Estrogen (from follicle)', 'Rises in follicular phase; regenerates endometrium', G.map(12, 0.9).map((v, i) => i === 1 ? v + 1.3 : v)));
    labels.push(L('Progesterone (corpus luteum)', 'Peaks in luteal phase; maintains secretory endometrium', G.map(21, 0.95).map((v, i) => i === 1 ? v + 1.3 : v)));
    labels.push(L('Developing follicle → Graafian follicle', 'Primary → secondary → tertiary (antrum) → Graafian', [ox(8), -0.5, 0.2]));
    labels.push(L('Ovulation', 'Secondary oocyte released, day 14', [ox(14) + 0.35, -0.5, 0]));
    labels.push(L('Corpus luteum', 'Secretes progesterone; degenerates → corpus albicans', [ox(20.5), -0.5, 0.3]));
    labels.push(L('Endometrium thickness', 'Sheds (days 1–5), regenerates, becomes secretory', [ox(21), -1.05, 0]));
    labels.push(L('Menstrual phase (days 1–5)', 'Endometrial lining & blood vessels break down', [ox(2.5), -1.55, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-2-11', unit: U6, ch: 'Ch 2 — Human Reproduction', fig: 'Fig 2.11', title: 'Ovum surrounded by sperms (fertilisation)',
  desc: 'Fertilisation occurs at the ampullary-isthmic junction. Sperm contacts the zona pellucida, inducing changes that block polyspermy; acrosomal enzymes let it enter. This triggers completion of meiosis II in the secondary oocyte, forming the ovum and second polar body.',
  points: ['Layers around ovum (outside → in): corona radiata (follicle cells), zona pellucida (glycoprotein), plasma membrane; perivitelline space between zona and membrane.', 'Only one sperm fertilises — zona pellucida changes block entry of others.', 'Sex determined by sperm: X → girl, Y → boy (50:50).', 'Zygote → cleavage (2,4,8,16 blastomeres) → morula → blastocyst (trophoblast + inner cell mass) → implantation.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.sphere(1.0, C.yellow, null, { op: 0.9 }));
    g.add(H.sphere(0.35, C.nuc, [0.2, 0.15, 0.3]));
    g.add(H.sphere(1.2, C.cyan, null, { op: 0.18, side: THREE.DoubleSide, dw: false }));
    g.add(H.sphere(1.32, C.amber, null, { op: 0.28, side: THREE.DoubleSide, dw: false }));
    for (let i = 0; i < 60; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * (i + 0.5) / 60); g.add(H.ell(0.16, 0.24, 0.16, C.orange, [1.45 * Math.sin(b) * Math.cos(a), 1.45 * Math.cos(b), 1.45 * Math.sin(b) * Math.sin(a)], { op: 0.85 })); }
    g.add(H.sphere(0.14, C.grey, [-0.6, 0.95, 0.4]));
    const sperm = (dir, len, penetrating) => { const d = V3(...dir).normalize(); const start = d.clone().multiplyScalar(penetrating ? 1.15 : 1.75); const head = H.ell(0.09, 0.14, 0.06, C.teal, start.toArray()); head.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().negate()); g.add(head); const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(start.clone().add(d.clone().multiplyScalar(0.14 + t * len)).add(V3(0.08 * Math.sin(t * 9), 0.08 * Math.cos(t * 7), 0)).toArray()); } g.add(H.tube(pts, 0.015, C.teal)); };
    sperm([1, 0.3, 0.4], 1.2, true); sperm([-1, 0.5, 0.3], 1.2); sperm([0.3, -1, 0.5], 1.0); sperm([-0.4, -0.8, -0.6], 1.1); sperm([0.8, 0.8, -0.5], 1.0); sperm([-0.9, -0.1, 0.8], 1.1); sperm([0.1, 1, 0.2], 0.9);
    labels.push(L('Corona radiata', 'Layer of follicular cells around the ovum', [1.45, 0, 0]));
    labels.push(L('Zona pellucida', 'Glycoprotein layer; changes after first sperm binds — blocks polyspermy', [0, 1.2, 0.3]));
    labels.push(L('Perivitelline space', 'Between zona pellucida & plasma membrane', [0, -1.1, 0.4]));
    labels.push(L('Plasma membrane of ovum', 'Sperm fuses here', [-1.0, 0.2, 0]));
    labels.push(L('Nucleus (secondary oocyte)', 'Arrested in metaphase II until sperm entry', [0.2, 0.15, 0.3]));
    labels.push(L('First polar body', 'From meiosis I in the ovary', [-0.6, 0.95, 0.4]));
    labels.push(L('Sperm penetrating', 'Acrosomal enzymes; only one enters', [1.25, 0.37, 0.5]));
    labels.push(L('Other sperms', 'Blocked by zona reaction', [-1.65, 0.8, 0.5]));
    labels.push(L('Cytoplasm (ooplasm)', 'Yolk-poor (alecithal) human ovum', [0.5, -0.5, 0.6]));
    return { g, labels };
  }
}));

/* ---------- Ch 4 Principles of Inheritance ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-4-3', unit: U7, ch: 'Ch 4 — Principles of Inheritance and Variation', fig: 'Fig 4.3', title: 'Monohybrid cross (tall × dwarf pea)',
  desc: 'Mendel crossed true-breeding tall (TT) and dwarf (tt) plants. F₁ were all tall (Tt). Selfing F₁ gave F₂ with 3 tall : 1 dwarf phenotypically, and 1 TT : 2 Tt : 1 tt genotypically.',
  points: ['Law of Dominance: in a heterozygote only the dominant allele is expressed.', 'Law of Segregation: alleles separate during gamete formation; gametes are pure.', 'Test cross: F₁ × recessive parent → 1:1. Back cross with either parent.', 'Incomplete dominance (snapdragon 1:2:1 pink) & co-dominance (ABO blood group) are exceptions to complete dominance.'],
  build() {
    const g = H.grp(), labels = [];
    const plant = (x, y, tall, txt) => { const h = tall ? 1.0 : 0.5; g.add(H.rod([x, y - h / 2, 0], [x, y + h / 2, 0], 0.04, C.dgreen)); for (let k = 0; k < (tall ? 3 : 2); k++) g.add(H.ell(0.16, 0.08, 0.04, C.leaf, [x + (k % 2 ? 0.14 : -0.14), y - h / 2 + 0.25 + k * 0.28, 0])); g.add(H.sphere(0.09, tall ? C.pink : C.purple, [x, y + h / 2 + 0.08, 0], { e: 0.6 })); g.add(H.text(txt, { size: 0.18, bold: true, pos: [x, y - h / 2 - 0.22, 0] })); };
    plant(-1.2, 2.2, true, 'TT'); plant(1.2, 2.2, false, 'tt'); g.add(H.text('×', { size: 0.3, pos: [0, 2.2, 0] })); g.add(H.text('Parents', { size: 0.16, pos: [-2.6, 2.2, 0], color: C.grey }));
    g.add(H.arrow([0, 1.5, 0], [0, 1.0, 0], C.white, { r: 0.015 })); g.add(H.text('gametes: T   t', { size: 0.14, pos: [0.9, 1.3, 0], color: C.grey }));
    plant(0, 0.4, true, 'Tt (all tall)'); g.add(H.text('F₁', { size: 0.16, pos: [-2.6, 0.4, 0], color: C.grey }));
    g.add(H.arrow([0, -0.4, 0], [0, -0.75, 0], C.white, { r: 0.015 })); g.add(H.text('selfing (Tt × Tt)', { size: 0.14, pos: [1.1, -0.55, 0], color: C.grey }));
    // Punnett square
    const cx = 0, cy = -2.0, s = 0.85;
    const cell = (i, j, txt, col) => { g.add(H.box(s - 0.06, s - 0.06, 0.15, col, [cx + (j - 0.5) * s, cy + (0.5 - i) * s, 0], null, { op: 0.6 })); g.add(H.text(txt, { size: 0.2, bold: true, pos: [cx + (j - 0.5) * s, cy + (0.5 - i) * s, 0.1], top: true })); };
    cell(0, 0, 'TT', C.pink); cell(0, 1, 'Tt', C.pink); cell(1, 0, 'Tt', C.pink); cell(1, 1, 'tt', C.purple);
    g.add(H.text('T', { size: 0.2, bold: true, pos: [cx - 0.5 * s, cy + s + 0.2, 0], color: C.yellow })); g.add(H.text('t', { size: 0.2, bold: true, pos: [cx + 0.5 * s, cy + s + 0.2, 0], color: C.yellow })); g.add(H.text('T', { size: 0.2, bold: true, pos: [cx - s - 0.2, cy + 0.5 * s, 0], color: C.yellow })); g.add(H.text('t', { size: 0.2, bold: true, pos: [cx - s - 0.2, cy - 0.5 * s, 0], color: C.yellow }));
    g.add(H.text('F₂', { size: 0.16, pos: [-2.6, -2.0, 0], color: C.grey }));
    g.add(H.text('Phenotype 3 tall : 1 dwarf', { size: 0.15, pos: [2.4, -1.8, 0], color: C.white })); g.add(H.text('Genotype 1 TT : 2 Tt : 1 tt', { size: 0.15, pos: [2.4, -2.15, 0], color: C.white }));
    labels.push(L('Parents (P): TT × tt', 'True-breeding tall and dwarf', [-1.2, 2.2, 0]));
    labels.push(L('F₁ generation — all Tt (tall)', 'Dominance: T masks t', [0, 0.4, 0]));
    labels.push(L('Gametes of F₁', 'T and t in equal proportion (segregation)', [cx - 0.5 * s, cy + s + 0.2, 0]));
    labels.push(L('Punnett square', 'Reginald Punnett — all gamete combinations', [cx, cy, 0.1]));
    labels.push(L('Homozygous recessive tt (dwarf)', '1/4 of F₂', [cx + 0.5 * s, cy - 0.5 * s, 0.1]));
    labels.push(L('F₂ ratios', 'Phenotypic 3:1; genotypic 1:2:1', [2.4, -2.0, 0]));
    return { g, labels };
  }
}));

function pedigreeSymbols() {
  const g = H.grp(), labels = [];
  const sq = (p, filled) => g.add(H.box(0.5, 0.5, 0.15, filled ? C.red : C.white, p, null, { op: filled ? 1 : 0.35 })); const ci = (p, filled) => g.add(H.cyl(0.28, 0.28, 0.15, filled ? C.red : C.white, p, [PI / 2, 0, 0], { op: filled ? 1 : 0.35 }));
  sq([-2.5, 1.5, 0], false); ci([-1.5, 1.5, 0], false); sq([-0.5, 1.5, 0], true); ci([0.5, 1.5, 0], true);
  sq([2.0, 1.5, 0], false); ci([3.0, 1.5, 0], false); g.add(H.line([[2.0, 1.5, 0.05], [3.0, 1.5, 0.05]], C.white));
  sq([-2.5, -0.3, 0], false); ci([-1.5, -0.3, 0], false); g.add(H.line([[-2.5, -0.3, 0.05], [-1.5, -0.3, 0.05]], C.white)); g.add(H.line([[-2.0, -0.3, 0.05], [-2.0, -0.9, 0.05], [-2.6, -0.9, 0.05], [-2.6, -1.3, 0.05]], C.white)); g.add(H.line([[-2.0, -0.9, 0.05], [-1.4, -0.9, 0.05], [-1.4, -1.3, 0.05]], C.white)); sq([-2.6, -1.55, 0], false); ci([-1.4, -1.55, 0], true);
  g.add(H.line([[0.8, -0.3, 0.05], [1.6, -0.3, 0.05]], C.white)); g.add(H.line([[0.8, -0.2, 0.05], [1.6, -0.2, 0.05]], C.white)); sq([0.5, -0.25, 0], false); ci([1.9, -0.25, 0], false);
  g.add(H.text('I, II, III = generations', { size: 0.15, pos: [2.5, -1.2, 0], color: C.grey }));
  labels.push(L('Male (square)', 'Unaffected', [-2.5, 1.5, 0]));
  labels.push(L('Female (circle)', 'Unaffected', [-1.5, 1.5, 0]));
  labels.push(L('Affected individuals (filled)', 'Show the trait', [-0.5, 1.5, 0]));
  labels.push(L('Mating (marriage line)', 'Horizontal line between partners', [2.5, 1.5, 0]));
  labels.push(L('Sib-ship line & offspring', 'Vertical line to children; siblings in birth order (left → right)', [-2.0, -0.9, 0.05]));
  labels.push(L('Consanguineous mating', 'Double line — related partners', [1.2, -0.25, 0.05]));
  labels.push(L('Affected daughter', 'Trait appears in progeny of unaffected parents → recessive', [-1.4, -1.55, 0]));
  return { g, labels, note: 'Pedigree analysis traces inheritance of a trait through generations — used for genetic counselling.' };
}
function pedigreeChart(dominant) {
  const g = H.grp(), labels = [];
  const sq = (p, f) => g.add(H.box(0.4, 0.4, 0.12, f ? C.red : C.white, p, null, { op: f ? 1 : 0.35 })); const ci = (p, f) => g.add(H.cyl(0.22, 0.22, 0.12, f ? C.red : C.white, p, [PI / 2, 0, 0], { op: f ? 1 : 0.35 }));
  const ln = (a, b) => g.add(H.line([a, b], C.white));
  g.add(H.text('I', { size: 0.18, pos: [-3.2, 1.6, 0], color: C.grey })); g.add(H.text('II', { size: 0.18, pos: [-3.2, 0.2, 0], color: C.grey })); g.add(H.text('III', { size: 0.18, pos: [-3.2, -1.2, 0], color: C.grey }));
  if (dominant) {
    sq([-0.5, 1.6, 0], true); ci([0.5, 1.6, 0], false); ln([-0.5, 1.6, 0.05], [0.5, 1.6, 0.05]); ln([0, 1.6, 0.05], [0, 1.0, 0.05]); ln([-1.5, 1.0, 0.05], [1.5, 1.0, 0.05]);
    [[-1.5, true, 'sq'], [-0.5, false, 'ci'], [0.5, true, 'ci'], [1.5, false, 'sq']].forEach(([x, f, k]) => { ln([x, 1.0, 0.05], [x, 0.5, 0.05]); (k === 'sq' ? sq : ci)([x, 0.2, 0], f); });
    ci([-2.3, 0.2, 0], false); ln([-2.3, 0.2, 0.05], [-1.5, 0.2, 0.05]); ln([-1.9, 0.2, 0.05], [-1.9, -0.4, 0.05]); ln([-2.5, -0.4, 0.05], [-1.3, -0.4, 0.05]); ln([-2.5, -0.4, 0.05], [-2.5, -0.9, 0.05]); ln([-1.3, -0.4, 0.05], [-1.3, -0.9, 0.05]); sq([-2.5, -1.2, 0], true); ci([-1.3, -1.2, 0], false);
    sq([1.3, 0.2, 0], false); ln([0.5, 0.2, 0.05], [1.3, 0.2, 0.05]); ln([0.9, 0.2, 0.05], [0.9, -0.4, 0.05]); ln([0.3, -0.4, 0.05], [1.5, -0.4, 0.05]); ln([0.3, -0.4, 0.05], [0.3, -0.9, 0.05]); ln([1.5, -0.4, 0.05], [1.5, -0.9, 0.05]); ci([0.3, -1.2, 0], true); sq([1.5, -1.2, 0], false);
    labels.push(L('Affected parent in every generation', 'Trait does not skip generations — autosomal dominant', [-0.5, 1.6, 0]));
    labels.push(L('~50% of children affected', 'Aa × aa → 1:1', [-0.5, 0.2, 0]));
    labels.push(L('Both sexes affected equally', 'Autosomal (not sex-linked)', [0.3, -1.2, 0]));
    labels.push(L('Unaffected individuals have unaffected children', 'aa × aa → all aa', [1.5, -1.2, 0]));
    return { g, labels, note: 'Autosomal dominant e.g. myotonic dystrophy: appears in every generation; affected has at least one affected parent.' };
  }
  sq([-0.5, 1.6, 0], false); ci([0.5, 1.6, 0], false); ln([-0.5, 1.6, 0.05], [0.5, 1.6, 0.05]); ln([0, 1.6, 0.05], [0, 1.0, 0.05]); ln([-1.5, 1.0, 0.05], [1.5, 1.0, 0.05]);
  [[-1.5, false, 'sq'], [-0.5, true, 'ci'], [0.5, false, 'sq'], [1.5, false, 'ci']].forEach(([x, f, k]) => { ln([x, 1.0, 0.05], [x, 0.5, 0.05]); (k === 'sq' ? sq : ci)([x, 0.2, 0], f); });
  ci([-2.3, 0.2, 0], false); ln([-2.3, 0.2, 0.05], [-1.5, 0.2, 0.05]); ln([-1.9, 0.2, 0.05], [-1.9, -0.4, 0.05]); ln([-2.5, -0.4, 0.05], [-1.3, -0.4, 0.05]); ln([-2.5, -0.4, 0.05], [-2.5, -0.9, 0.05]); ln([-1.3, -0.4, 0.05], [-1.3, -0.9, 0.05]); sq([-2.5, -1.2, 0], false); ci([-1.3, -1.2, 0], false);
  ci([1.3, 0.2, 0], false); ln([0.5, 0.2, 0.05], [1.3, 0.2, 0.05]); ln([0.5, 0.3, 0.05], [1.3, 0.3, 0.05]); ln([0.9, 0.2, 0.05], [0.9, -0.4, 0.05]); ln([0.3, -0.4, 0.05], [1.5, -0.4, 0.05]); ln([0.3, -0.4, 0.05], [0.3, -0.9, 0.05]); ln([1.5, -0.4, 0.05], [1.5, -0.9, 0.05]); sq([0.3, -1.2, 0], true); ci([1.5, -1.2, 0], false);
  labels.push(L('Unaffected carrier parents (Aa × Aa)', 'Trait skips generation; parents are heterozygous carriers', [0, 1.6, 0]));
  labels.push(L('Affected child of carriers', '1/4 chance (aa)', [-0.5, 0.2, 0]));
  labels.push(L('Consanguineous marriage', 'Increases chance of recessive homozygotes', [0.9, 0.25, 0.05]));
  labels.push(L('Affected son in generation III', 'Both sexes affected — autosomal recessive', [0.3, -1.2, 0]));
  return { g, labels, note: 'Autosomal recessive e.g. sickle-cell anaemia, cystic fibrosis, phenylketonuria: often skips generations; two carrier parents.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-4-7', unit: U7, ch: 'Ch 4 — Principles of Inheritance and Variation', fig: 'Fig 4.7', title: 'Pedigree analysis',
  desc: 'Pedigree analysis traces a trait through a family tree using standard symbols. Patterns reveal whether a trait is autosomal or sex-linked, dominant or recessive.',
  points: ['Dominant: appears every generation; affected have affected parent. Recessive: skips generations; carriers.', 'X-linked recessive (haemophilia, colour blindness): more males affected; carrier mother → son.', 'Mendelian disorders: haemophilia, cystic fibrosis, sickle-cell (GAG→GUG, Glu→Val at 6th position β-globin), PKU, thalassemia.', 'Chromosomal: Down (trisomy 21), Klinefelter (XXY), Turner (XO).'],
  variants: [{ name: 'Symbols', build: pedigreeSymbols }, { name: 'Autosomal dominant', build: () => pedigreeChart(true) }, { name: 'Autosomal recessive', build: () => pedigreeChart(false) }]
}));


/* ---------- Ch 5 Molecular Basis of Inheritance ---------- */
function dnaDouble(len, turns, R, pos, o = {}) {
  const g = H.grp([], pos);
  g.add(H.helix(R, len, turns, o.r ?? 0.05, o.c1 ?? C.dna, { axis: o.axis, ppt: 20 })); g.add(H.helix(R, len, turns, o.r ?? 0.05, o.c2 ?? C.dna2, { axis: o.axis, phase: PI, ppt: 20 }));
  const n = Math.round(turns * 10); for (let i = 0; i < n; i++) { const t = i / n, a = t * turns * TAU; const y = -len / 2 + t * len; const A = [R * Math.cos(a), y, R * Math.sin(a)], B = [-R * Math.cos(a), y, -R * Math.sin(a)]; const M = [0, y, 0]; const cols = [[C.green, C.orange], [C.orange, C.green], [C.cyan, C.yellow], [C.yellow, C.cyan]][i % 4]; const ax = p => o.axis === 'x' ? [p[1], p[0], p[2]] : p; g.add(H.rod(ax(A), ax(M), 0.03, cols[0])); g.add(H.rod(ax(M), ax(B), 0.03, cols[1])); }
  return g;
}
reg(Object.assign({}, B12, {
  id: 'b12-5-2', unit: U7, ch: 'Ch 5 — Molecular Basis of Inheritance', fig: 'Fig 5.2', title: 'Nucleosome',
  desc: 'In eukaryotes, negatively charged DNA wraps around a positively charged histone octamer (H2A, H2B, H3, H4 × 2) to form a nucleosome — ~200 bp per nucleosome. Nucleosomes form "beads-on-string" chromatin, further packed with H1 and NHC proteins.',
  points: ['Histones rich in lysine & arginine (basic) → positively charged.', 'Human cell: 2.2 m DNA, 6.6 × 10⁹ bp; E. coli 4.6 × 10⁶ bp.', 'Euchromatin (loosely packed, active) vs heterochromatin (densely packed, inactive).', 'H1 histone links nucleosomes (linker DNA); solenoid → chromatin fibre → chromosome.'],
  build() {
    const g = H.grp(), labels = [];
    const core = H.grp([], [0, 0, 0]);
    const hcol = [C.orange, C.amber, C.yellow, C.lime];
    for (let i = 0; i < 8; i++) { const a = i / 4 * TAU; const y = i < 4 ? 0.28 : -0.28; core.add(H.sphere(0.42, hcol[i % 4], [0.42 * Math.cos(a + (i < 4 ? 0 : PI / 4)), y, 0.42 * Math.sin(a + (i < 4 ? 0 : PI / 4))], { op: 0.95 })); }
    g.add(core);
    // DNA wrapping 1.75 turns
    const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80; const a = t * 1.75 * TAU; pts.push([1.05 * Math.cos(a), 0.45 - t * 0.9, 1.05 * Math.sin(a)]); }
    g.add(H.tube(pts, 0.1, C.dna, { seg: 100 })); g.add(H.tube(pts.map((p, i) => { const a = (i / 80) * 1.75 * TAU; return [p[0] + 0.12 * Math.cos(a + PI / 2) * 0.5, p[1] + 0.12, p[2] + 0.12 * Math.sin(a + PI / 2) * 0.5]; }), 0.1, C.dna2, { seg: 100 }));
    // linker DNA out to next nucleosomes
    g.add(H.tube([pts[0], [1.6, 0.9, 0.4], [2.6, 1.2, 0.2], [3.3, 1.0, 0]], 0.1, C.dna, { seg: 30 }));
    g.add(H.tube([pts[80], [-1.6, -0.9, 0.6], [-2.6, -1.1, 0.2], [-3.3, -0.9, 0]], 0.1, C.dna, { seg: 30 }));
    g.add(H.sphere(0.55, C.orange, [3.6, 0.9, 0], { op: 0.6 })); g.add(H.sphere(0.55, C.orange, [-3.6, -0.8, 0], { op: 0.6 }));
    g.add(H.sphere(0.2, C.purple, [1.05, -0.5, 0.3], { e: 0.6 }));
    labels.push(L('Histone octamer (core)', '8 histone proteins: 2 each of H2A, H2B, H3, H4 — positively charged', [0, 0.7, 0]));
    labels.push(L('DNA (negatively charged)', 'Wraps ~1.75 turns; ≈ 200 bp per nucleosome', [1.05 * Math.cos(1.0), 0.2, 1.05 * Math.sin(1.0)]));
    labels.push(L('Linker DNA', 'Connects adjacent nucleosomes', [2.6, 1.2, 0.2]));
    labels.push(L('H1 histone', 'Binds linker DNA at entry/exit; stabilises higher packing', [1.05, -0.5, 0.3]));
    labels.push(L('Adjacent nucleosome', '"Beads-on-string" seen under EM', [3.6, 0.9, 0]));
    labels.push(L('Chromatin', 'Nucleosomes → 30 nm solenoid → loops → chromosome', [-3.6, -0.8, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-5-6', unit: U7, ch: 'Ch 5 — Molecular Basis of Inheritance', fig: 'Fig 5.6', title: 'DNA replication fork',
  desc: 'Semi-conservative replication: helicase unwinds the double helix at the origin; DNA-dependent DNA polymerase adds nucleotides only in 5′→3′ direction. One strand (leading) is synthesised continuously, the other (lagging) discontinuously as Okazaki fragments joined by DNA ligase.',
  points: ['Meselson & Stahl (1958) proved semi-conservative replication in E. coli using ¹⁵N.', 'Deoxynucleoside triphosphates serve as substrate and energy source.', 'Polymerase cannot initiate — needs an RNA primer; replicates in S phase.', 'Origin of replication; replication fork; E. coli polymerase: 2000 bp/s.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(dnaDouble(3.0, 2.5, 0.35, [-2.3, 0, 0], { axis: 'x' }));
    // unwound strands (Y shape)
    const top = [[-0.8, 0.0, 0], [0.2, 0.8, 0], [1.4, 1.3, 0], [2.8, 1.5, 0]], bot = [[-0.8, 0.0, 0], [0.2, -0.8, 0], [1.4, -1.3, 0], [2.8, -1.5, 0]];
    g.add(H.tube(top, 0.05, C.dna, { seg: 30 })); g.add(H.tube(bot, 0.05, C.dna2, { seg: 30 }));
    // leading strand new (continuous along top)
    const lead = top.map(p => [p[0], p[1] - 0.22, p[2] + 0.05]).slice(1); g.add(H.tube([[0.0, 0.5, 0.05]].concat(lead), 0.05, C.lime, { seg: 30 }));
    for (let i = 1; i < 12; i++) { const t = i / 12; const c = new THREE.CatmullRomCurve3(top.map(vec)).getPoint(t); if (t < 0.3) continue; g.add(H.rod([c.x, c.y, 0], [c.x, c.y - 0.22, 0.05], 0.025, i % 2 ? C.green : C.orange)); }
    g.add(H.arrow([1.0, 0.85, 0.15], [0.25, 0.45, 0.15], C.lime, { r: 0.02, head: 0.14 })); g.add(H.text("5′→3′ leading (continuous)", { size: 0.14, pos: [1.9, 0.75, 0.2], color: C.lime }));
    // lagging: Okazaki fragments
    const bc = new THREE.CatmullRomCurve3(bot.map(vec));
    const frag = (t0, t1) => { const pts = []; for (let k = 0; k <= 6; k++) { const c = bc.getPoint(t0 + (t1 - t0) * k / 6); pts.push([c.x, c.y + 0.22, 0.05]); } g.add(H.tube(pts, 0.05, C.yellow, { seg: 12 })); const e = bc.getPoint(t0), s = bc.getPoint(t1); g.add(H.arrow([s.x, s.y + 0.36, 0.15], [e.x + 0.1, e.y + 0.36, 0.15], C.yellow, { r: 0.015, head: 0.1 })); g.add(H.sphere(0.06, C.red, [s.x, s.y + 0.22, 0.05], { e: 0.8 })); };
    frag(0.35, 0.58); frag(0.65, 0.88);
    for (let i = 4; i < 12; i++) { const c = bc.getPoint(i / 12); g.add(H.rod([c.x, c.y, 0], [c.x, c.y + 0.22, 0.05], 0.025, i % 2 ? C.cyan : C.green)); }
    g.add(H.text("lagging (Okazaki fragments)", { size: 0.14, pos: [1.9, -0.55, 0.2], color: C.yellow }));
    // enzymes
    g.add(H.ell(0.35, 0.35, 0.35, C.purple, [-0.9, 0, 0], { op: 0.85 })); g.add(H.text('helicase', { size: 0.13, pos: [-0.9, 0.5, 0.3], color: C.purple }));
    g.add(H.ell(0.3, 0.25, 0.3, C.teal, [0.6, 0.85, 0.1], { op: 0.85 })); g.add(H.ell(0.3, 0.25, 0.3, C.teal, [1.2, -1.05, 0.1], { op: 0.85 }));
    g.add(H.ell(0.2, 0.2, 0.2, C.orange, [0.9, -0.55, 0.15], { op: 0.85 }));
    labels.push(L('Parental double helix', 'Unwinds at origin of replication', [-2.3, 0.4, 0]));
    labels.push(L('Helicase', 'Unwinds/separates strands at the replication fork', [-0.9, 0, 0]));
    labels.push(L('Replication fork', 'Y-shaped junction; both strands act as templates', [-0.6, 0.1, 0.1]));
    labels.push(L('Leading strand', 'Continuous synthesis 5′→3′ toward the fork', [1.4, 1.08, 0.05]));
    labels.push(L('Lagging strand', 'Discontinuous — away from fork', [1.4, -1.08, 0.05]));
    labels.push(L('Okazaki fragments', 'Short pieces later joined by DNA ligase', [bc.getPoint(0.75).x, bc.getPoint(0.75).y + 0.22, 0.05]));
    labels.push(L('RNA primer', 'Primase makes primer; polymerase extends from 3′-OH', [bc.getPoint(0.58).x, bc.getPoint(0.58).y + 0.22, 0.05]));
    labels.push(L('DNA polymerase', 'Adds deoxynucleotides 5′→3′; proof-reads', [0.6, 0.85, 0.1]));
    labels.push(L('DNA ligase', 'Seals nicks between Okazaki fragments', [0.9, -0.55, 0.15]));
    labels.push(L('Template strand (parental)', 'Each daughter duplex = 1 old + 1 new strand (semi-conservative)', [2.8, 1.5, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-5-8', unit: U7, ch: 'Ch 5 — Molecular Basis of Inheritance', fig: 'Fig 5.8', title: 'Transcription unit',
  desc: 'A transcription unit has a promoter (5′ upstream, binds RNA polymerase), the structural gene, and a terminator (3′ downstream). The strand with 3′→5′ polarity is the template; the 5′→3′ strand is the coding strand (same sequence as RNA, with T instead of U).',
  points: ['RNA polymerase moves along the template 3′→5′, synthesising RNA 5′→3′.', 'Prokaryotes: single RNA polymerase; sigma factor (initiation), rho factor (termination); transcription & translation coupled.', 'Eukaryotes: RNA pol I (rRNA), II (hnRNA → mRNA), III (tRNA, 5S rRNA, snRNA); splicing, capping, tailing.', 'Structural gene in eukaryotes is split: exons (expressed) & introns (removed).'],
  build() {
    const g = H.grp(), labels = [];
    const y1 = 0.35, y2 = -0.35;
    const seg = (x0, x1, col, y, h = 0.22) => g.add(H.box(x1 - x0, h, 0.25, col, [(x0 + x1) / 2, y, 0]));
    seg(-3.2, -1.8, C.purple, y1); seg(-1.8, 1.8, C.green, y1); seg(1.8, 3.2, C.red, y1);
    seg(-3.2, -1.8, C.purple, y2, 0.2); seg(-1.8, 1.8, C.teal, y2, 0.2); seg(1.8, 3.2, C.red, y2, 0.2);
    for (let i = 0; i < 24; i++) g.add(H.rod([-3.0 + i * 0.26, y1 - 0.11, 0], [-3.0 + i * 0.26, y2 + 0.1, 0], 0.02, i % 2 ? C.grey : C.dgrey));
    g.add(H.text('5′', { size: 0.2, pos: [-3.5, y1, 0.1], color: C.white })); g.add(H.text('3′', { size: 0.2, pos: [3.5, y1, 0.1], color: C.white }));
    g.add(H.text('3′', { size: 0.2, pos: [-3.5, y2, 0.1], color: C.white })); g.add(H.text('5′', { size: 0.2, pos: [3.5, y2, 0.1], color: C.white }));
    g.add(H.text('Promoter', { size: 0.16, pos: [-2.5, 0.85, 0.1], color: C.purple })); g.add(H.text('Structural gene', { size: 0.16, pos: [0, 0.85, 0.1], color: C.green })); g.add(H.text('Terminator', { size: 0.16, pos: [2.5, 0.85, 0.1], color: C.red }));
    g.add(H.text('Coding strand (5′→3′)', { size: 0.14, pos: [0, 0.6, 0.1], color: C.grey })); g.add(H.text('Template strand (3′→5′)', { size: 0.14, pos: [0, -0.6, 0.1], color: C.grey }));
    // RNA polymerase and mRNA
    g.add(H.ell(0.55, 0.6, 0.5, C.amber, [0.2, 0, 0.2], { op: 0.75 })); g.add(H.text('RNA pol', { size: 0.14, pos: [0.2, 0, 0.75], top: true }));
    g.add(H.tube([[-1.7, -0.15, 0.35], [-1.0, -0.6, 0.5], [-0.3, -0.5, 0.6], [0.1, -0.2, 0.45]], 0.05, C.orange, { seg: 20 }));
    g.add(H.text('mRNA 5′→3′', { size: 0.14, pos: [-1.2, -1.0, 0.5], color: C.orange }));
    g.add(H.arrow([0.9, -1.1, 0.2], [1.6, -1.1, 0.2], C.white, { r: 0.015, head: 0.1 })); g.add(H.text('direction', { size: 0.12, pos: [1.25, -1.3, 0.2], color: C.grey }));
    labels.push(L('Promoter', 'DNA sequence at 5′ end (upstream) — RNA polymerase binding site; defines template', [-2.5, y1, 0.15]));
    labels.push(L('Structural gene', 'Region transcribed into RNA', [0, y1, 0.15]));
    labels.push(L('Terminator', '3′ end (downstream) — ends transcription', [2.5, y1, 0.15]));
    labels.push(L('Coding strand (5′→3′)', 'Same sequence as RNA (T for U); not transcribed', [-1.0, y1, 0.15]));
    labels.push(L('Template strand (3′→5′)', 'Read by RNA polymerase', [-1.0, y2, 0.15]));
    labels.push(L('RNA polymerase', 'DNA-dependent; catalyses polymerisation 5′→3′', [0.2, 0, 0.7]));
    labels.push(L('Nascent RNA transcript', 'Synthesised 5′→3′ complementary to template', [-1.0, -0.6, 0.5]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-5-13', unit: U7, ch: 'Ch 5 — Molecular Basis of Inheritance', fig: 'Fig 5.13', title: 'tRNA — the adapter molecule (clover-leaf)',
  desc: 'tRNA reads the codon on mRNA (via its anticodon loop) and carries the corresponding amino acid on its 3′ end (amino-acid acceptor end). Clover-leaf in 2-D, inverted L in 3-D. Charging = aminoacylation of tRNA.',
  points: ['Anticodon loop: base-complementary to codon. Amino acid acceptor arm: 3′ CCA end.', 'Other arms: D-loop (dihydrouridine), TψC loop (pseudouridine), variable loop.', 'Initiator tRNA carries methionine (formyl-methionine in bacteria); no tRNA for stop codons (UAA, UAG, UGA).', 'Francis Crick postulated the adapter molecule.'],
  build() {
    const g = H.grp(), labels = [];
    const stem = (a, b, col, n = 4) => { a = V3(...a); b = V3(...b); const d = b.clone().sub(a).normalize(), up = Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0); const nrm = d.clone().cross(up).normalize().multiplyScalar(0.16); g.add(H.rod(a.clone().add(nrm), b.clone().add(nrm), 0.05, col)); g.add(H.rod(a.clone().sub(nrm), b.clone().sub(nrm), 0.05, col)); for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); g.add(H.rod(p.clone().add(nrm), p.clone().sub(nrm), 0.025, C.grey)); } };
    const loop = (c, R, col, n) => { g.add(H.torus(R, 0.05, col, c, null, { arc: PI * 1.5, rot: [0, 0, 0] })); for (let i = 0; i < n; i++) { const a = 0.4 + i / n * PI * 1.3; g.add(H.sphere(0.07, col, [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a), c[2]], { seg: 8 })); } };
    // acceptor stem (top)
    stem([0, 0.3, 0], [0, 1.8, 0], C.orange, 6);
    g.add(H.rod([0.16, 1.8, 0], [0.16, 2.5, 0], 0.05, C.orange)); for (let i = 0; i < 3; i++) g.add(H.sphere(0.08, C.yellow, [0.16 + 0.12 * i, 2.15 + i * 0.22, 0], { seg: 8 }));
    g.add(H.sphere(0.2, C.lime, [0.6, 2.8, 0], { e: 0.6 })); g.add(H.text('aa', { size: 0.16, pos: [0.6, 2.8, 0.22], top: true }));
    g.add(H.text('5′', { size: 0.16, pos: [-0.35, 1.85, 0], color: C.white })); g.add(H.text('3′', { size: 0.16, pos: [0.85, 2.45, 0], color: C.white }));
    // D arm (left)
    stem([-0.2, 0.15, 0], [-1.5, 0.15, 0], C.purple, 4); loop([-1.9, 0.15, 0], 0.45, C.purple, 8);
    // TψC arm (right)
    stem([0.2, 0.15, 0], [1.5, 0.15, 0], C.teal, 5); loop([1.9, 0.15, 0], 0.45, C.teal, 7);
    // variable loop
    g.add(H.torus(0.25, 0.04, C.grey, [0.75, -0.45, 0], [0, 0, PI], { arc: PI }));
    // anticodon arm (bottom)
    stem([0, -0.1, 0], [0, -1.6, 0], C.pink, 5);
    g.add(H.torus(0.45, 0.05, C.pink, [0, -2.0, 0], [0, 0, PI * 0.25], { arc: PI * 1.5 }));
    for (let i = 0; i < 3; i++) g.add(H.sphere(0.09, C.red, [(i - 1) * 0.28, -2.45, 0], { e: 0.7 }));
    g.add(H.text('anticodon', { size: 0.14, pos: [0, -2.75, 0], color: C.red }));
    labels.push(L('Amino acid acceptor end (3′ CCA)', 'Amino acid attached to 3′-OH by aminoacyl-tRNA synthetase (charging)', [0.6, 2.8, 0]));
    labels.push(L('Acceptor stem', '5′ and 3′ ends base-paired', [0.16, 1.0, 0]));
    labels.push(L('D arm (D-loop)', 'Contains dihydrouridine; recognition by synthetase', [-1.9, 0.15, 0]));
    labels.push(L('TψC arm', 'Contains pseudouridine (ψ); binds ribosome', [1.9, 0.15, 0]));
    labels.push(L('Variable loop', 'Varies in size between tRNAs', [0.75, -0.7, 0]));
    labels.push(L('Anticodon arm', 'Stem + loop', [0.16, -0.9, 0]));
    labels.push(L('Anticodon (3 bases)', 'Base-pairs with mRNA codon (antiparallel)', [0, -2.45, 0]));
    labels.push(L('Clover-leaf structure', 'Secondary structure; tertiary = inverted L', [-1.0, 1.2, 0]));
    return { g, labels };
  }
}));

function lacOperon(inducer) {
  const g = H.grp(), labels = [];
  const segs = [['i', -3.4, -2.4, C.grey], ['p', -2.4, -1.6, C.purple], ['o', -1.6, -1.0, C.orange], ['z', -1.0, 0.6, C.green], ['y', 0.6, 1.9, C.teal], ['a', 1.9, 3.0, C.blue]];
  segs.forEach(([n, x0, x1, col]) => { g.add(H.box(x1 - x0 - 0.04, 0.35, 0.3, col, [(x0 + x1) / 2, 0, 0])); g.add(H.text(n, { size: 0.22, bold: true, pos: [(x0 + x1) / 2, 0, 0.2], top: true })); });
  g.add(H.text('lac operon', { size: 0.18, pos: [1.0, 0.45, 0], color: C.grey }));
  g.add(H.ell(0.3, 0.3, 0.3, C.red, [-2.9, 1.3, 0.2], { op: 0.9 })); g.add(H.text('repressor', { size: 0.13, pos: [-2.9, 1.75, 0.2], color: C.red }));
  g.add(H.arrow([-2.9, 0.25, 0.1], [-2.9, 0.95, 0.1], C.grey, { r: 0.015, head: 0.1 })); g.add(H.text('mRNA', { size: 0.12, pos: [-3.3, 0.6, 0.1], color: C.grey }));
  if (!inducer) {
    g.add(H.ell(0.32, 0.3, 0.32, C.red, [-1.3, 0.35, 0.2], { op: 0.9 }));
    g.add(H.ell(0.45, 0.4, 0.4, C.amber, [-2.0, 0.55, 0.3], { op: 0.5 })); g.add(H.text('RNA pol blocked', { size: 0.13, pos: [-2.0, 1.1, 0.3], color: C.amber }));
    g.add(H.text('✕ no transcription', { size: 0.16, pos: [1.0, -0.6, 0.2], color: C.red }));
    labels.push(L('Repressor bound to operator', 'Active repressor (from i gene) blocks RNA polymerase — operon OFF', [-1.3, 0.35, 0.2]));
    labels.push(L('No lactose (inducer absent)', 'Repressor stays active; negative regulation', [1.0, -0.6, 0.2]));
  } else {
    g.add(H.ell(0.32, 0.3, 0.32, C.red, [-1.3, 1.5, 0.3], { op: 0.9 })); g.add(H.sphere(0.13, C.yellow, [-1.0, 1.65, 0.45], { e: 0.8 })); g.add(H.text('inducer (allolactose)', { size: 0.12, pos: [-1.0, 2.0, 0.45], color: C.yellow }));
    g.add(H.ell(0.45, 0.4, 0.4, C.amber, [-1.9, 0.5, 0.3], { op: 0.8 })); g.add(H.arrow([-1.4, 0.55, 0.35], [2.6, 0.55, 0.35], C.amber, { r: 0.02, head: 0.15 }));
    g.add(H.tube([[-0.9, -0.5, 0.3], [0.5, -0.7, 0.3], [2.6, -0.5, 0.3]], 0.04, C.orange, { seg: 20 })); g.add(H.text('polycistronic mRNA', { size: 0.13, pos: [1.0, -0.95, 0.3], color: C.orange }));
    g.add(H.text('β-galactosidase · permease · transacetylase', { size: 0.13, pos: [1.0, -1.4, 0.3], color: C.white }));
    labels.push(L('Inducer–repressor complex', 'Allolactose binds repressor → inactive; falls off operator', [-1.3, 1.5, 0.3]));
    labels.push(L('RNA polymerase transcribes z, y, a', 'Operon ON — single polycistronic mRNA', [-1.9, 0.5, 0.3]));
    labels.push(L('Gene products', 'β-galactosidase (z), permease (y), transacetylase (a)', [1.0, -1.4, 0.3]));
  }
  labels.push(L('i gene (regulator)', 'Constitutively makes repressor protein', [-2.9, 0, 0.15]));
  labels.push(L('Promoter (p)', 'RNA polymerase binding site', [-2.0, 0, 0.15]));
  labels.push(L('Operator (o)', 'Repressor binding site adjacent to promoter', [-1.3, 0, 0.15]));
  labels.push(L('z gene', 'β-galactosidase — hydrolyses lactose → glucose + galactose', [-0.2, 0, 0.15]));
  labels.push(L('y gene', 'Permease — increases lactose permeability', [1.25, 0, 0.15]));
  labels.push(L('a gene', 'Transacetylase', [2.45, 0, 0.15]));
  return { g, labels, note: inducer ? 'Lactose present: allolactose (inducer) inactivates the repressor → transcription; lactose is both substrate and inducer.' : 'Lactose absent: repressor binds operator → RNA polymerase cannot transcribe → no lac enzymes (negative regulation).' };
}
reg(Object.assign({}, B12, {
  id: 'b12-5-14', unit: U7, ch: 'Ch 5 — Molecular Basis of Inheritance', fig: 'Fig 5.14', title: 'The lac operon',
  desc: 'Jacob & Monod: the lac operon in E. coli = regulator gene i, promoter, operator, and three structural genes (z, y, a) under one promoter. Lactose acts as the inducer switching the operon on.',
  points: ['Operon = polycistronic structural genes regulated by a common promoter & regulatory genes.', 'Repressor (from i) binds operator → blocks transcription (negative regulation).', 'Inducer (lactose/allolactose) inactivates the repressor; glucose absence needed too (catabolite repression, not in NCERT detail).', 'Genes are switched on/off at transcription — Jacob & Monod 1961.'],
  variants: [{ name: 'Lactose absent (OFF)', build: () => lacOperon(false) }, { name: 'Lactose present (ON)', build: () => lacOperon(true) }]
}));

/* ---------- Ch 6 Evolution ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-6-1', unit: U7, ch: 'Ch 6 — Evolution', fig: 'Fig 6.1', title: 'Urey & Miller experiment (1953)',
  desc: 'Stanley Miller created conditions of the primitive Earth in a closed flask: CH₄, H₂, NH₃ and water vapour at 800 °C with electric discharge. After a week he observed amino acids — supporting Oparin–Haldane chemical evolution.',
  points: ['Oparin (Russia) & Haldane (England): life from pre-existing non-living organic molecules; diversity by chemical evolution.', 'Reducing atmosphere: no free O₂; CH₄, NH₃, H₂, H₂O; UV & lightning as energy.', 'Miller obtained amino acids; other experiments produced sugars, nitrogen bases, pigments, fats.', 'Meteorite analysis also shows similar compounds — chemical evolution accepted.'],
  build() {
    const g = H.grp(), labels = [];
    // large spark flask (top right)
    g.add(H.sphere(1.0, C.cyan, [1.3, 1.4, 0], { op: 0.2, side: THREE.DoubleSide, dw: false }));
    g.add(H.rod([1.0, 2.3, 0], [0.9, 1.5, 0.1], 0.04, C.grey)); g.add(H.rod([1.6, 2.3, 0], [1.7, 1.5, -0.1], 0.04, C.grey));
    g.add(H.tube([[0.95, 1.5, 0.1], [1.15, 1.3, 0], [1.3, 1.6, 0], [1.5, 1.3, 0], [1.65, 1.5, -0.1]], 0.02, C.yellow, { seg: 24, e: 0.9 }));
    g.add(H.text('CH₄  NH₃  H₂  H₂O', { size: 0.16, pos: [1.3, 0.8, 0.3], color: C.white }));
    // boiling flask (bottom left)
    g.add(H.sphere(0.75, C.blue, [-1.6, -1.3, 0], { op: 0.35, side: THREE.DoubleSide, dw: false }));
    g.add(H.sphere(0.6, C.blue, [-1.6, -1.45, 0], { op: 0.55, theta: PI / 2, thetaStart: PI / 2, side: THREE.DoubleSide }));
    g.add(H.box(0.8, 0.12, 0.6, C.red, [-1.6, -2.15, 0], null, { e: 0.6 })); g.add(H.text('heat', { size: 0.14, pos: [-1.6, -2.4, 0], color: C.red }));
    // tubing: up from boiling flask to spark flask
    g.add(H.tube([[-1.6, -0.55, 0], [-1.6, 0.6, 0], [-1.6, 1.6, 0], [-0.6, 2.3, 0], [0.4, 2.0, 0]], 0.07, C.grey, { seg: 30, op: 0.7 }));
    // from spark flask down through condenser to trap and back
    g.add(H.tube([[1.3, 0.4, 0], [1.3, -0.4, 0], [1.3, -1.2, 0]], 0.07, C.grey, { op: 0.7 }));
    g.add(H.cyl(0.22, 0.22, 0.9, C.cyan, [1.3, -0.5, 0], null, { op: 0.35, open: true, side: THREE.DoubleSide })); g.add(H.tube([[1.5, -0.2, 0], [2.1, -0.1, 0]], 0.04, C.cyan)); g.add(H.tube([[1.5, -0.8, 0], [2.1, -0.9, 0]], 0.04, C.cyan));
    g.add(H.tube([[1.3, -1.2, 0], [1.2, -1.7, 0], [0.6, -1.9, 0], [-0.2, -1.9, 0], [-0.9, -1.6, 0]], 0.07, C.grey, { seg: 24, op: 0.7 }));
    g.add(H.lathe([[0, -0.3], [0.3, -0.25], [0.32, 0.2], [0.1, 0.3]], C.amber, [0.6, -1.9, 0], null, { seg: 16, op: 0.6 }));
    g.add(H.arrow([-1.2, 0.5, 0.2], [-1.2, 1.2, 0.2], C.white, { r: 0.012, head: 0.1 })); g.add(H.arrow([1.65, 0.3, 0.2], [1.65, -0.4, 0.2], C.white, { r: 0.012, head: 0.1 }));
    labels.push(L('Spark flask (gases)', 'CH₄, NH₃, H₂ + water vapour — simulated primitive atmosphere', [1.3, 1.4, 0]));
    labels.push(L('Electrodes — electric discharge', 'Simulated lightning energy', [1.3, 2.3, 0]));
    labels.push(L('Boiling water ("ocean")', 'Water vapour rises into the atmosphere flask', [-1.6, -1.45, 0]));
    labels.push(L('Heat source (800 °C conditions)', 'Drives evaporation & circulation', [-1.6, -2.15, 0]));
    labels.push(L('Condenser', 'Cools gases; products condense', [1.3, -0.5, 0]));
    labels.push(L('Trap — organic compounds', 'Amino acids (glycine, alanine) found after a week', [0.6, -1.9, 0]));
    labels.push(L('Circulation of water vapour', 'Closed system', [-1.6, 0.6, 0]));
    return { g, labels };
  }
}));

function homoLimbs() {
  const g = H.grp(), labels = [];
  const limb = (x, scale, cols, name, bend) => { const s = scale; const p = [x, 0, 0]; g.add(H.rod([x, 1.5 * s, 0], [x + 0.2 * s, 0.4 * s, 0], 0.09 * s, cols[0])); g.add(H.rod([x + 0.2 * s, 0.4 * s, 0], [x + 0.05 * s, -0.6 * s, 0], 0.06 * s, cols[1])); g.add(H.rod([x + 0.35 * s, 0.4 * s, 0], [x + 0.2 * s, -0.6 * s, 0], 0.055 * s, cols[2])); for (let i = 0; i < 5; i++) g.add(H.sphere(0.06 * s, cols[3], [x - 0.05 * s + i * 0.09 * s, -0.75 * s, 0], { seg: 8 })); for (let i = 0; i < 5; i++) { const a = (i - 2) * bend; g.add(H.rod([x - 0.05 * s + i * 0.09 * s, -0.8 * s, 0], [x - 0.05 * s + i * 0.09 * s + Math.sin(a) * 0.4 * s, -0.8 * s - Math.cos(a) * 0.45 * s, 0], 0.03 * s, cols[4])); g.add(H.rod([x - 0.05 * s + i * 0.09 * s + Math.sin(a) * 0.4 * s, -0.8 * s - Math.cos(a) * 0.45 * s, 0], [x - 0.05 * s + i * 0.09 * s + Math.sin(a) * 0.7 * s, -0.8 * s - Math.cos(a) * 0.85 * s, 0], 0.025 * s, cols[4])); } g.add(H.text(name, { size: 0.16, pos: [x + 0.1, 1.9 * s, 0], color: C.white })); return p; };
  const cols = [C.orange, C.teal, C.blue, C.yellow, C.pink];
  limb(-2.7, 1.0, cols, 'Human', 0.25); limb(-1.0, 1.0, cols, 'Cheetah', 0.1); limb(0.7, 1.0, cols, 'Whale', 0.05); limb(2.4, 1.0, cols, 'Bat', 0.6);
  labels.push(L('Humerus', 'Same bone in all four — arm/flipper/wing', [-2.6, 1.0, 0]));
  labels.push(L('Radius & ulna', 'Forearm bones', [-2.4, -0.1, 0]));
  labels.push(L('Carpals', 'Wrist bones', [-2.5, -0.75, 0]));
  labels.push(L('Metacarpals & phalanges', 'Digits — elongated in bat wing', [2.4, -1.3, 0]));
  labels.push(L('Homologous organs', 'Same structure & origin, different function — divergent evolution', [0.7, -1.5, 0]));
  labels.push(L('Adaptive radiation', 'Common ancestor → different niches', [0.7, 1.3, 0]));
  return { g, labels, note: 'Homology: same anatomy/origin, different function (forelimbs; vertebrate hearts, brains; thorn of Bougainvillea & tendril of Cucurbita). Divergent evolution.' };
}
function homoPlants() {
  const g = H.grp(), labels = [];
  g.add(H.tube([[-2.2, -2, 0], [-2.1, -0.5, 0], [-2.0, 1.5, 0]], 0.07, C.dgreen));
  for (let i = 0; i < 3; i++) { const y = -1.2 + i * 1.0; g.add(H.extrude([[0, 0], [0.5, 0.25], [0.8, 0.7], [0.4, 1.1], [0, 0.9]], 0.02, C.leaf, [-2.05, y, 0], [0, 0.6, 0.2])); g.add(H.cone(0.05, 0.6, C.brown, [-1.85, y + 0.25, 0.1], [0, 0, -1.2])); }
  g.add(H.tube([[1.4, -2, 0], [1.5, -0.5, 0], [1.6, 1.5, 0]], 0.07, C.dgreen));
  for (let i = 0; i < 3; i++) { const y = -1.2 + i * 1.0; g.add(H.extrude([[0, 0], [0.6, 0.2], [0.9, 0.8], [0.3, 1.2], [-0.3, 0.9]], 0.02, C.green, [1.55, y, 0], [0, 0.5, 0.3])); g.add(H.helix(0.1, 1.0, 5, 0.02, C.lime, { axis: 'x', pos: [2.3, y + 0.45, 0.1] })); g.add(H.tube([[1.6, y + 0.3, 0], [1.85, y + 0.45, 0.05]], 0.02, C.lime)); }
  g.add(H.text('Bougainvillea', { size: 0.18, pos: [-2.0, 1.9, 0], color: C.white })); g.add(H.text('Cucurbita', { size: 0.18, pos: [1.6, 1.9, 0], color: C.white }));
  labels.push(L('Thorn (Bougainvillea)', 'Modified axillary bud — protection', [-1.6, -0.6, 0.1]));
  labels.push(L('Tendril (Cucurbita)', 'Modified axillary bud — climbing', [2.3, 0.25, 0.1]));
  labels.push(L('Same origin (axillary position)', 'Homologous — different function', [0, -2.2, 0]));
  return { g, labels, note: 'Thorn of Bougainvillea and tendril of Cucurbita: both arise in axillary position — homologous organs (divergent evolution).' };
}
function analogous() {
  const g = H.grp(), labels = [];
  // butterfly wing vs bird wing
  g.add(H.extrude([[0, 0], [1.4, 0.6], [2.0, 0.1], [1.4, -0.9], [0.4, -0.7]], 0.03, C.orange, [-3.0, 1.0, 0], null, { op: 0.9 }));
  g.add(H.extrude([[0, 0], [1.6, 0.5], [2.2, 0.0], [1.5, -0.4], [0.5, -0.5]], 0.03, C.grey, [0.5, 1.0, 0], null, { op: 0.9 })); g.add(H.rod([0.6, 1.0, 0.05], [1.9, 1.35, 0.05], 0.04, C.bone)); for (let i = 0; i < 6; i++) g.add(H.rod([0.9 + i * 0.22, 1.0 + i * 0.05, 0.05], [0.7 + i * 0.22, 0.55 + i * 0.03, 0.05], 0.015, C.white));
  // octopus eye vs mammal eye
  g.add(H.sphere(0.55, C.cyan, [-1.8, -1.2, 0], { op: 0.5 })); g.add(H.sphere(0.25, C.ink, [-1.8, -1.2, 0.35])); g.add(H.sphere(0.32, C.yellow, [-1.8, -1.2, 0.28], { op: 0.5 }));
  g.add(H.sphere(0.55, C.white, [1.8, -1.2, 0], { op: 0.6 })); g.add(H.sphere(0.25, C.ink, [1.8, -1.2, 0.35])); g.add(H.sphere(0.32, C.blue, [1.8, -1.2, 0.28], { op: 0.5 }));
  g.add(H.text('Butterfly wing', { size: 0.15, pos: [-2.0, 1.8, 0], color: C.white })); g.add(H.text('Bird wing', { size: 0.15, pos: [1.6, 1.8, 0], color: C.white })); g.add(H.text('Octopus eye', { size: 0.15, pos: [-1.8, -1.95, 0], color: C.white })); g.add(H.text('Mammal eye', { size: 0.15, pos: [1.8, -1.95, 0], color: C.white }));
  labels.push(L('Insect wing (chitinous membrane)', 'No bones — different anatomy', [-1.6, 0.9, 0]));
  labels.push(L('Bird wing (modified forelimb)', 'Bones + feathers', [1.6, 1.2, 0.05]));
  labels.push(L('Analogous organs', 'Different origin, similar function — convergent evolution', [0, -0.2, 0]));
  labels.push(L('Octopus eye vs mammal eye', 'Similar function, different structure', [-1.8, -1.2, 0.5]));
  labels.push(L('Other examples', 'Flippers of penguin & dolphin; sweet potato (root) & potato (stem)', [1.8, -1.2, 0.5]));
  return { g, labels, note: 'Analogy: different structure, same function — wings of butterfly & bird, eye of octopus & mammal, flippers of penguins & dolphins. Convergent evolution.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-6-3', unit: U7, ch: 'Ch 6 — Evolution', fig: 'Fig 6.3', title: 'Homologous vs analogous organs',
  desc: 'Homologous organs share structure and origin but differ in function (divergent evolution); analogous organs share function but differ in origin (convergent evolution). Both are evidence of evolution from comparative anatomy.',
  points: ['Homologous: forelimbs of whale, bat, cheetah, human — same bones; thorn & tendril from axillary buds.', 'Analogous: wings of butterfly & bird; eyes of octopus & mammal; flippers of penguins & dolphins; sweet potato & potato.', 'Adaptive radiation: Darwin\'s finches; Australian marsupials; convergent when radiations of different groups look alike.', 'Other evidences: fossils (palaeontology), embryology (rejected Haeckel), biochemical similarities, industrial melanism.'],
  variants: [{ name: 'Vertebrate forelimbs', build: homoLimbs }, { name: 'Plant thorn & tendril', build: homoPlants }, { name: 'Analogous organs', build: analogous }]
}));

reg(Object.assign({}, B12, {
  id: 'b12-6-4', unit: U7, ch: 'Ch 6 — Evolution', fig: 'Fig 6.4', title: 'Natural selection & the Hardy–Weinberg equilibrium',
  desc: 'When the frequency of alleles departs from Hardy–Weinberg expectation (p² + 2pq + q² = 1), evolution is occurring. Natural selection can be stabilising (more individuals acquire mean value), directional (peak shifts) or disruptive (two peaks).',
  points: ['Factors disturbing equilibrium: gene migration/flow, genetic drift (founder effect), mutation, genetic recombination, natural selection.', 'Stabilising: extremes eliminated, variation reduced. Directional: one extreme favoured. Disruptive: both extremes favoured, middle eliminated.', 'Hardy–Weinberg: allele frequencies constant across generations in a stable population.', 'Use the slider to morph the original curve into the selected type.'],
  slide: 'Selection',
  variants: [
    { name: 'Stabilising', slide: 'Select', build: () => selCurve('stab') },
    { name: 'Directional', slide: 'Select', build: () => selCurve('dir') },
    { name: 'Disruptive', slide: 'Select', build: () => selCurve('dis') }
  ]
}));
function selCurve(kind) {
  const g = H.grp(), labels = [];
  const gs = (x, c, w, a) => a * Math.exp(-Math.pow((x - c) / w, 2));
  const base = x => gs(x, 5, 1.8, 0.8);
  const target = kind === 'stab' ? (x => gs(x, 5, 0.9, 1.0)) : kind === 'dir' ? (x => gs(x, 7.2, 1.6, 0.85)) : (x => gs(x, 2.8, 1.0, 0.75) + gs(x, 7.2, 1.0, 0.75));
  const G = H.graph({ w: 4.8, h: 2.8, xr: [0, 10], yr: [0, 1.1], xl: 'Phenotype (trait value)', yl: 'Number of individuals', nx: 10, ny: 5, curves: [{ f: base, color: C.grey, dashed: true }] });
  g.add(G);
  const N = 60; const pts = []; for (let i = 0; i <= N; i++) { const x = i / N * 10; pts.push(G.map(x, base(x))); }
  const curveMesh = H.tube(pts, 0.04, kind === 'stab' ? C.green : kind === 'dir' ? C.orange : C.purple, { seg: 120, tension: 0.2, e: 0.5 }); g.add(curveMesh);
  const spheres = []; for (let i = 0; i <= N; i += 4) { const s = H.sphere(0.05, C.white, pts[i], { seg: 6 }); g.add(s); spheres.push([s, i]); }
  const slide = t => { const npts = []; for (let i = 0; i <= N; i++) { const x = i / N * 10; npts.push(G.map(x, lerp(base(x), target(x), t))); } const curve = new THREE.CatmullRomCurve3(npts.map(vec), false, 'catmullrom', 0.2); const geo = new THREE.TubeGeometry(curve, 120, 0.04, 8, false); curveMesh.geometry.dispose(); curveMesh.geometry = geo; spheres.forEach(([s, i]) => s.position.set(...npts[i])); };
  const mean = G.map(5, 0.82);
  labels.push(L('Original population (dashed)', 'Normal distribution of a trait', G.map(5, 0.8)));
  if (kind === 'stab') { labels.push(L('Stabilising selection', 'Extremes removed → narrower peak at same mean; more individuals near mean', G.map(5, 1.0))); labels.push(L('Reduced variation', 'e.g. human birth weight', G.map(2, 0.1))); }
  if (kind === 'dir') { labels.push(L('Directional selection', 'One extreme favoured → peak shifts in that direction', G.map(7.2, 0.85))); labels.push(L('Shift of mean', 'e.g. industrial melanism (dark moths after 1850s)', G.map(3, 0.1))); }
  if (kind === 'dis') { labels.push(L('Disruptive selection', 'Both extremes favoured; middle eliminated → two peaks', G.map(7.2, 0.75))); labels.push(L('Second peak', 'Population may split (polymorphism)', G.map(2.8, 0.75))); }
  labels.push(L('Mean phenotype', 'Trait average of original population', G.map(5, 0)));
  return { g, labels, slide };
}

/* ---------- Ch 7 Human Health & Disease ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-7-4', unit: U8, ch: 'Ch 7 — Human Health and Disease', fig: 'Fig 7.4', title: 'Structure of an antibody (H₂L₂)',
  desc: 'Each antibody has four polypeptide chains — two short light (L) chains and two long heavy (H) chains — joined by disulphide bonds, giving a Y-shape (H₂L₂). Antigen binds at the variable regions at the tips of the arms.',
  points: ['Classes: IgA, IgM, IgE, IgG, IgD. IgA in colostrum; IgE in allergy; IgG crosses placenta.', 'B-lymphocytes produce antibodies (humoral / antibody-mediated immunity); T cells give cell-mediated immunity.', 'Primary response (low intensity) vs secondary/anamnestic response (high) — memory cells.', 'Antigen-binding site = variable regions of H + L chains; constant region defines class (Fc).'],
  explode: 'Explode',
  build() {
    const g = H.grp(), labels = [];
    const arm = (s) => { const a = H.grp(); a.add(H.tube([[0, -0.2, 0], [s * 0.4, 0.5, 0], [s * 1.2, 1.4, 0], [s * 1.9, 2.2, 0]], 0.13, C.blue, { seg: 24 })); a.add(H.tube([[s * 0.5, 0.35, 0.28], [s * 1.25, 1.2, 0.28], [s * 1.95, 2.0, 0.28]], 0.11, C.cyan, { seg: 20 })); for (let i = 0; i < 2; i++) a.add(H.rod([s * (0.7 + i * 0.5), 0.6 + i * 0.5, 0.05], [s * (0.75 + i * 0.5), 0.55 + i * 0.5, 0.2], 0.03, C.yellow)); a.add(H.ell(0.22, 0.22, 0.22, C.orange, [s * 1.95, 2.25, 0.15], { op: 0.5 })); return a; };
    g.add(H.ex(arm(-1), -0.6, 0.4, 0)); g.add(H.ex(arm(1), 0.6, 0.4, 0));
    const stem = H.grp(); stem.add(H.tube([[-0.12, -0.2, 0], [-0.14, -1.2, 0], [-0.12, -2.4, 0]], 0.13, C.blue, { seg: 10 })); stem.add(H.tube([[0.12, -0.2, 0], [0.14, -1.2, 0], [0.12, -2.4, 0]], 0.13, C.blue, { seg: 10 })); stem.add(H.rod([-0.12, -0.5, 0], [0.12, -0.5, 0], 0.035, C.yellow)); stem.add(H.rod([-0.12, -0.8, 0], [0.12, -0.8, 0], 0.035, C.yellow)); g.add(H.ex(stem, 0, -0.8, 0));
    g.add(H.sphere(0.24, C.red, [-2.15, 2.5, 0.15], { e: 0.6 })); g.add(H.sphere(0.24, C.red, [2.15, 2.5, 0.15], { e: 0.6 }));
    g.add(H.line([[-2.6, 1.15, 0.5], [2.6, 1.15, 0.5]], C.grey, { dashed: true }));
    g.add(H.text('Variable region (V)', { size: 0.15, pos: [2.9, 1.7, 0.5], color: C.grey })); g.add(H.text('Constant region (C)', { size: 0.15, pos: [2.9, 0.6, 0.5], color: C.grey }));
    labels.push(L('Heavy chain (H) ×2', 'Long chains forming the stem and inner arms', [-1.2, 1.4, 0]));
    labels.push(L('Light chain (L) ×2', 'Short chains on the outer arms', [1.25, 1.2, 0.28]));
    labels.push(L('Disulphide bonds (S–S)', 'Link H–H and H–L chains', [0, -0.5, 0]));
    labels.push(L('Antigen-binding site', 'Variable regions of H & L chains — specific to one antigen', [-1.95, 2.25, 0.15]));
    labels.push(L('Antigen', 'Epitope fits the binding site', [2.15, 2.5, 0.15]));
    labels.push(L('Hinge region', 'Flexible junction of arms & stem', [0, -0.2, 0]));
    labels.push(L('Fc (constant) region', 'Determines class: IgG, IgA, IgM, IgE, IgD', [0.12, -1.8, 0]));
    labels.push(L('Fab fragments (arms)', 'Antigen-binding fragments', [1.9, 2.2, -0.2]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-7-6', unit: U8, ch: 'Ch 7 — Human Health and Disease', fig: 'Fig 7.6', title: 'Life cycle of Plasmodium (malaria)',
  desc: 'Plasmodium enters the human body as sporozoites through the bite of an infected female Anopheles. They multiply in liver cells, then in RBCs, causing rupture and release of the toxin haemozoin (chills & fever). Gametocytes are picked up by mosquitoes where fertilisation and development occur.',
  points: ['Two hosts: human (asexual cycle) and female Anopheles mosquito (sexual cycle) — vector.', 'P. vivax, P. malariae, P. falciparum (most serious, malignant malaria).', 'Sporozoite = infective stage for humans; gametocytes = infective stage for mosquito.', 'Haemozoin (toxic substance) released from ruptured RBCs → chills & high fever every 3–4 days.'],
  build() {
    const g = H.grp(), labels = [];
    const cy = H.cycle({ R: 2.2, ts: 0.15, nodes: [
      { name: 'Sporozoites injected', color: C.yellow, step: 'mosquito bite' },
      { name: 'Liver cells', color: C.orange, step: 'multiply' },
      { name: 'Merozoites', color: C.red, step: 'infect RBCs' },
      { name: 'RBC rupture → haemozoin', color: C.pink, step: 'chills & fever' },
      { name: 'Gametocytes', color: C.purple, step: 'mosquito sucks blood' },
      { name: 'Fertilisation in gut', color: C.blue, step: 'zygote → oocyst' },
      { name: 'Sporozoites in salivary gland', color: C.cyan, step: 'ready to infect' }
    ], a0: PI / 2, ac: '#94a3b8' });
    g.add(cy); const np = cy.nodePos;
    g.add(H.plane(6.6, 3.6, C.red, [0, 1.2, -0.3], null, { op: 0.08, dw: false })); g.add(H.plane(6.6, 2.6, C.blue, [0, -2.0, -0.3], null, { op: 0.08, dw: false }));
    g.add(H.text('HUMAN HOST (asexual)', { size: 0.18, pos: [0, 0.4, 0], color: C.red })); g.add(H.text('MOSQUITO (sexual)', { size: 0.18, pos: [0, -0.5, 0], color: C.blue }));
    labels.push(L('Sporozoites (infective stage)', 'Injected with saliva by female Anopheles', np[0]));
    labels.push(L('Liver stage', 'Parasites reproduce asexually in liver cells', np[1]));
    labels.push(L('Merozoites attack RBCs', 'Multiply inside red blood cells', np[2]));
    labels.push(L('RBC rupture — haemozoin', 'Toxin causes chills & recurring high fever', np[3]));
    labels.push(L('Gametocytes', 'Sexual stages formed in RBCs; taken up by mosquito', np[4]));
    labels.push(L('Fertilisation & development', 'In mosquito gut → oocyst → sporozoites', np[5]));
    labels.push(L('Salivary glands of mosquito', 'Sporozoites migrate here — cycle repeats', np[6]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-7-7', unit: U8, ch: 'Ch 7 — Human Health and Disease', fig: 'Fig 7.7', title: 'Replication of retrovirus (HIV)',
  desc: 'HIV (a retrovirus) enters macrophages; its RNA is copied into DNA by reverse transcriptase; the viral DNA integrates into the host genome and directs production of new viruses. Macrophages act as an HIV factory; helper T cells are infected and depleted → AIDS.',
  points: ['Transmission: sexual contact, infected blood/needles, mother→child; not by touch or insects.', 'Diagnosis: ELISA. Treatment: anti-retroviral drugs (prolong life only).', 'Progressive decrease of helper T lymphocytes → opportunistic infections (Mycobacterium, viruses, fungi, Toxoplasma).', 'Reverse transcriptase: RNA → DNA (central dogma exception).'],
  build() {
    const g = H.grp(), labels = [];
    // virus
    const vpos = [-2.6, 1.6, 0];
    g.add(H.sphere(0.55, C.purple, vpos, { op: 0.35, side: THREE.DoubleSide, dw: false })); for (let i = 0; i < 14; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * (i + 0.5) / 14); g.add(H.sphere(0.07, C.pink, [vpos[0] + 0.58 * Math.sin(b) * Math.cos(a), vpos[1] + 0.58 * Math.cos(b), vpos[2] + 0.58 * Math.sin(b) * Math.sin(a)], { seg: 6 })); }
    g.add(H.cone(0.3, 0.6, C.orange, vpos, [0, 0, 1.2], { op: 0.8 })); g.add(H.tube([[vpos[0] - 0.15, vpos[1] - 0.1, 0.1], [vpos[0], vpos[1] + 0.15, 0.1], [vpos[0] + 0.15, vpos[1] - 0.1, 0.1]], 0.03, C.dna)); g.add(H.tube([[vpos[0] - 0.15, vpos[1] - 0.2, -0.1], [vpos[0], vpos[1] + 0.05, -0.1], [vpos[0] + 0.15, vpos[1] - 0.2, -0.1]], 0.03, C.dna));
    // host cell
    g.add(H.sphere(2.0, C.mem, [0.6, -0.4, 0], { op: 0.12, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(2.0, C.mem, [0.6, -0.4, 0], { wire: true, op: 0.15 }));
    g.add(H.sphere(0.8, C.nuc, [1.2, -0.7, 0], { op: 0.3, side: THREE.DoubleSide, dw: false }));
    // steps
    g.add(H.arrow([-2.1, 1.3, 0], [-1.4, 0.7, 0], C.white, { r: 0.02 }));
    g.add(H.tube([[-1.3, 0.55, 0.1], [-1.1, 0.8, 0.1], [-0.9, 0.55, 0.1]], 0.04, C.dna)); g.add(H.text('viral RNA', { size: 0.13, pos: [-1.1, 1.05, 0.1], color: C.dna }));
    g.add(H.sphere(0.2, C.amber, [-0.5, 0.35, 0.1], { e: 0.6 })); g.add(H.text('reverse transcriptase', { size: 0.12, pos: [-0.5, 0.05, 0.1], color: C.amber }));
    g.add(H.arrow([-0.85, 0.55, 0.1], [0.2, 0.25, 0.1], C.white, { r: 0.015, head: 0.1 }));
    g.add(dnaDouble(0.9, 1.2, 0.12, [0.6, 0.15, 0.1], { r: 0.03, axis: 'x' })); g.add(H.text('viral DNA', { size: 0.13, pos: [0.6, 0.5, 0.1], color: C.dna2 }));
    g.add(H.arrow([0.8, -0.05, 0.1], [1.1, -0.35, 0.1], C.white, { r: 0.015, head: 0.1 }));
    g.add(dnaDouble(0.9, 1.2, 0.1, [1.2, -0.7, 0.1], { r: 0.03, axis: 'x', c1: C.green, c2: C.lime })); g.add(H.text('integrated into host DNA', { size: 0.12, pos: [1.2, -1.15, 0.1], color: C.green }));
    g.add(H.arrow([1.2, -0.45, 0.2], [0.2, -1.4, 0.2], C.white, { r: 0.015, head: 0.1 })); g.add(H.tube([[0.1, -1.55, 0.2], [-0.1, -1.3, 0.2], [-0.3, -1.55, 0.2]], 0.04, C.dna)); g.add(H.text('viral RNA + proteins', { size: 0.12, pos: [-0.3, -1.85, 0.2], color: C.dna }));
    for (let i = 0; i < 3; i++) { const p = [-1.5 + i * 0.3, -1.3 - i * 0.25, 0.3]; g.add(H.sphere(0.2, C.purple, p, { op: 0.5 })); }
    g.add(H.arrow([-1.9, -1.6, 0.3], [-2.7, -2.0, 0.3], C.white, { r: 0.02, head: 0.12 })); g.add(H.text('new viruses bud off', { size: 0.13, pos: [-2.7, -2.3, 0.3], color: C.white }));
    labels.push(L('HIV particle', 'Envelope with gp120 spikes; conical capsid; 2 RNA strands + reverse transcriptase', vpos));
    labels.push(L('Entry into macrophage', 'Virus binds & enters the host cell', [-1.4, 0.7, 0]));
    labels.push(L('Viral RNA genome', 'Single-stranded RNA released', [-1.1, 0.8, 0.1]));
    labels.push(L('Reverse transcription', 'RNA → viral DNA (reverse transcriptase)', [-0.5, 0.35, 0.1]));
    labels.push(L('Integration into host DNA', 'Provirus in nucleus directs synthesis of virus parts', [1.2, -0.7, 0.1]));
    labels.push(L('New viral RNA & proteins', 'Made by host machinery', [-0.1, -1.4, 0.2]));
    labels.push(L('New viruses released', 'Macrophage = HIV factory; helper T cells then infected & killed', [-1.5, -1.3, 0.3]));
    labels.push(L('Host cell (macrophage / helper T)', 'Depletion of helper T cells → immunodeficiency', [0.6, 1.5, 0]));
    return { g, labels };
  }
}));

/* ---------- Ch 8 Microbes ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-8-6', unit: U8, ch: 'Ch 8 — Microbes in Human Welfare', fig: 'Fig 8.6', title: 'Biogas plant',
  desc: 'Cattle dung (gobar) slurry is fed into a concrete digester tank where methanogenic bacteria (e.g. Methanobacterium) anaerobically produce biogas (CH₄ + CO₂ + H₂). A floating gas holder collects the gas; spent slurry is removed as manure.',
  points: ['Methanogens are anaerobic; also found in rumen of cattle — dung rich in them.', 'Biogas: mainly methane + CO₂ + H₂; used for cooking and lighting.', 'Technology developed by IARI & KVIC (Khadi and Village Industries Commission).', 'Spent slurry is used as fertiliser.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.plane(8, 4, C.brown, [0, -0.2, -0.8], null, { op: 0.15, dw: false })); g.add(H.line([[-4, 0.2, -0.7], [4, 0.2, -0.7]], C.grey, { dashed: true }));
    g.add(H.cyl(1.5, 1.5, 3.2, C.grey, [0, -1.4, 0], null, { op: 0.45, seg: 32 }));
    g.add(H.cyl(1.35, 1.35, 1.8, '#78350f', [0, -2.0, 0], null, { op: 0.85, seg: 32 }));
    g.add(H.cyl(1.3, 1.3, 1.2, C.amber, [0, 0.4, 0], null, { op: 0.5, seg: 32 })); g.add(H.cyl(1.3, 1.3, 0.1, C.amber, [0, 1.0, 0], null, { seg: 32 }));
    g.add(H.rod([0, 1.05, 0], [0, 2.0, 0], 0.08, C.grey)); g.add(H.tube([[0, 2.0, 0], [0.8, 2.0, 0], [2.5, 2.0, 0]], 0.06, C.grey)); g.add(H.cone(0.12, 0.25, C.grey, [2.6, 2.0, 0], [0, 0, -PI / 2]));
    g.add(H.rod([-1.9, 0.5, 0], [-1.9, -2.2, 0], 0.15, C.grey)); g.add(H.tube([[-1.9, -2.2, 0], [-1.6, -2.5, 0], [-1.2, -2.6, 0]], 0.15, C.grey));
    g.add(H.cyl(0.6, 0.6, 0.5, '#78350f', [-1.9, 0.75, 0], null, { seg: 20, op: 0.9 }));
    g.add(H.rod([1.9, 0.3, 0], [1.9, -1.6, 0], 0.15, C.grey)); g.add(H.tube([[1.2, -1.7, 0], [1.6, -1.7, 0], [1.9, -1.6, 0]], 0.15, C.grey));
    g.add(H.cyl(0.6, 0.6, 0.4, '#a16207', [1.9, 0.5, 0], null, { seg: 20, op: 0.9 }));
    const rng = H.rng(31); for (let i = 0; i < 20; i++) g.add(H.sphere(0.04 + rng() * 0.05, C.cyan, [(rng() - 0.5) * 2.4, -1.4 + rng() * 1.2, (rng() - 0.5) * 2.4], { seg: 6, op: 0.6 }));
    labels.push(L('Digester (concrete tank, 10–15 ft deep)', 'Underground; anaerobic digestion by methanogens', [0, -1.4, 1.5]));
    labels.push(L('Dung slurry (bio-waste)', 'Cattle dung + water', [0, -2.0, 1.35]));
    labels.push(L('Floating gas holder', 'Rises as gas accumulates', [0, 0.6, 1.3]));
    labels.push(L('Biogas outlet pipe', 'CH₄-rich gas to kitchens & lamps', [2.5, 2.0, 0]));
    labels.push(L('Mixing tank & inlet', 'Slurry fed through inlet chamber', [-1.9, 0.75, 0]));
    labels.push(L('Outlet (spent slurry)', 'Removed as fertiliser', [1.9, 0.5, 0]));
    labels.push(L('Ground level', 'Digester is below ground', [3.0, 0.2, -0.7]));
    labels.push(L('Biogas bubbles', 'Methane + CO₂ + H₂', [0.6, -0.9, 0.5]));
    return { g, labels };
  }
}));


/* ---------- Ch 9 Biotechnology: Principles ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-9-2', unit: U9, ch: 'Ch 9 — Biotechnology: Principles and Processes', fig: 'Fig 9.2', title: 'Gel electrophoresis',
  desc: 'DNA fragments (negatively charged) move toward the anode through an agarose gel matrix under an electric field. Smaller fragments move farther. Bands are seen after ethidium bromide staining under UV; elution recovers the DNA.',
  points: ['Sieving effect of agarose: fragments separate by size; smaller = faster/farther.', 'Wells at the cathode (−) end; DNA migrates to anode (+).', 'Visualised as orange bands under UV after ethidium bromide staining.', 'Elution: cutting out bands and extracting DNA for cloning.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.box(6, 0.35, 3.6, C.dgrey, [0, -0.3, 0], null, { op: 0.6 }));
    g.add(H.box(4.4, 0.25, 3.0, C.cyan, [0, 0.0, 0], null, { op: 0.35 }));
    g.add(H.box(6, 0.5, 3.6, C.blue, [0, -0.1, 0], null, { op: 0.12, dw: false }));
    for (let i = 0; i < 4; i++) g.add(H.box(0.25, 0.28, 0.4, C.ink, [-1.85, 0.03, -1.05 + i * 0.7], null, { op: 0.9 }));
    const lanes = [[0.4, 0.9, 1.5, 2.1, 2.6], [0.9, 2.1], [0.6, 1.5], [0.4, 1.2, 2.6]];
    lanes.forEach((b, i) => b.forEach(x => g.add(H.box(0.08, 0.28, 0.4, C.orange, [-1.85 + x * 1.4, 0.04, -1.05 + i * 0.7], null, { e: 0.9 }))));
    g.add(H.box(0.12, 0.6, 3.6, C.ink, [-2.9, 0.0, 0])); g.add(H.text('−', { size: 0.35, bold: true, pos: [-2.9, 0.55, 0], color: C.white }));
    g.add(H.box(0.12, 0.6, 3.6, C.red, [2.9, 0.0, 0])); g.add(H.text('+', { size: 0.35, bold: true, pos: [2.9, 0.55, 0], color: C.white }));
    g.add(H.arrow([-1.2, 0.5, 1.6], [1.6, 0.5, 1.6], C.yellow, { r: 0.02 })); g.add(H.text('DNA migrates →', { size: 0.15, pos: [0.2, 0.75, 1.6], color: C.yellow }));
    g.add(H.box(1.0, 0.5, 0.6, C.grey, [0, 1.6, -2.4])); g.add(H.text('power', { size: 0.13, pos: [0, 1.6, -2.05], top: true })); g.add(H.line([[-0.5, 1.6, -2.4], [-2.9, 0.3, -1.8]], C.ink)); g.add(H.line([[0.5, 1.6, -2.4], [2.9, 0.3, -1.8]], C.red));
    labels.push(L('Wells (loading)', 'DNA samples loaded at cathode (−) end', [-1.85, 0.2, -1.05]));
    labels.push(L('Agarose gel', 'Matrix acts as a sieve', [0, 0.12, -1.5]));
    labels.push(L('Cathode (−)', 'DNA is negatively charged — moves away', [-2.9, 0.3, 0]));
    labels.push(L('Anode (+)', 'DNA fragments move toward it', [2.9, 0.3, 0]));
    labels.push(L('Smallest fragment — farthest', 'Moves fastest through pores', [-1.85 + 2.6 * 1.4, 0.04, -1.05 + 3 * 0.7]));
    labels.push(L('Largest fragment — near well', 'Slow migration', [-1.85 + 0.4 * 1.4, 0.04, -1.05]));
    labels.push(L('DNA bands (orange under UV)', 'Stained with ethidium bromide', [-1.85 + 1.5 * 1.4, 0.04, -1.05]));
    labels.push(L('Buffer solution', 'Conducts current across the gel', [0, -0.1, 1.7]));
    labels.push(L('Power supply', 'Creates the electric field', [0, 1.6, -2.4]));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-9-4', unit: U9, ch: 'Ch 9 — Biotechnology: Principles and Processes', fig: 'Fig 9.4', title: 'pBR322 cloning vector',
  desc: 'pBR322 is an E. coli plasmid vector with an origin of replication (ori), two selectable markers (ampᴿ, tetᴿ), a rop gene, and unique restriction sites (HindIII, EcoRI, ClaI, BamHI, SalI, PvuI, PstI, PvuII). Insertion into a site inside a marker gene inactivates it (insertional inactivation).',
  points: ['ori: sequence where replication starts; controls copy number.', 'Selectable markers: ampᴿ (ampicillin resistance) & tetᴿ (tetracycline resistance) — distinguish transformants.', 'BamHI & SalI lie in tetᴿ; PvuI & PstI in ampᴿ; rop codes for proteins involved in replication of plasmid.', 'Cloning site chosen so recombinant loses one resistance — selection by replica plating (alternative: lacZ blue-white).'],
  build() {
    const g = H.grp(), labels = [];
    const R = 2.0;
    g.add(H.torus(R, 0.09, C.dna, null, null, { tseg: 80 }));
    const arc = (a0, a1, col, txt, out = 0.3) => { g.add(H.torus(R, 0.13, col, null, null, { arc: a1 - a0, rot: [0, 0, a0], tseg: 40 })); const m = (a0 + a1) / 2; g.add(H.text(txt, { size: 0.2, bold: true, pos: [(R - 0.55) * Math.cos(m), (R - 0.55) * Math.sin(m), 0.1], color: col })); return [R * Math.cos(m), R * Math.sin(m), 0.1]; };
    const a = d => deg(d);
    const amp = arc(a(150), a(215), C.green, 'ampᴿ'); const tet = arc(a(5), a(95), C.orange, 'tetᴿ'); const rop = arc(a(265), a(290), C.purple, 'rop'); const ori = arc(a(300), a(325), C.yellow, 'ori');
    const site = (d, name, col = C.white, out = 0.45) => { const p = [R * Math.cos(a(d)), R * Math.sin(a(d)), 0]; g.add(H.sphere(0.1, col, p, { e: 0.8 })); g.add(H.rod(p, [(R + 0.35) * Math.cos(a(d)), (R + 0.35) * Math.sin(a(d)), 0], 0.02, col)); g.add(H.text(name, { size: 0.16, pos: [(R + out + 0.25) * Math.cos(a(d)), (R + out + 0.25) * Math.sin(a(d)), 0.05], color: col })); return p; };
    const h3 = site(95, 'HindIII'), ec = site(105, 'EcoRI'), cl = site(114, 'ClaI'), bam = site(60, 'BamHI'), sal = site(35, 'SalI'), pv1 = site(200, 'PvuI'), pst = site(185, 'PstI'), pv2 = site(255, 'PvuII');
    g.add(H.text('pBR322', { size: 0.3, bold: true, pos: [0, 0.2, 0] })); g.add(H.text('4361 bp', { size: 0.16, pos: [0, -0.2, 0], color: C.grey }));
    labels.push(L('ori (origin of replication)', 'Replication starts here; determines copy number', ori));
    labels.push(L('ampᴿ gene', 'Ampicillin resistance — selectable marker; contains PvuI & PstI sites', amp));
    labels.push(L('tetᴿ gene', 'Tetracycline resistance — selectable marker; contains BamHI & SalI sites', tet));
    labels.push(L('rop', 'Codes for proteins involved in plasmid replication', rop));
    labels.push(L('EcoRI', 'Unique recognition site (GAATTC) outside marker genes', ec));
    labels.push(L('HindIII / ClaI', 'Other unique sites near EcoRI', h3));
    labels.push(L('BamHI (in tetᴿ)', 'Insert here → tetᴿ inactivated; select ampᴿ tetˢ colonies', bam));
    labels.push(L('SalI (in tetᴿ)', 'Also inactivates tetᴿ', sal));
    labels.push(L('PstI / PvuI (in ampᴿ)', 'Insert here → ampᴿ inactivated', pst));
    labels.push(L('PvuII', 'Site near rop', pv2));
    return { g, labels };
  }
}));

function pcrStep(k) {
  const g = H.grp(), labels = [];
  const strand = (y, col, x0 = -2.4, x1 = 2.4) => g.add(H.rod([x0, y, 0], [x1, y, 0], 0.06, col));
  const rungs = (y0, y1, x0 = -2.4, x1 = 2.4) => { for (let x = x0 + 0.15; x < x1; x += 0.3) g.add(H.rod([x, y0, 0], [x, y1, 0], 0.02, C.grey)); };
  if (k === 0) {
    strand(0.7, C.dna); strand(0.2, C.dna2); rungs(0.65, 0.25);
    g.add(H.arrow([0, -0.1, 0], [0, -0.7, 0], C.white, { r: 0.02 })); g.add(H.text('94 °C — heat', { size: 0.18, pos: [0.9, -0.4, 0], color: C.red }));
    strand(-1.1, C.dna); strand(-2.0, C.dna2);
    g.add(H.text("5′", { size: 0.14, pos: [-2.7, 0.7, 0] })); g.add(H.text("3′", { size: 0.14, pos: [2.7, 0.7, 0] })); g.add(H.text("3′", { size: 0.14, pos: [-2.7, 0.2, 0] })); g.add(H.text("5′", { size: 0.14, pos: [2.7, 0.2, 0] }));
    labels.push(L('Double-stranded target DNA', 'Template to be amplified', [0, 0.45, 0]));
    labels.push(L('Denaturation (94 °C)', 'Hydrogen bonds break → two single strands', [0, -0.4, 0]));
    labels.push(L('Separated single strands', 'Each serves as template', [0, -1.55, 0]));
    return { g, labels, note: 'Step 1 Denaturation: high temperature (~94 °C) separates the two DNA strands.' };
  }
  if (k === 1) {
    strand(0.8, C.dna); strand(-0.8, C.dna2);
    g.add(H.rod([1.2, 0.5, 0], [2.2, 0.5, 0], 0.06, C.yellow)); rungs(0.75, 0.55, 1.2, 2.2);
    g.add(H.rod([-2.2, -0.5, 0], [-1.2, -0.5, 0], 0.06, C.yellow)); rungs(-0.55, -0.75, -2.2, -1.2);
    g.add(H.text('50–60 °C', { size: 0.18, pos: [0, 0, 0], color: C.blue }));
    labels.push(L('Primers (2 sets of oligonucleotides)', 'Chemically synthesised; complementary to regions flanking the target', [1.7, 0.5, 0]));
    labels.push(L('Annealing (~50–60 °C)', 'Primers hydrogen-bond to their complementary sequences', [0, 0, 0]));
    labels.push(L('Template strand (denatured)', 'Single-stranded', [0, 0.8, 0]));
    labels.push(L('Second primer on other strand', 'Defines the other end of the amplified segment', [-1.7, -0.5, 0]));
    return { g, labels, note: 'Step 2 Annealing: primers anneal to the template strands at ~50–60 °C.' };
  }
  if (k === 2) {
    strand(0.8, C.dna); strand(-0.8, C.dna2);
    g.add(H.rod([-2.4, 0.5, 0], [2.2, 0.5, 0], 0.06, C.lime)); rungs(0.75, 0.55, -2.4, 2.2); g.add(H.rod([2.2, 0.5, 0], [1.2, 0.5, 0], 0.065, C.yellow));
    g.add(H.rod([-2.2, -0.5, 0], [2.4, -0.5, 0], 0.06, C.lime)); rungs(-0.55, -0.75, -2.2, 2.4); g.add(H.rod([-2.2, -0.5, 0], [-1.2, -0.5, 0], 0.065, C.yellow));
    g.add(H.sphere(0.26, C.orange, [-2.3, 0.55, 0.2], { e: 0.5 })); g.add(H.sphere(0.26, C.orange, [2.3, -0.45, 0.2], { e: 0.5 }));
    g.add(H.arrow([-1.0, 0.3, 0.2], [-2.0, 0.3, 0.2], C.white, { r: 0.012, head: 0.1 })); g.add(H.arrow([1.0, -0.3, 0.2], [2.0, -0.3, 0.2], C.white, { r: 0.012, head: 0.1 }));
    g.add(H.text('72 °C', { size: 0.18, pos: [0, 0, 0], color: C.red }));
    labels.push(L('Taq DNA polymerase', 'From Thermus aquaticus — thermostable; extends primers 5′→3′', [-2.3, 0.55, 0.2]));
    labels.push(L('Extension (72 °C)', 'dNTPs added to 3′ end of primer using template', [0, 0, 0]));
    labels.push(L('New strand', 'Complementary copy synthesised', [0, 0.5, 0]));
    labels.push(L('Primer (incorporated)', 'Becomes part of new strand', [1.7, 0.5, 0]));
    return { g, labels, note: 'Step 3 Extension: Taq polymerase extends primers at 72 °C using dNTPs → two copies. Repeat ~30 cycles → ~billion copies.' };
  }
  // overview: exponential amplification tree
  const lvl = (y, n, w) => { for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; g.add(H.rod([x - 0.35, y + 0.08, 0], [x + 0.35, y + 0.08, 0], 0.04, C.dna)); g.add(H.rod([x - 0.35, y - 0.08, 0], [x + 0.35, y - 0.08, 0], 0.04, C.dna2)); if (y > -2) { g.add(H.line([[x, y - 0.15, 0], [x - w / n / 4, y - 0.85, 0]], C.grey)); g.add(H.line([[x, y - 0.15, 0], [x + w / n / 4, y - 0.85, 0]], C.grey)); } } };
  lvl(1.8, 1, 1); lvl(0.8, 2, 2.4); lvl(-0.2, 4, 4.8); lvl(-1.2, 8, 6.4); lvl(-2.2, 16, 7.2);
  g.add(H.text('1 → 2 → 4 → 8 → 16 → … 2ⁿ', { size: 0.18, pos: [0, 2.4, 0], color: C.yellow }));
  labels.push(L('Cycle 1', 'Denaturation → annealing → extension', [0, 1.8, 0]));
  labels.push(L('Exponential amplification', 'n cycles → 2ⁿ copies; ~30 cycles ≈ 10⁹ copies', [0, -0.2, 0]));
  labels.push(L('Thermal cycler', 'Automates temperature cycling', [-3.0, 0.8, 0]));
  labels.push(L('Uses', 'Gene detection, pathogen diagnosis (HIV, TB), amplifying genes for cloning', [3.0, -1.2, 0]));
  return { g, labels, note: 'PCR (Kary Mullis): repeated cycles amplify a DNA segment a billion-fold using primers, Taq polymerase and dNTPs.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-9-6', unit: U9, ch: 'Ch 9 — Biotechnology: Principles and Processes', fig: 'Fig 9.6', title: 'Polymerase Chain Reaction (PCR)',
  desc: 'PCR amplifies a gene of interest in vitro: denaturation (94 °C), annealing of primers (50–60 °C) and extension by thermostable Taq DNA polymerase (72 °C); ~30 cycles give about a billion copies.',
  points: ['Taq polymerase from Thermus aquaticus withstands the denaturation temperature.', 'Primers: two sets of small chemically synthesised oligonucleotides complementary to the target flanks.', 'Applications: amplifying DNA for cloning, detecting pathogens, genetic disorders, forensics.', 'dNTPs (deoxynucleoside triphosphates) provide nucleotides + energy.'],
  variants: [{ name: 'Denaturation', build: () => pcrStep(0) }, { name: 'Annealing', build: () => pcrStep(1) }, { name: 'Extension', build: () => pcrStep(2) }, { name: 'Amplification', build: () => pcrStep(3) }]
}));

function bioreactor(sparged) {
  const g = H.grp(), labels = [];
  g.add(H.cyl(1.4, 1.4, 4.0, C.grey, [0, 0, 0], null, { op: 0.25, side: THREE.DoubleSide, open: true, seg: 32, dw: false }));
  g.add(H.disc(1.4, C.grey, [0, -2.0, 0], [PI / 2, 0, 0], { op: 0.6 })); g.add(H.torus(1.4, 0.06, C.grey, [0, 2.0, 0], [PI / 2, 0, 0]));
  g.add(H.cyl(1.3, 1.3, 2.8, C.amber, [0, -0.55, 0], null, { op: 0.35, seg: 32, dw: false }));
  g.add(H.box(0.6, 0.5, 0.6, C.dgrey, [0, 2.4, 0])); g.add(H.text('motor', { size: 0.13, pos: [0, 2.4, 0.35], top: true }));
  g.add(H.rod([0, 2.15, 0], [0, -1.6, 0], 0.06, C.white));
  for (const y of [-1.4, -0.2]) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.add(H.box(0.6, 0.2, 0.06, C.cyan, [0.35 * Math.cos(a), y, 0.35 * Math.sin(a)], [0, -a, 0.4])); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; g.add(H.box(0.12, 2.6, 0.06, C.grey, [1.3 * Math.cos(a), -0.6, 1.3 * Math.sin(a)], [0, -a, 0], { op: 0.8 })); }
  g.add(H.box(0.9, 0.08, 0.4, C.white, [0, 1.0, 0], [0, 0, 0.3])); g.add(H.box(0.9, 0.08, 0.4, C.white, [0, 1.0, 0], [0, 0, -0.3]));
  g.add(H.tube([[-1.4, 1.5, 0], [-2.0, 1.5, 0]], 0.05, C.red)); g.add(H.tube([[-1.4, 1.1, 0], [-2.0, 1.1, 0]], 0.05, C.blue)); g.add(H.tube([[1.4, 1.5, 0], [2.0, 1.5, 0]], 0.05, C.green));
  g.add(H.rod([0.9, 2.3, 0], [0.9, 0.2, 0], 0.03, C.yellow)); g.add(H.rod([-0.9, 2.3, 0], [-0.9, 0.2, 0], 0.03, C.orange));
  g.add(H.tube([[1.4, -1.8, 0], [2.0, -1.8, 0], [2.0, -2.4, 0]], 0.05, C.teal));
  g.add(H.tube([[1.4, 0.0, 0], [2.1, 0.0, 0]], 0.04, C.purple));
  g.add(H.tube([[0, 2.0, 0.5], [0, 2.6, 0.5]], 0.04, C.grey)); g.add(H.cone(0.08, 0.15, C.grey, [0, 2.7, 0.5]));
  if (sparged) { g.add(H.torus(0.7, 0.05, C.blue, [0, -1.85, 0], [PI / 2, 0, 0])); g.add(H.tube([[-1.4, -1.5, 0], [-0.7, -1.7, 0], [-0.7, -1.85, 0]], 0.05, C.blue)); const rng = H.rng(5); for (let i = 0; i < 40; i++) g.add(H.sphere(0.04 + rng() * 0.05, C.cyan, [(rng() - 0.5) * 2.2, -1.8 + rng() * 2.6, (rng() - 0.5) * 2.2], { seg: 6, op: 0.6 })); }
  labels.push(L('Stainless steel vessel (100–1000 L)', 'Large volume culture for product', [-1.4, 0.4, 0.5]));
  labels.push(L('Motor', 'Drives the stirrer shaft', [0, 2.4, 0.3]));
  labels.push(L('Agitator (impeller) system', 'Mixes contents evenly; keeps oxygen available throughout', [0.35, -0.2, 0.35]));
  labels.push(L('Curved bottom', 'Better mixing', [0, -2.0, 0.7]));
  labels.push(L('Baffles', 'Improve turbulence', [1.3 * Math.cos(PI / 4), -0.6, 1.3 * Math.sin(PI / 4)]));
  labels.push(L('Foam breaker', 'Controls foam on the surface', [0, 1.0, 0.3]));
  labels.push(L('Steam inlet / sterile air', 'Sterilisation; oxygen delivery', [-2.0, 1.5, 0]));
  labels.push(L('Acid / base inlet', 'pH control', [-2.0, 1.1, 0]));
  labels.push(L('pH & temperature probes', 'Monitor culture conditions', [0.9, 1.2, 0]));
  labels.push(L('Sampling port', 'Periodic withdrawal of small volumes', [2.1, 0.0, 0]));
  labels.push(L('Harvest / product outlet', 'Downstream processing follows', [2.0, -2.4, 0]));
  labels.push(L('Cooling jacket / temperature control', 'Water jacket maintains temperature', [1.4, -1.0, 0.3]));
  if (sparged) labels.push(L('Sparger', 'Bubbles sterile air in tiny bubbles — increases O₂ transfer', [0, -1.85, 0.7]));
  else labels.push(L('Nutrient medium', 'Raw materials converted to product', [0, -0.6, 0.6]));
  return { g, labels, note: sparged ? 'Sparged stirred-tank: sterile air bubbled through sparger — increases oxygen transfer area.' : 'Simple stirred-tank bioreactor: agitator provides mixing and O₂; also an oxygen delivery system, foam control, temperature & pH control, sampling ports.' };
}
reg(Object.assign({}, B12, {
  id: 'b12-9-7', unit: U9, ch: 'Ch 9 — Biotechnology: Principles and Processes', fig: 'Fig 9.7', title: 'Stirred-tank bioreactors',
  desc: 'Bioreactors are vessels (100–1000 L) where raw materials are biologically converted into products using microbial, plant or animal cells. The stirred-tank type is most common; a sparged version bubbles sterile air for better oxygen transfer.',
  points: ['Provide optimum growth conditions: temperature, pH, substrate, salts, vitamins, oxygen.', 'Components: agitator, oxygen delivery, foam control, temperature & pH control, sampling ports.', 'Downstream processing: separation, purification, formulation with preservatives, quality control.', 'Small-volume cultures cannot yield enough — scale-up needed.'],
  variants: [{ name: 'Simple stirred-tank', build: () => bioreactor(false) }, { name: 'Sparged stirred-tank', build: () => bioreactor(true) }]
}));

/* ---------- Ch 10 Biotech applications ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-10-3', unit: U9, ch: 'Ch 10 — Biotechnology and its Applications', fig: 'Fig 10.3', title: 'Maturation of pro-insulin into insulin',
  desc: 'Insulin has two polypeptides — A (21 aa) and B (30 aa) — linked by disulphide bridges. It is synthesised as pro-insulin with an extra C-peptide that is removed during maturation. Eli Lilly (1983) produced humulin by expressing A and B chains separately in E. coli and joining them.',
  points: ['Pro-insulin = A chain + C peptide + B chain; C peptide removed → mature insulin.', 'Recombinant insulin: DNA for A & B chains inserted in E. coli plasmids; chains combined by disulphide bonds.', 'Earlier insulin from slaughtered cattle/pigs caused allergy in some patients.', 'Use the slider to clip the C-peptide.'],
  slide: 'Clip C-peptide',
  build() {
    const g = H.grp(), labels = [];
    const A = [[-1.6, 0.9, 0], [-0.8, 1.1, 0.1], [0.0, 0.9, 0], [0.8, 1.1, -0.1], [1.6, 0.9, 0]];
    const B = [[-2.2, -0.6, 0], [-1.2, -0.9, 0.1], [-0.2, -0.7, 0], [0.8, -0.95, -0.1], [1.8, -0.7, 0], [2.4, -0.5, 0]];
    g.add(H.tube(A, 0.1, C.green, { seg: 40 })); g.add(H.text('A chain (21 aa)', { size: 0.16, pos: [-1.9, 1.35, 0], color: C.green }));
    g.add(H.tube(B, 0.1, C.blue, { seg: 40 })); g.add(H.text('B chain (30 aa)', { size: 0.16, pos: [-2.6, -1.1, 0], color: C.blue }));
    g.add(H.rod([-0.8, 1.0, 0.1], [-1.2, -0.8, 0.1], 0.035, C.yellow)); g.add(H.rod([0.8, 1.0, -0.1], [0.8, -0.85, -0.1], 0.035, C.yellow)); g.add(H.rod([-1.6, 0.8, 0], [-0.7, 0.85, 0.15], 0.03, C.yellow, { op: 0.6 }));
    const Cp = [[1.6, 0.9, 0], [2.6, 1.2, 0.2], [3.2, 0.4, 0.3], [3.0, -0.4, 0.2], [2.4, -0.5, 0]];
    const cMesh = H.tube(Cp, 0.09, C.orange, { seg: 40 }); g.add(cMesh);
    const ctxt = H.text('C peptide', { size: 0.16, pos: [3.5, 0.4, 0.3], color: C.orange }); g.add(ctxt);
    const cut1 = H.sphere(0.1, C.red, [1.6, 0.9, 0], { e: 0.9 }), cut2 = H.sphere(0.1, C.red, [2.4, -0.5, 0], { e: 0.9 }); g.add(cut1); g.add(cut2);
    const slide = t => { cMesh.position.set(t * 1.5, t * 0.4, t * 0.5); ctxt.position.set(3.5 + t * 1.5, 0.4 + t * 0.4, 0.3 + t * 0.5); cMesh.material = H.mat(C.orange, { op: 1 - t * 0.6 }); };
    labels.push(L('A chain (21 amino acids)', 'Shorter polypeptide', [0.0, 0.9, 0]));
    labels.push(L('B chain (30 amino acids)', 'Longer polypeptide', [-0.2, -0.7, 0]));
    labels.push(L('Disulphide bridges (S–S)', 'Two inter-chain + one intra-chain (A) link', [0.8, 0.05, -0.1]));
    labels.push(L('C peptide (connecting)', 'Present in pro-insulin; removed during maturation', [3.2, 0.4, 0.3]));
    labels.push(L('Cleavage sites', 'C peptide clipped off → mature functional insulin', [1.6, 0.9, 0]));
    labels.push(L('Mature insulin', 'A + B chains joined by disulphide bonds (humulin by rDNA technology)', [-1.0, 0.1, 0]));
    return { g, labels, slide };
  }
}));

/* ---------- Ch 11 Organisms & Populations ---------- */
reg(Object.assign({}, B12, {
  id: 'b12-11-2', unit: U10, ch: 'Ch 11 — Organisms and Populations', fig: 'Fig 11.2', title: 'Biome distribution: temperature vs precipitation',
  desc: 'Major biomes are determined by two key abiotic factors — mean annual temperature and precipitation. Tropical forests are hot & wet; deserts dry; tundra cold; grasslands and temperate/coniferous forests lie in between.',
  points: ['India: tropical rain forest, deciduous forest, desert, sea coast — all biomes except tundra/coniferous vast expanses.', 'Abiotic factors: temperature (most important), water, light, soil.', 'Responses to abiotic stress: regulate (homeostasis), conform, migrate, suspend (hibernation, aestivation, diapause).', 'Eurythermal/stenothermal; euryhaline/stenohaline organisms.'],
  build() {
    const g = H.grp(), labels = [];
    const G = H.graph({ w: 4.8, h: 3.2, xr: [-15, 30], yr: [0, 450], xl: 'Mean annual temperature (°C)', yl: 'Mean annual precipitation (cm)', xt: [[-10, '−10'], [0, '0'], [10, '10'], [20, '20'], [30, '30']], yt: [[100, '100'], [200, '200'], [300, '300'], [400, '400']], nx: 9, ny: 9 });
    g.add(G);
    const region = (pts, col, name, lp) => { const p3 = pts.map(p => G.map(p[0], p[1], 0.05)); const shape = pts.map(p => { const m = G.map(p[0], p[1]); return [m[0], m[1]]; }); g.add(H.extrude(shape, 0.12, col, [0, 0, 0.1], null, { op: 0.55 })); g.add(H.text(name, { size: 0.14, pos: G.map(lp[0], lp[1], 0.25), color: C.white })); return G.map(lp[0], lp[1], 0.2); };
    const tr = region([[20, 250], [30, 300], [30, 450], [22, 450], [18, 330]], C.dgreen, 'Tropical forest', [25, 380]);
    const tf = region([[5, 120], [20, 250], [18, 330], [8, 250], [3, 170]], C.green, 'Temperate forest', [11, 230]);
    const cf = region([[-8, 60], [5, 120], [3, 170], [-6, 130]], C.teal, 'Coniferous forest', [-2, 115]);
    const gr = region([[0, 40], [22, 60], [30, 130], [20, 250], [5, 120]], C.lime, 'Grassland', [15, 110]);
    const de = region([[5, 0], [30, 0], [30, 130], [22, 60]], C.amber, 'Desert', [23, 30]);
    const tu = region([[-15, 0], [5, 0], [5, 40], [-8, 60], [-15, 40]], C.cyan, 'Arctic & alpine tundra', [-6, 20]);
    labels.push(L('Tropical forest', 'High temperature + high rainfall — maximum biodiversity', tr));
    labels.push(L('Temperate forest', 'Moderate temperature & rainfall; deciduous', tf));
    labels.push(L('Coniferous forest (taiga)', 'Cold, moderate precipitation; evergreen conifers', cf));
    labels.push(L('Grassland', 'Moderate temperature, lower rainfall', gr));
    labels.push(L('Desert', 'Very low precipitation; hot or cold', de));
    labels.push(L('Arctic & alpine tundra', 'Very low temperature & precipitation', tu));
    labels.push(L('Temperature axis', 'Most ecologically relevant factor', G.map(30, -30)));
    return { g, labels };
  }
}));

reg(Object.assign({}, B12, {
  id: 'b12-11-4', unit: U10, ch: 'Ch 11 — Organisms and Populations', fig: 'Fig 11.4', title: 'Population growth curves',
  desc: 'With unlimited resources a population grows exponentially (J-shaped: dN/dt = rN, Nₜ = N₀eʳᵗ). With limited resources growth is logistic (S-shaped, Verhulst–Pearl): dN/dt = rN(K−N)/K, levelling off at carrying capacity K.',
  points: ['r = intrinsic rate of natural increase (b − d); Norway rat 0.015, flour beetle 0.12, human (1981) 0.0205.', 'Lag → acceleration → deceleration → asymptote at K in logistic growth.', 'Population attributes: birth/death rate, sex ratio, age pyramids (expanding, stable, declining).', 'Density changes: N(t+1) = N(t) + [(B + I) − (D + E)].'],
  build() {
    const g = H.grp(), labels = [];
    const K = 9, r = 0.55;
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 12], yr: [0, 12], xl: 'Time (t)', yl: 'Population density (N)', nx: 6, ny: 6,
      curves: [{ f: x => 0.4 * Math.exp(r * x), color: C.orange, r: 0.04, dom: [0, 6.3], label: 'Exponential (J)' }, { f: x => K / (1 + ((K - 0.4) / 0.4) * Math.exp(-r * 1.15 * x)), color: C.green, r: 0.04, label: 'Logistic (S)' }], hl: [{ y: K, color: C.yellow }] });
    g.add(G);
    g.add(H.text('K (carrying capacity)', { size: 0.16, pos: G.map(10.5, K + 0.7), color: C.yellow }));
    g.add(H.text('dN/dt = rN', { size: 0.16, pos: G.map(2.0, 10.5), color: C.orange })); g.add(H.text('dN/dt = rN (K−N)/K', { size: 0.16, pos: G.map(9.0, 4.0), color: C.green }));
    labels.push(L('Exponential growth (J-shaped)', 'Unlimited resources; Nₜ = N₀eʳᵗ', G.map(5.5, 0.4 * Math.exp(r * 5.5))));
    labels.push(L('Logistic growth (S-shaped)', 'Limited resources; Verhulst–Pearl', G.map(6, 6.5)));
    labels.push(L('Carrying capacity (K)', 'Maximum number the habitat can sustain', G.map(11, K)));
    labels.push(L('Lag phase', 'Slow initial growth', G.map(1.5, 0.8)));
    labels.push(L('Acceleration & deceleration', 'Steepest growth around K/2', G.map(4.5, 4.5)));
    labels.push(L('Asymptote', 'Growth stops as N approaches K', G.map(10, K - 0.2)));
    return { g, labels };
  }
}));

/* ---------- Ch 12 Ecosystem ---------- */
function pyramid(kind) {
  const g = H.grp(), labels = [];
  const tiers = kind === 'numbers' ? [['Producers (grass)', 5.0, C.green, '5,842,000'], ['Primary consumers (grasshopper)', 3.6, C.lime, '708,000'], ['Secondary consumers (frog)', 2.2, C.orange, '35,000'], ['Tertiary consumers (snake/hawk)', 0.9, C.red, '3']]
    : kind === 'biomass' ? [['Producers', 5.0, C.green, '~ dry weight'], ['Herbivores', 3.4, C.lime, ''], ['Carnivores', 2.0, C.orange, ''], ['Top carnivores', 0.8, C.red, '']]
    : kind === 'inverted' ? [['Phytoplankton (producers)', 1.4, C.green, 'small standing crop'], ['Zooplankton', 2.8, C.lime, ''], ['Small fish', 3.8, C.orange, ''], ['Large fish', 4.6, C.red, 'largest biomass']]
    : [['Producers', 5.0, C.green, '1000 J'], ['Herbivores', 3.3, C.lime, '100 J'], ['Carnivores', 1.9, C.orange, '10 J'], ['Top carnivores', 0.9, C.red, '1 J']];
  const pos = [];
  tiers.forEach(([name, w, col, val], i) => { const y = -1.6 + i * 0.9; g.add(H.box(w, 0.8, 1.2, col, [0, y, 0], null, { op: 0.85 })); g.add(H.text(val, { size: 0.15, pos: [0, y, 0.65], top: true })); pos.push([w / 2, y, 0]); });
  g.add(H.text('T₄', { size: 0.16, pos: [-3.0, 1.1, 0], color: C.grey })); g.add(H.text('T₃', { size: 0.16, pos: [-3.0, 0.2, 0], color: C.grey })); g.add(H.text('T₂', { size: 0.16, pos: [-3.0, -0.7, 0], color: C.grey })); g.add(H.text('T₁', { size: 0.16, pos: [-3.0, -1.6, 0], color: C.grey }));
  tiers.forEach((t, i) => labels.push(L(t[0], i === 0 ? 'Trophic level 1 — base of the pyramid' : `Trophic level ${i + 1}`, pos[i])));
  if (kind === 'numbers') labels.push(L('Pyramid of numbers (upright)', 'Grassland ecosystem; a tree ecosystem gives an inverted one', [0, 1.5, 0]));
  if (kind === 'biomass') labels.push(L('Pyramid of biomass (upright)', 'Terrestrial: producers have the largest biomass', [0, 1.5, 0]));
  if (kind === 'inverted') labels.push(L('Inverted pyramid of biomass', 'Sea: phytoplankton biomass small but rapidly regenerated; fish biomass large', [0, 1.5, 0]));
  if (kind === 'energy') labels.push(L('Pyramid of energy (always upright)', '10% law (Lindeman): only ~10% energy transfers to next level; energy can never be inverted', [0, 1.5, 0]));
  return { g, labels };
}
reg(Object.assign({}, B12, {
  id: 'b12-12-2', unit: U10, ch: 'Ch 12 — Ecosystem', fig: 'Fig 12.2', title: 'Ecological pyramids',
  desc: 'Ecological pyramids express the relationship between producers and consumers at successive trophic levels as number, biomass or energy. Pyramids of energy are always upright; pyramids of numbers and biomass may be inverted.',
  points: ['Base = producers (T₁); apex = top carnivores (T₄).', 'Pyramid of numbers inverted for a large tree; pyramid of biomass inverted in the sea.', 'Energy pyramid always upright — energy lost as heat at each transfer (10% law).', 'Limitations: species occupying >1 trophic level not shown; decomposers ignored; assumes simple food chain.'],
  variants: [{ name: 'Numbers', build: () => pyramid('numbers') }, { name: 'Biomass (upright)', build: () => pyramid('biomass') }, { name: 'Biomass (inverted, sea)', build: () => pyramid('inverted') }, { name: 'Energy', build: () => pyramid('energy') }]
}));


/* ================================================================
   5. CHEMISTRY
   ================================================================ */
const CH = { sub: 'chem' };
const UP = 'Physical Chemistry', UI = 'Inorganic Chemistry', UO = 'Organic Chemistry';

/* ---------- Class 11 Ch 2 Structure of Atom ---------- */
reg(Object.assign({}, CH, {
  id: 'c11-2-1', cls: 11, unit: UP, ch: 'Ch 2 — Structure of Atom', fig: 'Black body radiation', title: 'Black body radiation curves',
  desc: 'Intensity of radiation emitted by a black body vs wavelength at different temperatures. As temperature rises, total intensity increases and the wavelength of maximum intensity shifts to shorter values (Wien\'s law). Classical physics failed (ultraviolet catastrophe); Planck\'s quantum theory (E = hν) explained it.',
  points: ['Black body: perfect absorber & emitter of all frequencies.', 'λ_max ∝ 1/T — hotter objects glow from red → white → blue.', 'Planck (1900): energy emitted/absorbed in discrete quanta, E = hν; h = 6.626 × 10⁻³⁴ J s.', 'Explains why intensity does not rise indefinitely at short wavelengths.'],
  build() {
    const g = H.grp(), labels = [];
    const planck = (l, T) => { const x = 1 / (l * T); return Math.pow(1 / l, 5) / (Math.exp(14.4 * x) - 1) * 1e-3; };
    const G = H.graph({ w: 4.8, h: 3, xr: [0, 3], yr: [0, 1], xl: 'Wavelength (λ)', yl: 'Intensity', nx: 6, ny: 5,
      curves: [{ f: l => planck(l + 0.02, 5.6) * 18, color: C.blue, r: 0.035, label: 'T₃ (highest)', n: 80 }, { f: l => planck(l + 0.02, 4.8) * 18, color: C.orange, r: 0.035, label: 'T₂', n: 80 }, { f: l => planck(l + 0.02, 4.0) * 18, color: C.red, r: 0.035, label: 'T₁ (lowest)', n: 80 }] });
    g.add(G);
    g.add(H.line([G.map(0.25, 0), G.map(0.25, 1)], C.grey, { dashed: true })); g.add(H.line([G.map(0.55, 0), G.map(0.55, 1)], C.grey, { dashed: true }));
    g.add(H.arrow(G.map(0.65, 0.95), G.map(0.3, 0.95), C.white, { r: 0.015, head: 0.1 })); g.add(H.text('λ_max shifts to shorter λ as T ↑', { size: 0.14, pos: G.map(1.6, 0.95), color: C.white }));
    labels.push(L('T₃ > T₂ > T₁', 'Higher temperature → greater intensity at all λ', G.map(0.3, 0.85)));
    labels.push(L('Peak wavelength (λ_max)', 'Shifts toward shorter λ with rising T (Wien\'s displacement)', G.map(0.25, 0.95)));
    labels.push(L('Long-wavelength tail', 'Intensity falls gradually at large λ', G.map(2.5, 0.08)));
    labels.push(L('Short-wavelength fall', 'Classical theory predicted infinite rise (UV catastrophe) — Planck resolved it', G.map(0.08, 0.3)));
    return { g, labels };
  }
}));

reg(Object.assign({}, CH, {
  id: 'c11-2-2', cls: 11, unit: UP, ch: 'Ch 2 — Structure of Atom', fig: 'Photoelectric effect', title: 'Photoelectric effect — experimental setup',
  desc: 'When light of sufficient frequency strikes a metal surface in an evacuated tube, electrons are ejected instantly and collected at the detector, registering a current. Einstein (1905): hν = hν₀ + ½mₑv² — photons transfer energy in quanta.',
  points: ['No electrons below threshold frequency ν₀, regardless of intensity.', 'Number of electrons ∝ intensity; kinetic energy ∝ frequency (not intensity).', 'Work function W₀ = hν₀; K.E. = hν − hν₀.', 'Alkali metals (K, Rb, Cs) show the effect with visible light — low work function.'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.cyl(1.3, 1.3, 3.6, C.cyan, [0, 0, 0], [0, 0, PI / 2], { op: 0.12, open: true, side: THREE.DoubleSide, dw: false }));
    g.add(H.sphere(1.3, C.cyan, [-1.8, 0, 0], { op: 0.12, phi: PI, phiStart: PI / 2, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(1.3, C.cyan, [1.8, 0, 0], { op: 0.12, phi: PI, phiStart: -PI / 2, side: THREE.DoubleSide, dw: false }));
    g.add(H.box(0.15, 1.8, 1.2, C.grey, [-2.0, 0, 0])); g.add(H.box(0.12, 1.4, 1.0, C.orange, [2.0, 0, 0]));
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35; g.add(H.arrow([-4.3, 1.8 + a * 0.2, 0], [-2.2, 0.4 + a * 0.5, 0], C.yellow, { r: 0.015, head: 0.15 })); }
    g.add(H.text('light (hν)', { size: 0.18, pos: [-4.0, 2.4, 0], color: C.yellow }));
    for (let i = 0; i < 6; i++) { const y = (i - 2.5) * 0.3; g.add(H.sphere(0.06, C.cyan, [-1.4 + i * 0.5, y, 0.2 * Math.sin(i)], { e: 0.9 })); g.add(H.arrow([-1.3 + i * 0.5, y, 0.2 * Math.sin(i)], [-1.0 + i * 0.5, y, 0.2 * Math.sin(i)], C.cyan, { r: 0.008, head: 0.08 })); }
    g.add(H.text('e⁻', { size: 0.16, pos: [0, 1.0, 0], color: C.cyan }));
    // circuit
    g.add(H.tube([[-2.0, -0.9, 0], [-2.0, -2.2, 0], [-0.8, -2.2, 0]], 0.03, C.white)); g.add(H.tube([[2.0, -0.7, 0], [2.0, -2.2, 0], [0.8, -2.2, 0]], 0.03, C.white));
    g.add(H.torus(0.45, 0.03, C.white, [0, -2.2, 0])); g.add(H.text('A', { size: 0.28, bold: true, pos: [0, -2.2, 0.05] }));
    g.add(H.box(0.08, 0.6, 0.3, C.white, [1.4, -2.2, 0])); g.add(H.box(0.08, 0.35, 0.3, C.white, [1.55, -2.2, 0])); g.add(H.text('battery', { size: 0.13, pos: [1.5, -2.7, 0], color: C.grey }));
    g.add(H.text('vacuum', { size: 0.15, pos: [0, -1.0, 0], color: C.grey }));
    labels.push(L('Metal surface (cathode)', 'Emits electrons when illuminated; ν ≥ ν₀', [-2.0, 0.9, 0]));
    labels.push(L('Incident light (photons)', 'Energy hν; threshold frequency ν₀ needed', [-3.5, 1.9, 0]));
    labels.push(L('Ejected photoelectrons', 'Emitted instantly (no time lag)', [-0.4, 0.6, 0]));
    labels.push(L('Detector / collector (anode)', 'Collects electrons', [2.0, 0.7, 0]));
    labels.push(L('Evacuated tube', 'Vacuum so electrons travel freely', [0, -1.0, 0]));
    labels.push(L('Ammeter', 'Measures photoelectric current (∝ intensity)', [0, -2.2, 0]));
    labels.push(L('Battery (potential)', 'Applies potential between electrodes', [1.5, -2.2, 0]));
    return { g, labels };
  }
}));

function orbital(kind) {
  const g = H.grp(), labels = [];
  const P = '#60a5fa', N = '#f472b6';
  const axes = () => { g.add(H.arrow([-2.4, 0, 0], [2.4, 0, 0], C.grey, { r: 0.012, head: 0.12 })); g.add(H.arrow([0, -2.4, 0], [0, 2.4, 0], C.grey, { r: 0.012, head: 0.12 })); g.add(H.arrow([0, 0, -2.4], [0, 0, 2.4], C.grey, { r: 0.012, head: 0.12 })); g.add(H.text('x', { size: 0.2, pos: [2.6, 0, 0], color: C.grey })); g.add(H.text('y', { size: 0.2, pos: [0, 2.6, 0], color: C.grey })); g.add(H.text('z', { size: 0.2, pos: [0, 0, 2.6], color: C.grey })); };
  axes();
  g.add(H.sphere(0.08, C.white, [0, 0, 0], { e: 0.9 }));
  const nuc = L('Nucleus', 'At the origin', [0, 0, 0]);
  if (kind === '1s') { g.add(H.sphere(1.5, P, null, { op: 0.4, side: THREE.DoubleSide })); labels.push(L('1s orbital — spherical', 'Probability density depends only on r; no nodes', [1.5 * 0.7, 1.5 * 0.7, 0])); labels.push(L('Boundary surface', 'Encloses ~90% probability of finding electron', [-1.0, -1.1, 0])); }
  if (kind === '2s') { g.add(H.sphere(1.9, P, null, { op: 0.25, side: THREE.DoubleSide })); g.add(H.sphere(1.0, N, null, { op: 0.35, side: THREE.DoubleSide })); g.add(H.sphere(0.9, C.ink, null, { op: 0.6 })); labels.push(L('2s orbital', 'Spherical, larger than 1s', [1.3, 1.4, 0])); labels.push(L('Radial node', 'Spherical surface where probability = 0 (2s has one)', [0, -1.0, 0])); labels.push(L('Inner region', 'Opposite sign of wave function', [0.5, 0.4, 0.5])); }
  if (kind === 'p') { g.add(H.lobe(1.9, 0.75, P, [0, 0, 0], [0, 1, 0])); g.add(H.lobe(1.9, 0.75, N, [0, 0, 0], [0, -1, 0])); g.add(H.plane(3, 3, C.grey, [0, 0, 0], [PI / 2, 0, 0], { op: 0.12 })); labels.push(L('p orbital (p_z shown)', 'Dumbbell — two lobes along the axis', [0, 1.6, 0.3])); labels.push(L('Positive lobe (+)', 'Sign of wave function', [0.3, 1.2, 0])); labels.push(L('Negative lobe (−)', 'Opposite sign', [0.3, -1.2, 0])); labels.push(L('Nodal plane', 'Plane through nucleus where ψ = 0 (xy plane for p_z)', [1.3, 0, 1.3])); labels.push(L('p_x, p_y, p_z', 'Three degenerate orbitals along x, y, z', [-1.5, -1.8, 0])); }
  if (kind === 'p3') { const cols = [[P, N], [C.lime, C.orange], [C.yellow, C.purple]]; const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; dirs.forEach((d, i) => { g.add(H.lobe(1.7, 0.55, cols[i][0], [0, 0, 0], d, { op: 0.5 })); g.add(H.lobe(1.7, 0.55, cols[i][1], [0, 0, 0], d.map(v => -v), { op: 0.5 })); }); labels.push(L('p_x (along x)', 'Blue/pink lobes', [1.5, 0.2, 0])); labels.push(L('p_y (along y)', 'Green/orange lobes', [0.2, 1.5, 0])); labels.push(L('p_z (along z)', 'Yellow/purple lobes', [0.2, 0, 1.5])); labels.push(L('Mutually perpendicular', 'Same energy (degenerate) in absence of field', [-1.2, -1.2, -1.2])); }
  if (kind === 'dxy' || kind === 'dyz' || kind === 'dxz') {
    const dirs = kind === 'dxy' ? [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]] : kind === 'dyz' ? [[0, 1, 1], [0, -1, 1], [0, -1, -1], [0, 1, -1]] : [[1, 0, 1], [-1, 0, 1], [-1, 0, -1], [1, 0, -1]];
    dirs.forEach((d, i) => g.add(H.lobe(1.7, 0.6, i % 2 ? N : P, [0, 0, 0], d)));
    const pl = kind === 'dxy' ? [PI / 2, 0, 0] : kind === 'dyz' ? [0, PI / 2, 0] : [0, 0, 0];
    const name = kind === 'dxy' ? 'd_xy' : kind === 'dyz' ? 'd_yz' : 'd_xz';
    const d0 = dirs[0].map(v => v * 1.2);
    labels.push(L(name + ' orbital', 'Four lobes lying BETWEEN the axes in the ' + kind.slice(1) + ' plane', d0));
    labels.push(L('Lobes at 45° to axes', 'Alternating signs; two nodal planes', dirs[2].map(v => v * 1.2)));
    labels.push(L('Nodal planes (2)', 'Contain the axes', [0, 0, kind === 'dxy' ? 1.5 : 0].map((v, i) => kind === 'dxy' ? v : (i === (kind === 'dyz' ? 0 : 1) ? 1.5 : 0))));
  }
  if (kind === 'dx2y2') { [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]].forEach((d, i) => g.add(H.lobe(1.8, 0.6, i % 2 ? N : P, [0, 0, 0], d))); labels.push(L('d_x²−y² orbital', 'Four lobes ALONG the x and y axes', [1.4, 0, 0])); labels.push(L('Lobes on y axis', 'Opposite sign to x lobes', [0, 1.4, 0])); labels.push(L('Nodal planes', 'Two planes at 45° to x & y axes', [1.0, 1.0, 0])); }
  if (kind === 'dz2') { g.add(H.lobe(2.0, 0.6, P, [0, 0, 0], [0, 0, 1])); g.add(H.lobe(2.0, 0.6, P, [0, 0, 0], [0, 0, -1])); g.add(H.torus(0.9, 0.32, N, [0, 0, 0], [PI / 2, 0, 0], { op: 0.7, e: 0.5 })); labels.push(L('d_z² orbital', 'Two lobes along z axis', [0, 0, 1.6])); labels.push(L('Doughnut (torus / collar)', 'Ring of opposite sign in the xy plane', [1.2, 0, 0])); labels.push(L('Nodal surfaces', 'Two conical nodes', [0.6, 0.6, 0.9])); }
  labels.push(nuc);
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c11-2-3', cls: 11, unit: UP, ch: 'Ch 2 — Structure of Atom', fig: 'Boundary surface diagrams', title: 'Shapes of s, p and d orbitals',
  desc: 'Boundary surface diagrams enclose the region of ~90% probability of finding the electron. s orbitals are spherical; p orbitals are dumbbell-shaped with a nodal plane; four d orbitals have four lobes (clover) and d_z² has two lobes with a doughnut.',
  points: ['Number of radial nodes = n − l − 1; angular nodes = l; total nodes = n − 1.', 'p: l = 1, three orbitals (p_x, p_y, p_z); d: l = 2, five orbitals.', 'Size increases with n (1s < 2s < 3s); shape depends on l; orientation on m_l.', 'd_xy, d_yz, d_xz between axes; d_x²−y² and d_z² along axes (important for crystal field theory).'],
  variants: [{ name: '1s', build: () => orbital('1s') }, { name: '2s (node)', build: () => orbital('2s') }, { name: 'p (dumbbell)', build: () => orbital('p') }, { name: 'p_x p_y p_z', build: () => orbital('p3') }, { name: 'd_xy', build: () => orbital('dxy') }, { name: 'd_yz', build: () => orbital('dyz') }, { name: 'd_xz', build: () => orbital('dxz') }, { name: 'd_x²−y²', build: () => orbital('dx2y2') }, { name: 'd_z²', build: () => orbital('dz2') }]
}));

/* ---------- Ch 5 Thermodynamics ---------- */
function coffeeCup() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0.9, -1.8], [1.1, 0.6], [1.15, 0.8]], C.white, null, null, { seg: 32, op: 0.55, side: THREE.DoubleSide }));
  g.add(H.lathe([[0.82, -1.65], [1.0, 0.6], [1.05, 0.7]], C.bone, null, null, { seg: 32, op: 0.45, side: THREE.DoubleSide }));
  g.add(H.cyl(0.95, 0.85, 1.9, C.blue, [0, -0.6, 0], null, { op: 0.4 }));
  g.add(H.cyl(1.2, 1.2, 0.15, C.grey, [0, 0.85, 0]));
  g.add(H.rod([0.4, 0.9, 0], [0.4, 2.3, 0], 0.05, C.white)); g.add(H.rod([0.4, -1.2, 0], [0.4, 0.9, 0], 0.04, C.red)); g.add(H.sphere(0.09, C.red, [0.4, -1.2, 0]));
  g.add(H.rod([-0.4, 0.9, 0], [-0.4, 2.1, 0], 0.03, C.grey)); g.add(H.torus(0.25, 0.03, C.grey, [-0.4, -1.1, 0], [PI / 2, 0, 0]));
  labels.push(L('Two nested Styrofoam cups', 'Insulation — no heat exchange with surroundings', [1.1, -0.4, 0]));
  labels.push(L('Reaction mixture (solution)', 'Reaction occurs at constant (atmospheric) pressure', [0, -0.6, 0.6]));
  labels.push(L('Thermometer', 'Measures ΔT', [0.4, 1.8, 0]));
  labels.push(L('Stirrer', 'Uniform temperature', [-0.4, 1.7, 0]));
  labels.push(L('Lid (insulating)', 'Cover; open to atmosphere → constant P', [1.1, 0.85, 0]));
  labels.push(L('Measures ΔH', 'q_p = C_p ΔT = ΔH (constant pressure)', [-1.2, -1.5, 0]));
  return { g, labels, note: 'Coffee-cup calorimeter: constant pressure → heat measured = ΔH (enthalpy change). Used for reactions in solution.' };
}
function bombCal() {
  const g = H.grp(), labels = [];
  g.add(H.cyl(2.2, 2.2, 4.0, C.dgrey, [0, 0, 0], null, { op: 0.25, open: true, side: THREE.DoubleSide, seg: 32, dw: false })); g.add(H.disc(2.2, C.dgrey, [0, -2.0, 0], [PI / 2, 0, 0], { op: 0.5 }));
  g.add(H.cyl(1.9, 1.9, 3.5, C.blue, [0, -0.2, 0], null, { op: 0.3, seg: 32, dw: false }));
  g.add(H.cyl(0.9, 0.9, 2.0, C.grey, [0, -0.6, 0], null, { seg: 24, op: 0.8 })); g.add(H.cyl(0.95, 0.95, 0.25, C.grey, [0, 0.5, 0], null, { seg: 24 }));
  g.add(H.cyl(0.35, 0.35, 0.2, C.orange, [0, -1.3, 0], null, { seg: 16 })); g.add(H.sphere(0.15, C.red, [0, -1.15, 0], { e: 0.9 }));
  g.add(H.rod([-0.2, -1.1, 0], [-0.2, 2.6, 0], 0.03, C.yellow)); g.add(H.rod([0.2, -1.1, 0], [0.2, 2.6, 0], 0.03, C.yellow));
  g.add(H.tube([[0.5, 0.6, 0], [0.5, 1.5, 0], [1.2, 2.4, 0]], 0.05, C.cyan)); g.add(H.text('O₂ inlet', { size: 0.14, pos: [1.5, 2.5, 0], color: C.cyan }));
  g.add(H.rod([1.3, 2.6, 0], [1.3, -1.2, 0], 0.03, C.grey)); g.add(H.torus(0.3, 0.03, C.grey, [1.3, -1.2, 0], [PI / 2, 0, 0]));
  g.add(H.rod([-1.3, 2.6, 0], [-1.3, -0.5, 0], 0.05, C.white)); g.add(H.rod([-1.3, -0.5, 0], [-1.3, 0.8, 0], 0.045, C.red));
  labels.push(L('Steel bomb (sealed vessel)', 'Sample burns in excess O₂ at constant VOLUME', [0, -0.6, 0.9]));
  labels.push(L('Sample (in crucible)', 'Combustible substance', [0, -1.3, 0.35]));
  labels.push(L('Ignition wires', 'Electric spark ignites the sample', [0.2, 2.2, 0]));
  labels.push(L('Water bath (known mass)', 'Absorbs heat; temperature rise measured', [1.5, -1.5, 0.8]));
  labels.push(L('Insulated outer jacket', 'Prevents heat loss', [2.2, 0.5, 0]));
  labels.push(L('Stirrer', 'Distributes heat evenly', [1.3, 2.0, 0]));
  labels.push(L('Thermometer', 'Precise ΔT', [-1.3, 2.0, 0]));
  labels.push(L('Measures ΔU', 'q_v = C_v ΔT = ΔU; ΔH = ΔU + Δn_g RT', [-1.6, -2.4, 0]));
  return { g, labels, note: 'Bomb calorimeter: constant volume → heat = ΔU (internal energy change); no work done (ΔV = 0). Used for combustion.' };
}
reg(Object.assign({}, CH, {
  id: 'c11-5-1', cls: 11, unit: UP, ch: 'Ch 5 — Thermodynamics', fig: 'Calorimeters', title: 'Coffee-cup & bomb calorimeters',
  desc: 'Calorimetry measures energy changes: at constant volume (bomb calorimeter, q_v = ΔU) or at constant pressure (coffee-cup calorimeter, q_p = ΔH).',
  points: ['ΔH = ΔU + Δn_g RT relates the two.', 'Bomb: no volume change → no work; heat absorbed by water bath → ΔU of combustion.', 'Coffee cup: open to atmosphere; ΔH of solution reactions (neutralisation, dissolution).', 'Heat capacity C = q/ΔT; C_p − C_v = R for ideal gas.'],
  variants: [{ name: 'Coffee-cup (ΔH)', build: coffeeCup }, { name: 'Bomb (ΔU)', build: bombCal }]
}));

/* ---------- Ch 6 Equilibrium ---------- */
reg(Object.assign({}, CH, {
  id: 'c11-6-1', cls: 11, unit: UP, ch: 'Ch 6 — Equilibrium', fig: "Le Chatelier's graphs", title: 'Concentration vs time — approach to equilibrium & Le Chatelier shift',
  desc: 'Reactant concentration falls and product concentration rises until they become constant at equilibrium (rates equal). Adding reactant disturbs equilibrium; the system shifts to consume the added reactant until a new equilibrium forms (Le Chatelier\'s principle).',
  points: ['At equilibrium: forward rate = backward rate; concentrations constant, not necessarily equal.', 'Le Chatelier: a change in concentration, pressure or temperature shifts equilibrium to counteract the change.', 'Adding reactant → forward shift; removing product → forward shift; catalyst does NOT shift equilibrium, only speeds attainment.', 'Temperature changes K; concentration/pressure changes do not.'],
  build() {
    const g = H.grp(), labels = [];
    const A = x => x < 5 ? 1.0 - 0.6 * (1 - Math.exp(-x * 0.9)) : (x < 5.1 ? 0.85 : 0.85 - 0.25 * (1 - Math.exp(-(x - 5) * 0.9)));
    const B = x => x < 5 ? 0.6 * (1 - Math.exp(-x * 0.9)) : 0.6 + 0.25 * (1 - Math.exp(-(x - 5) * 0.9));
    const G = H.graph({ w: 5.2, h: 3, xr: [0, 10], yr: [0, 1.2], xl: 'Time', yl: 'Concentration', nx: 10, ny: 6, curves: [{ f: A, color: C.orange, r: 0.035, label: '[Reactant]', n: 120 }, { f: B, color: C.green, r: 0.035, label: '[Product]', n: 120 }], vl: [{ x: 3.2, y: 1.2 }, { x: 5, y: 1.2, color: C.yellow }, { x: 8.5, y: 1.2 }] });
    g.add(G);
    g.add(H.arrow(G.map(5, 0.4), G.map(5, 0.83), C.yellow, { r: 0.02, head: 0.14 })); g.add(H.text('reactant added', { size: 0.14, pos: G.map(5, 1.1), color: C.yellow }));
    g.add(H.text('equilibrium 1', { size: 0.13, pos: G.map(3.6, 0.05), color: C.grey })); g.add(H.text('equilibrium 2', { size: 0.13, pos: G.map(8.9, 0.05), color: C.grey }));
    labels.push(L('Reactant concentration falls', 'Forward reaction dominates initially', G.map(1.2, A(1.2))));
    labels.push(L('Product concentration rises', 'Backward reaction speeds up as product accumulates', G.map(1.2, B(1.2))));
    labels.push(L('Equilibrium reached', 'Both concentrations constant; rates equal', G.map(3.5, A(3.5))));
    labels.push(L('Disturbance: reactant added', 'Concentration jumps; Q < K', G.map(5.05, 0.85)));
    labels.push(L('Shift to the right', 'Extra reactant consumed; more product formed', G.map(6.2, B(6.2))));
    labels.push(L('New equilibrium', 'Same K, new concentrations', G.map(9, A(9))));
    return { g, labels };
  }
}));

/* ---------- Class 12 Ch 1 Solutions ---------- */
function raoult(kind) {
  const g = H.grp(), labels = [];
  const pA = 0.9, pB = 0.4;
  const dev = kind === 'pos' ? 0.35 : kind === 'neg' ? -0.3 : 0;
  const fA = x => pA * x + dev * x * (1 - x) * 0.9, fB = x => pB * (1 - x) + dev * x * (1 - x) * 0.9;
  const G = H.graph({ w: 4.6, h: 3, xr: [0, 1], yr: [0, 1.4], xl: 'Mole fraction', yl: 'Vapour pressure', xt: [[0, 'x_A=0'], [1, 'x_A=1']], nx: 5, ny: 7,
    curves: [{ f: fA, color: C.blue, r: 0.03, label: 'p_A' }, { f: fB, color: C.orange, r: 0.03, label: 'p_B' }, { f: x => fA(x) + fB(x), color: C.green, r: 0.04, label: 'p_total' }].concat(kind === 'ideal' ? [] : [{ f: x => pA * x + pB * (1 - x), color: C.grey, dashed: true }, { f: x => pA * x, color: C.grey, dashed: true }, { f: x => pB * (1 - x), color: C.grey, dashed: true }]) });
  g.add(G);
  labels.push(L('p_A = p°_A x_A', 'Partial pressure of A (Raoult\'s law line)', G.map(0.7, fA(0.7))));
  labels.push(L('p_B = p°_B x_B', 'Partial pressure of B', G.map(0.3, fB(0.3))));
  labels.push(L('p_total = p_A + p_B', 'Dalton\'s law', G.map(0.5, fA(0.5) + fB(0.5))));
  labels.push(L('p°_A (pure A)', 'Vapour pressure of pure A at x_A = 1', G.map(1, pA)));
  labels.push(L('p°_B (pure B)', 'Vapour pressure of pure B at x_A = 0', G.map(0, pB)));
  if (kind === 'ideal') labels.push(L('Ideal solution', 'Straight lines: A–B interactions ≈ A–A, B–B; ΔH_mix = 0, ΔV_mix = 0 (benzene–toluene, n-hexane–n-heptane)', G.map(0.5, 0.15)));
  if (kind === 'pos') labels.push(L('Positive deviation', 'Curves ABOVE dashed ideal lines: weaker A–B forces; ΔH_mix > 0, ΔV_mix > 0 (ethanol–acetone, CS₂–acetone)', G.map(0.5, 0.15)));
  if (kind === 'neg') labels.push(L('Negative deviation', 'Curves BELOW dashed ideal lines: stronger A–B forces (H-bonding); ΔH_mix < 0, ΔV_mix < 0 (chloroform–acetone, phenol–aniline)', G.map(0.5, 0.15)));
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-1-1', cls: 12, unit: UP, ch: 'Ch 1 — Solutions', fig: 'Vapour pressure graphs', title: 'Raoult\'s law: ideal & non-ideal solutions',
  desc: 'Raoult\'s law: partial vapour pressure of each volatile component is proportional to its mole fraction (p_A = p°_A x_A). Ideal solutions obey it at all concentrations; non-ideal solutions show positive or negative deviations.',
  points: ['Ideal: ΔH_mix = 0, ΔV_mix = 0; intermolecular forces A–B same as A–A and B–B.', 'Positive deviation: p_total higher than expected (ethanol + acetone; CS₂ + acetone) → minimum-boiling azeotrope.', 'Negative deviation: p_total lower (chloroform + acetone; phenol + aniline) → maximum-boiling azeotrope.', 'For non-volatile solute: relative lowering of vapour pressure = x_solute (colligative).'],
  variants: [{ name: 'Ideal', build: () => raoult('ideal') }, { name: 'Positive deviation', build: () => raoult('pos') }, { name: 'Negative deviation', build: () => raoult('neg') }]
}));

function azeotrope(minimum) {
  const g = H.grp(), labels = [];
  const az = 0.55;
  const liq = x => minimum ? 1.0 - 0.9 * Math.sin(x * PI / (2 * az) * (x < az ? 1 : 1)) * (x < az ? Math.sin(x / az * PI / 2) : Math.sin((1 - x) / (1 - az) * PI / 2)) * 0.6 : 0.5 + 0.55 * (x < az ? Math.sin(x / az * PI / 2) : Math.sin((1 - x) / (1 - az) * PI / 2)) * 0.9;
  const vap = x => minimum ? liq(x) + 0.12 * (x < az ? Math.sin(x / az * PI) : Math.sin((x - az) / (1 - az) * PI)) : liq(x) - 0.12 * (x < az ? Math.sin(x / az * PI) : Math.sin((x - az) / (1 - az) * PI));
  const G = H.graph({ w: 4.6, h: 3, xr: [0, 1], yr: [0, 1.3], xl: 'Composition (mole fraction)', yl: 'Boiling temperature', xt: [[0, 'pure A'], [1, 'pure B']], nx: 5, ny: 6,
    curves: [{ f: liq, color: C.blue, r: 0.035, label: 'liquid', n: 100 }, { f: vap, color: C.orange, r: 0.035, label: 'vapour', n: 100 }], vl: [{ x: az, y: liq(az), color: C.yellow }] });
  g.add(G);
  g.add(H.sphere(0.08, C.yellow, G.map(az, liq(az), 0.08), { e: 0.9 }));
  labels.push(L(minimum ? 'Minimum-boiling azeotrope' : 'Maximum-boiling azeotrope', minimum ? 'Boils below both components; positive deviation (ethanol–water, 95.4% ethanol)' : 'Boils above both components; negative deviation (nitric acid–water, 68% HNO₃)', G.map(az, liq(az))));
  labels.push(L('Liquid curve', 'Boiling point vs liquid composition', G.map(0.2, liq(0.2))));
  labels.push(L('Vapour curve', 'Composition of vapour in equilibrium', G.map(0.2, vap(0.2))));
  labels.push(L('Azeotropic composition', 'Liquid & vapour have same composition — cannot be separated by fractional distillation', G.map(az, 0.05)));
  labels.push(L('Pure component boiling points', 'Ends of the curves', G.map(1, liq(1))));
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-1-2', cls: 12, unit: UP, ch: 'Ch 1 — Solutions', fig: 'Azeotropes', title: 'Azeotropes: boiling point vs composition',
  desc: 'Azeotropes are binary mixtures that boil at a constant temperature with the same composition in liquid and vapour. Positive-deviation solutions give minimum-boiling azeotropes; negative-deviation solutions give maximum-boiling azeotropes.',
  points: ['Ethanol–water: 95.4% ethanol, minimum-boiling azeotrope — cannot get 100% ethanol by distillation.', 'HNO₃–water: 68% HNO₃ by mass, boils at 393.5 K — maximum-boiling.', 'Cannot be separated by fractional distillation.', 'Liquid–vapour curves touch at the azeotropic point.'],
  variants: [{ name: 'Minimum boiling', build: () => azeotrope(true) }, { name: 'Maximum boiling', build: () => azeotrope(false) }]
}));

/* ---------- Ch 2 Electrochemistry ---------- */
reg(Object.assign({}, CH, {
  id: 'c12-2-1', cls: 12, unit: UP, ch: 'Ch 2 — Electrochemistry', fig: 'Daniell cell', title: 'Galvanic (Daniell) cell',
  desc: 'Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s). Zinc is oxidised at the anode (−), copper ions are reduced at the cathode (+). Electrons flow through the external wire from Zn to Cu; the salt bridge completes the circuit. E°cell = 1.10 V.',
  points: ['Anode (oxidation, −): Zn → Zn²⁺ + 2e⁻. Cathode (reduction, +): Cu²⁺ + 2e⁻ → Cu.', 'E°cell = E°cathode − E°anode = 0.34 − (−0.76) = 1.10 V.', 'Salt bridge (KCl/KNO₃ in agar-agar) maintains electrical neutrality; ions migrate.', 'If external opposing potential > 1.1 V, cell becomes electrolytic (reaction reverses).'],
  build() {
    const g = H.grp(), labels = [];
    const beaker = (x, col, ion) => { g.add(H.cyl(1.1, 1.1, 2.2, C.white, [x, -1.0, 0], null, { op: 0.12, open: true, side: THREE.DoubleSide, seg: 32, dw: false })); g.add(H.disc(1.1, C.white, [x, -2.1, 0], [PI / 2, 0, 0], { op: 0.3 })); g.add(H.cyl(1.05, 1.05, 1.5, col, [x, -1.3, 0], null, { op: 0.35, seg: 32, dw: false })); for (let i = 0; i < 6; i++) g.add(H.text(ion, { size: 0.13, pos: [x + 0.7 * Math.cos(i * 1.1), -1.7 + 0.15 * i, 0.7 * Math.sin(i * 1.1)], color: C.white })); };
    beaker(-2.0, C.grey, 'Zn²⁺'); beaker(2.0, C.blue, 'Cu²⁺');
    g.add(H.box(0.5, 2.6, 0.12, '#94a3b8', [-2.0, -0.4, 0])); g.add(H.box(0.5, 2.6, 0.12, '#d97706', [2.0, -0.4, 0]));
    // salt bridge
    g.add(H.tube([[-1.4, -1.3, 0], [-1.4, 0.4, 0], [-0.8, 1.0, 0], [0.8, 1.0, 0], [1.4, 0.4, 0], [1.4, -1.3, 0]], 0.18, C.amber, { seg: 40, op: 0.75 }));
    g.add(H.cyl(0.2, 0.2, 0.15, C.white, [-1.4, -1.35, 0], null, { op: 0.9 })); g.add(H.cyl(0.2, 0.2, 0.15, C.white, [1.4, -1.35, 0], null, { op: 0.9 }));
    // wires + voltmeter
    g.add(H.tube([[-2.0, 0.9, 0], [-2.0, 2.2, 0], [-0.6, 2.2, 0]], 0.03, C.white)); g.add(H.tube([[2.0, 0.9, 0], [2.0, 2.2, 0], [0.6, 2.2, 0]], 0.03, C.white));
    g.add(H.torus(0.5, 0.04, C.white, [0, 2.2, 0])); g.add(H.text('V', { size: 0.35, bold: true, pos: [0, 2.2, 0.05] }));
    g.add(H.arrow([-1.5, 2.45, 0], [-0.8, 2.45, 0], C.cyan, { r: 0.012, head: 0.1 })); g.add(H.text('e⁻ flow', { size: 0.14, pos: [-1.2, 2.7, 0], color: C.cyan }));
    g.add(H.arrow([0.8, 2.45, 0], [1.5, 2.45, 0], C.cyan, { r: 0.012, head: 0.1 }));
    g.add(H.text('Anode (−)', { size: 0.16, pos: [-2.0, 1.15, 0.2], color: C.orange })); g.add(H.text('Cathode (+)', { size: 0.16, pos: [2.0, 1.15, 0.2], color: C.green }));
    g.add(H.arrow([-0.5, 0.75, 0], [-1.0, 0.75, 0], C.yellow, { r: 0.012, head: 0.09 })); g.add(H.text('anions', { size: 0.12, pos: [-0.75, 0.55, 0], color: C.yellow })); g.add(H.arrow([0.5, 0.75, 0], [1.0, 0.75, 0], C.yellow, { r: 0.012, head: 0.09 })); g.add(H.text('cations', { size: 0.12, pos: [0.75, 0.55, 0], color: C.yellow }));
    labels.push(L('Zinc electrode (anode, −)', 'Oxidation: Zn → Zn²⁺ + 2e⁻ (E° = −0.76 V)', [-2.0, 0.3, 0.1]));
    labels.push(L('ZnSO₄ solution (1 M)', 'Zn²⁺ ions accumulate; electrode dissolves', [-2.0, -1.5, 1.0]));
    labels.push(L('Copper electrode (cathode, +)', 'Reduction: Cu²⁺ + 2e⁻ → Cu (E° = +0.34 V)', [2.0, 0.3, 0.1]));
    labels.push(L('CuSO₄ solution (1 M)', 'Blue colour fades; Cu deposits', [2.0, -1.5, 1.0]));
    labels.push(L('Salt bridge (KCl in agar)', 'Completes circuit; prevents charge build-up', [0, 1.0, 0.2]));
    labels.push(L('Voltmeter — 1.10 V', 'E°cell = E°cathode − E°anode', [0, 2.2, 0]));
    labels.push(L('Electron flow (external)', 'Anode → cathode through the wire', [-1.2, 2.5, 0]));
    labels.push(L('Ion migration (internal)', 'Cations → cathode; anions → anode', [0, 0.75, 0]));
    return { g, labels };
  }
}));

reg(Object.assign({}, CH, {
  id: 'c12-2-2', cls: 12, unit: UP, ch: 'Ch 2 — Electrochemistry', fig: 'SHE', title: 'Standard Hydrogen Electrode (SHE)',
  desc: 'A platinum electrode coated with platinum black, dipped in 1 M H⁺ (HCl) with H₂ gas bubbled at 1 bar, 298 K. Its electrode potential is assigned zero; it is used as reference to measure other standard electrode potentials.',
  points: ['Pt(s) | H₂(g, 1 bar) | H⁺(aq, 1 M); E° = 0.00 V by convention.', 'Half reaction: H⁺ + e⁻ → ½H₂ (can act as anode or cathode).', 'Platinum black increases surface area & catalyses the reaction; Pt is inert.', 'E°cell measured with SHE gives E° of the other electrode (e.g. Cu²⁺/Cu = +0.34 V, Zn²⁺/Zn = −0.76 V).'],
  build() {
    const g = H.grp(), labels = [];
    g.add(H.cyl(1.3, 1.3, 2.6, C.white, [0, -1.0, 0], null, { op: 0.12, open: true, side: THREE.DoubleSide, seg: 32, dw: false })); g.add(H.disc(1.3, C.white, [0, -2.3, 0], [PI / 2, 0, 0], { op: 0.3 }));
    g.add(H.cyl(1.25, 1.25, 1.8, C.cyan, [0, -1.3, 0], null, { op: 0.3, seg: 32, dw: false }));
    g.add(H.cyl(0.45, 0.45, 3.0, C.grey, [0, 0.2, 0], null, { op: 0.25, open: true, side: THREE.DoubleSide, seg: 24, dw: false }));
    g.add(H.rod([0, 2.6, 0], [0, -1.5, 0], 0.04, C.white)); g.add(H.box(0.5, 0.7, 0.06, C.ink, [0, -1.6, 0]));
    g.add(H.tube([[-1.8, 1.9, 0], [-0.8, 1.9, 0], [-0.45, 1.6, 0]], 0.06, C.grey)); g.add(H.cone(0.12, 0.25, C.grey, [-1.9, 1.9, 0], [0, 0, PI / 2]));
    g.add(H.text('H₂ (1 bar)', { size: 0.16, pos: [-2.2, 2.25, 0], color: C.white }));
    const rng = H.rng(9); for (let i = 0; i < 25; i++) g.add(H.sphere(0.04 + rng() * 0.04, C.white, [(rng() - 0.5) * 0.7, -2.0 + rng() * 2.2, (rng() - 0.5) * 0.7], { seg: 6, op: 0.7 }));
    for (let i = 0; i < 5; i++) g.add(H.text('H⁺', { size: 0.13, pos: [0.85 * Math.cos(i * 1.3), -1.8 + i * 0.2, 0.85 * Math.sin(i * 1.3)], color: C.white }));
    g.add(H.tube([[0.9, -1.0, 0], [1.5, -0.4, 0], [1.9, 0.4, 0]], 0.1, C.amber, { op: 0.7 }));
    g.add(H.text('to other half cell', { size: 0.13, pos: [2.3, 0.6, 0], color: C.amber }));
    g.add(H.text('298 K', { size: 0.15, pos: [-1.6, -2.4, 0], color: C.grey }));
    labels.push(L('Platinum electrode (Pt foil)', 'Inert; coated with finely divided platinum black', [0, -1.6, 0.05]));
    labels.push(L('Platinum wire', 'Electrical contact to the external circuit', [0, 1.5, 0]));
    labels.push(L('Glass jacket', 'Confines H₂ gas around the electrode', [0.45, 0.8, 0]));
    labels.push(L('H₂ gas at 1 bar', 'Bubbled continuously over the electrode', [-1.5, 1.9, 0]));
    labels.push(L('1 M H⁺ solution (HCl)', 'Unit activity of hydrogen ions', [0.85, -1.4, 0.85]));
    labels.push(L('H₂ bubbles', 'Equilibrium: ½H₂ ⇌ H⁺ + e⁻', [0.2, -0.8, 0.3]));
    labels.push(L('Salt bridge', 'Connects to the electrode being measured', [1.5, -0.4, 0]));
    labels.push(L('E° = 0.00 V (reference)', 'By convention at all temperatures', [-1.6, -2.4, 0]));
    return { g, labels };
  }
}));

function dryCell() {
  const g = H.grp(), labels = [];
  const half = { phiStart: PI / 2, phiLen: PI, side: THREE.DoubleSide };
  g.add(H.lathe([[1.0, -2.2], [1.0, 1.8], [0.9, 1.8], [0.9, -2.1], [0, -2.1]], '#94a3b8', null, null, Object.assign({ seg: 32, op: 0.9 }, half)));
  g.add(H.lathe([[0.9, -2.1], [0.9, 1.7], [0.8, 1.7], [0.8, -2.0], [0, -2.0]], C.white, null, null, Object.assign({ seg: 32, op: 0.6 }, half)));
  g.add(H.lathe([[0.8, -2.0], [0.8, 1.6], [0, 1.6], [0, -2.0]], C.ink, null, null, Object.assign({ seg: 32, op: 0.85 }, half)));
  g.add(H.cyl(0.25, 0.25, 4.0, C.dgrey, [0, 0.1, 0], null, { seg: 20 })); g.add(H.cyl(0.32, 0.32, 0.25, '#d97706', [0, 2.2, 0], null, { seg: 20 }));
  g.add(H.cyl(1.0, 1.0, 0.25, '#d97706', [0, -2.35, 0], null, { seg: 32 }));
  g.add(H.disc(1.0, C.bone, [0, 1.9, 0], [-PI / 2, 0, 0], { op: 0.8 }));
  g.add(H.text('+', { size: 0.35, bold: true, pos: [0, 2.6, 0] })); g.add(H.text('−', { size: 0.35, bold: true, pos: [0, -2.8, 0] }));
  labels.push(L('Zinc container (anode, −)', 'Zn → Zn²⁺ + 2e⁻', [-0.95, 0.2, 0.3]));
  labels.push(L('Carbon (graphite) rod (cathode, +)', 'Inert conductor with metal cap', [0, 1.2, 0.25]));
  labels.push(L('MnO₂ + carbon paste', 'Cathode reaction: MnO₂ + NH₄⁺ + e⁻ → MnO(OH) + NH₃', [0, -0.5, 0.5]));
  labels.push(L('Moist NH₄Cl + ZnCl₂ paste', 'Electrolyte (acidic); ~1.5 V', [-0.85, -1.0, 0.4]));
  labels.push(L('Insulating seal', 'Prevents leakage', [0, 1.9, 0.6]));
  labels.push(L('Metal cap (+ terminal)', 'Contact with carbon rod', [0, 2.2, 0]));
  return { g, labels, note: 'Dry cell (Leclanché): Zn anode, graphite cathode in MnO₂ + C, NH₄Cl + ZnCl₂ paste; 1.5 V; primary cell — not rechargeable; voltage drops with use (Zn²⁺ forms complex with NH₃).' };
}
function leadAcid() {
  const g = H.grp(), labels = [];
  g.add(H.box(4.4, 3.0, 2.2, C.white, [0, -0.3, 0], null, { op: 0.1, dw: false })); g.add(H.box(4.42, 3.02, 2.22, C.grey, [0, -0.3, 0], null, { wire: true, op: 0.5 }));
  g.add(H.box(4.3, 2.4, 2.1, C.cyan, [0, -0.5, 0], null, { op: 0.2, dw: false }));
  for (let i = 0; i < 6; i++) { const x = -1.75 + i * 0.7; const pb = i % 2 === 0; g.add(H.box(0.12, 2.4, 1.8, pb ? '#94a3b8' : '#78350f', [x, -0.4, 0], null, { op: 0.95 })); g.add(H.rod([x, 0.8, 0], [x, 1.6, 0], 0.04, pb ? '#94a3b8' : '#78350f')); }
  g.add(H.rod([-1.75, 1.6, 0], [1.05, 1.6, 0], 0.05, '#94a3b8')); g.add(H.rod([-1.05, 1.75, 0], [1.75, 1.75, 0], 0.05, '#78350f'));
  g.add(H.text('−', { size: 0.35, bold: true, pos: [-2.2, 1.6, 0] })); g.add(H.text('+', { size: 0.35, bold: true, pos: [2.2, 1.75, 0] }));
  labels.push(L('Lead (Pb) plates — anode (−)', 'Pb + SO₄²⁻ → PbSO₄ + 2e⁻ (discharge)', [-1.75, 0.2, 0.9]));
  labels.push(L('Lead dioxide (PbO₂) grid — cathode (+)', 'PbO₂ + SO₄²⁻ + 4H⁺ + 2e⁻ → PbSO₄ + 2H₂O', [-1.05, 0.2, 0.9]));
  labels.push(L('38% H₂SO₄ (electrolyte)', 'Consumed during discharge; density falls', [1.0, -1.2, 1.05]));
  labels.push(L('Overall: Pb + PbO₂ + 2H₂SO₄ → 2PbSO₄ + 2H₂O', 'Reversed on charging (secondary cell)', [0, -0.3, 1.1]));
  labels.push(L('Six cells in series', '~2 V each → 12 V car battery', [0, 1.9, 0]));
  return { g, labels, note: 'Lead storage battery: secondary cell used in cars/inverters; Pb anode, PbO₂ cathode grids, 38% H₂SO₄; rechargeable by passing current in reverse.' };
}
function fuelCell() {
  const g = H.grp(), labels = [];
  g.add(H.box(3.6, 3.2, 2.0, C.white, [0, 0, 0], null, { op: 0.1, dw: false })); g.add(H.box(3.62, 3.22, 2.02, C.grey, [0, 0, 0], null, { wire: true, op: 0.5 }));
  g.add(H.box(3.4, 2.6, 1.9, C.teal, [0, -0.2, 0], null, { op: 0.2, dw: false }));
  g.add(H.box(0.3, 2.8, 1.7, C.dgrey, [-1.2, 0, 0], null, { op: 0.9 })); g.add(H.box(0.3, 2.8, 1.7, C.dgrey, [1.2, 0, 0], null, { op: 0.9 }));
  const rng = H.rng(2); for (let i = 0; i < 40; i++) { const s = i < 20 ? -1 : 1; g.add(H.sphere(0.04, C.yellow, [s * 1.2 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 2.6, (rng() - 0.5) * 1.6], { seg: 5, e: 0.8 })); }
  g.add(H.tube([[-2.6, 2.2, 0], [-1.2, 2.2, 0], [-1.2, 1.5, 0]], 0.07, C.blue)); g.add(H.text('H₂ in', { size: 0.16, pos: [-2.9, 2.4, 0], color: C.blue }));
  g.add(H.tube([[2.6, 2.2, 0], [1.2, 2.2, 0], [1.2, 1.5, 0]], 0.07, C.red)); g.add(H.text('O₂ in', { size: 0.16, pos: [2.9, 2.4, 0], color: C.red }));
  g.add(H.tube([[0, -1.5, 0], [0, -2.3, 0], [1.2, -2.3, 0]], 0.07, C.cyan)); g.add(H.text('H₂O out', { size: 0.16, pos: [1.9, -2.5, 0], color: C.cyan }));
  g.add(H.tube([[-1.2, 1.4, 0.5], [-1.2, 2.8, 0.5], [1.2, 2.8, 0.5], [1.2, 1.4, 0.5]], 0.03, C.white)); g.add(H.torus(0.25, 0.03, C.white, [0, 2.8, 0.5])); g.add(H.text('load', { size: 0.13, pos: [0, 2.8, 0.55] }));
  g.add(H.text('−', { size: 0.3, bold: true, pos: [-1.2, -1.75, 0] })); g.add(H.text('+', { size: 0.3, bold: true, pos: [1.2, -1.75, 0] }));
  labels.push(L('Porous carbon anode (−)', '2H₂ + 4OH⁻ → 4H₂O + 4e⁻', [-1.2, 0.5, 0.85]));
  labels.push(L('Porous carbon cathode (+)', 'O₂ + 2H₂O + 4e⁻ → 4OH⁻', [1.2, 0.5, 0.85]));
  labels.push(L('Catalyst (Pt, Ag, CoO)', 'Finely divided on electrodes', [-1.0, -0.8, 0.85]));
  labels.push(L('Concentrated aqueous KOH', 'Electrolyte between electrodes', [0, -0.2, 0.95]));
  labels.push(L('Hydrogen gas inlet', 'Fuel', [-2.0, 2.2, 0]));
  labels.push(L('Oxygen gas inlet', 'Oxidant', [2.0, 2.2, 0]));
  labels.push(L('Water outlet', 'Only product — used in Apollo spacecraft (drinking water)', [0.6, -2.3, 0]));
  labels.push(L('Overall: 2H₂ + O₂ → 2H₂O', '~70% efficient; pollution-free; runs continuously while fuel supplied', [0, 1.2, 0.95]));
  return { g, labels, note: 'H₂–O₂ fuel cell: galvanic cell converting fuel energy directly to electricity; electrodes porous carbon with catalyst in aqueous KOH.' };
}
reg(Object.assign({}, CH, {
  id: 'c12-2-3', cls: 12, unit: UP, ch: 'Ch 2 — Electrochemistry', fig: 'Commercial batteries', title: 'Dry cell, lead storage battery, H₂–O₂ fuel cell',
  desc: 'Primary cells (dry cell, mercury cell) cannot be recharged; secondary cells (lead storage, Ni–Cd) can. Fuel cells convert energy of combustion of fuels (H₂, CH₄, CH₃OH) directly into electricity.',
  points: ['Dry cell ~1.5 V; mercury cell 1.35 V (constant; Zn–Hg amalgam anode, HgO + C cathode, KOH + ZnO paste).', 'Lead storage: Pb | PbO₂ | 38% H₂SO₄; 12 V = 6 cells; rechargeable.', 'Ni–Cd: longer life; NiO₂ cathode, Cd anode, KOH electrolyte.', 'Fuel cell efficiency ~70%; H₂–O₂ cell used in Apollo space programme.'],
  variants: [{ name: 'Dry cell', build: dryCell }, { name: 'Lead storage battery', build: leadAcid }, { name: 'H₂–O₂ fuel cell', build: fuelCell }]
}));

/* ---------- Ch 3 Chemical Kinetics ---------- */
reg(Object.assign({}, CH, {
  id: 'c12-3-1', cls: 12, unit: UP, ch: 'Ch 3 — Chemical Kinetics', fig: 'Reaction rate graphs', title: 'Concentration vs time — rate of reaction',
  desc: 'Reactant concentration decreases and product concentration increases with time. The slope of the tangent at any instant gives the instantaneous rate; average rate = Δ[R]/Δt over an interval.',
  points: ['Rate = −Δ[R]/Δt = +Δ[P]/Δt; units mol L⁻¹ s⁻¹.', 'Instantaneous rate = −d[R]/dt (slope of tangent).', 'Rate law: rate = k[A]ˣ[B]ʸ; order = x + y (experimental); molecularity is theoretical (1, 2, 3).', 'Rate decreases with time as reactant concentration falls (except zero order).'],
  build() {
    const g = H.grp(), labels = [];
    const R = t => 1.0 * Math.exp(-0.28 * t), Pf = t => 1.0 - R(t);
    const G = H.graph({ w: 4.8, h: 3, xr: [0, 10], yr: [0, 1.1], xl: 'Time (t)', yl: 'Concentration', nx: 10, ny: 5, curves: [{ f: R, color: C.orange, r: 0.035, label: '[R] reactant' }, { f: Pf, color: C.green, r: 0.035, label: '[P] product' }], vl: [{ x: 2, y: R(2) }, { x: 5, y: R(5) }] });
    g.add(G);
    // tangent at t=3
    const t0 = 3, m = -0.28 * R(t0); const tp = [G.map(t0 - 2, R(t0) - 2 * m), G.map(t0 + 2, R(t0) + 2 * m)]; g.add(H.line(tp, C.yellow)); g.add(H.sphere(0.06, C.yellow, G.map(t0, R(t0), 0.07), { e: 0.9 }));
    g.add(H.line([G.map(2, R(2)), G.map(5, R(2))], C.cyan, { dashed: true })); g.add(H.line([G.map(5, R(2)), G.map(5, R(5))], C.cyan, { dashed: true }));
    g.add(H.text('Δt', { size: 0.14, pos: G.map(3.5, R(2) + 0.06), color: C.cyan })); g.add(H.text('Δ[R]', { size: 0.14, pos: G.map(5.6, (R(2) + R(5)) / 2), color: C.cyan }));
    labels.push(L('[R] decreases with time', 'Reactant consumed', G.map(1, R(1))));
    labels.push(L('[P] increases with time', 'Product formed', G.map(1, Pf(1))));
    labels.push(L('Tangent — instantaneous rate', 'r_inst = −d[R]/dt = slope at that instant', G.map(t0, R(t0))));
    labels.push(L('Average rate', '−Δ[R]/Δt over the interval t₁ → t₂', G.map(3.5, R(2))));
    labels.push(L('Curves meet', 'Where [R] = [P]', G.map(2.5, 0.5)));
    labels.push(L('Rate slows down', 'Slope decreases as [R] falls', G.map(9, R(9))));
    return { g, labels };
  }
}));

function intRate(kind) {
  const g = H.grp(), labels = [];
  if (kind === 'zero') {
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [0, 1.1], xl: 'Time (t)', yl: '[R]', nx: 10, ny: 5, curves: [{ f: t => 1.0 - 0.08 * t, color: C.orange, r: 0.035 }] });
    g.add(G);
    g.add(H.text('[R] = −kt + [R]₀', { size: 0.18, pos: G.map(6, 0.85), color: C.white })); g.add(H.text('slope = −k', { size: 0.16, pos: G.map(7, 0.55), color: C.yellow }));
    labels.push(L('Zero-order plot: [R] vs t', 'Straight line with negative slope', G.map(5, 0.6)));
    labels.push(L('Intercept = [R]₀', 'Initial concentration', G.map(0, 1.0)));
    labels.push(L('Slope = −k', 'Units of k: mol L⁻¹ s⁻¹', G.map(8, 0.36)));
    labels.push(L('t½ = [R]₀ / 2k', 'Half-life ∝ initial concentration', G.map(6.25, 0.5)));
    return { g, labels, note: 'Zero order: rate independent of [R] (e.g. decomposition of NH₃ on Pt at high pressure, enzyme reactions).' };
  }
  if (kind === 'first') {
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [-2.2, 0.2], xl: 'Time (t)', yl: 'ln [R]', nx: 10, ny: 6, yt: [[0, '0'], [-1, '−1'], [-2, '−2']], curves: [{ f: t => -0.2 * t, color: C.green, r: 0.035 }] });
    g.add(G);
    g.add(H.text('ln [R] = −kt + ln [R]₀', { size: 0.18, pos: G.map(6.2, -0.4), color: C.white })); g.add(H.text('slope = −k', { size: 0.16, pos: G.map(7.5, -1.1), color: C.yellow }));
    labels.push(L('First-order plot: ln [R] vs t', 'Straight line, slope −k', G.map(5, -1.0)));
    labels.push(L('Intercept = ln [R]₀', 'At t = 0', G.map(0, 0)));
    labels.push(L('Slope = −k', 'k in s⁻¹ (time⁻¹)', G.map(8, -1.6)));
    labels.push(L('t½ = 0.693 / k', 'Half-life independent of initial concentration', G.map(3.5, -0.7)));
    return { g, labels, note: 'First order: rate ∝ [R]; k = (2.303/t) log([R]₀/[R]); t½ = 0.693/k (radioactive decay, N₂O₅ decomposition).' };
  }
  const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [0, 1.1], xl: 'Time (t)', yl: 'log ([R]₀/[R])', nx: 10, ny: 5, curves: [{ f: t => 0.1 * t, color: C.purple, r: 0.035 }] });
  g.add(G);
  g.add(H.text('slope = k / 2.303', { size: 0.16, pos: G.map(7, 0.5), color: C.yellow }));
  labels.push(L('Alternative first-order plot', 'log([R]₀/[R]) vs t — straight line through origin', G.map(5, 0.5)));
  labels.push(L('Slope = k/2.303', 'From k = (2.303/t) log([R]₀/[R])', G.map(8, 0.65)));
  labels.push(L('Passes through origin', 'log 1 = 0 at t = 0', G.map(0, 0)));
  return { g, labels, note: 'log([R]₀/[R]) vs t gives a straight line through the origin with slope k/2.303 for a first-order reaction.' };
}
reg(Object.assign({}, CH, {
  id: 'c12-3-2', cls: 12, unit: UP, ch: 'Ch 3 — Chemical Kinetics', fig: 'Integrated rate law graphs', title: 'Integrated rate laws: zero & first order plots',
  desc: 'Integrated rate equations give linear plots: [R] vs t for zero order (slope −k); ln [R] vs t for first order (slope −k); log([R]₀/[R]) vs t (slope k/2.303).',
  points: ['Zero: [R] = [R]₀ − kt; t½ = [R]₀/2k. First: k = (2.303/t) log([R]₀/[R]); t½ = 0.693/k.', 'Units of k: zero mol L⁻¹ s⁻¹; first s⁻¹; second L mol⁻¹ s⁻¹.', 'Pseudo-first order: excess of one reactant (ester hydrolysis, sucrose inversion).', 'Half-life of first order is constant — basis of radioactive dating.'],
  variants: [{ name: 'Zero order', build: () => intRate('zero') }, { name: 'First order (ln[R])', build: () => intRate('first') }, { name: 'First order (log ratio)', build: () => intRate('ratio') }]
}));

reg(Object.assign({}, CH, {
  id: 'c12-3-3', cls: 12, unit: UP, ch: 'Ch 3 — Chemical Kinetics', fig: 'Arrhenius plot', title: 'Arrhenius equation: ln k vs 1/T',
  desc: 'k = A e^(−Ea/RT). Taking logs: ln k = ln A − Ea/RT, so a plot of ln k against 1/T is a straight line with slope −Ea/R and intercept ln A.',
  points: ['Ea = activation energy — minimum energy barrier; A = frequency (pre-exponential) factor.', 'Slope = −Ea/R → Ea = −slope × R; steeper slope = larger Ea.', 'Two-temperature form: log(k₂/k₁) = (Ea/2.303R)(1/T₁ − 1/T₂).', 'Catalyst lowers Ea (alternative pathway); temperature ↑10 K roughly doubles rate.'],
  build() {
    const g = H.grp(), labels = [];
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [-1, 4], xl: '1/T (K⁻¹)', yl: 'ln k', nx: 10, ny: 5, yt: [[0, '0'], [2, '2'], [4, '4']], curves: [{ f: x => 3.5 - 0.42 * x, color: C.red, r: 0.035 }] });
    g.add(G);
    g.add(H.line([G.map(3, 3.5 - 0.42 * 3), G.map(7, 3.5 - 0.42 * 3)], C.cyan, { dashed: true })); g.add(H.line([G.map(7, 3.5 - 0.42 * 3), G.map(7, 3.5 - 0.42 * 7)], C.cyan, { dashed: true }));
    g.add(H.text('ln k = ln A − Ea/RT', { size: 0.18, pos: G.map(6.5, 3.4), color: C.white })); g.add(H.text('slope = −Ea/R', { size: 0.16, pos: G.map(7.8, 2.2), color: C.yellow }));
    g.add(H.sphere(0.07, C.yellow, G.map(0, 3.5, 0.07), { e: 0.9 }));
    labels.push(L('Straight line', 'Confirms Arrhenius behaviour', G.map(5, 3.5 - 0.42 * 5)));
    labels.push(L('Intercept = ln A', 'Frequency factor (collision frequency & orientation)', G.map(0, 3.5)));
    labels.push(L('Slope = −Ea/R', 'Activation energy from gradient; R = 8.314 J K⁻¹ mol⁻¹', G.map(7, 3.5 - 0.42 * 5)));
    labels.push(L('High T (small 1/T)', 'Larger k — faster reaction', G.map(0.8, 3.5 - 0.42 * 0.8)));
    labels.push(L('Low T (large 1/T)', 'Smaller k', G.map(9.5, 3.5 - 0.42 * 9.5)));
    return { g, labels };
  }
}));


/* ---------- Class 11 Ch 3 Chemical Bonding ---------- */
function vsepr(kind) {
  const g = H.grp(), labels = [];
  const d = 1.5;
  const eq = [[1, 0, 0], [-0.5, 0, 0.866], [-0.5, 0, -0.866]], ax = [[0, 1, 0], [0, -1, 0]];
  const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const put = (cen, lig, dirs, lones) => { g.add(H.atom(cen, [0, 0, 0], { r: 0.42 })); dirs.forEach(v => { const p = v.map(c => c * d); g.add(H.bond([0, 0, 0], p)); g.add(H.atom(lig, p, { r: 0.3 })); }); lones.forEach(v => g.add(H.lone([0, 0, 0], v))); };
  if (kind === 'ClF3') { put('Cl', 'F', [ax[0], ax[1], eq[0]], [eq[1], eq[2]]); labels.push(L('ClF₃ — T-shaped', 'Trigonal bipyramidal electron geometry; 3 bond pairs + 2 lone pairs', [0, 0, 0])); labels.push(L('Lone pairs in equatorial positions', 'Minimise lp–lp & lp–bp repulsions (more space at 120°)', [eq[1][0] * 0.7, 0, eq[1][2] * 0.7])); labels.push(L('Axial F atoms', 'Bent slightly away from lone pairs (F–Cl–F ≈ 175°)', [0, d, 0])); labels.push(L('Equatorial F', 'Cl is sp³d hybridised', [d, 0, 0])); }
  if (kind === 'SF4') { put('S', 'F', [ax[0], ax[1], eq[0], eq[1]], [eq[2]]); labels.push(L('SF₄ — see-saw', '4 bond pairs + 1 lone pair; trigonal bipyramidal base', [0, 0, 0])); labels.push(L('Lone pair equatorial', 'Occupies equatorial position — less repulsion', [eq[2][0] * 0.7, 0, eq[2][2] * 0.7])); labels.push(L('Axial F (2)', 'Longer bonds; bent toward each other slightly', [0, -d, 0])); labels.push(L('Equatorial F (2)', 'F–S–F ≈ 102° (compressed from 120°)', [eq[1][0] * d, 0, eq[1][2] * d])); }
  if (kind === 'BrF5') { put('Br', 'F', oct.slice(0, 5), [oct[5]]); labels.push(L('BrF₅ — square pyramidal', '5 bond pairs + 1 lone pair; octahedral base; sp³d²', [0, 0, 0])); labels.push(L('Lone pair', 'Occupies one axial position; pushes basal F atoms up', [0, 0, -0.7])); labels.push(L('Apical F', 'Opposite the lone pair', [0, 0, d])); labels.push(L('Basal (square) F atoms', 'Four F in a plane slightly above lone pair', [d, 0, 0])); }
  if (kind === 'SF6') { put('S', 'F', oct, []); labels.push(L('SF₆ — octahedral', '6 bond pairs, no lone pairs; sp³d²; all F–S–F = 90°/180°', [0, 0, 0])); labels.push(L('Axial F', 'Equivalent to equatorial in a regular octahedron', [0, d, 0])); labels.push(L('Equatorial F (4)', 'Square planar arrangement', [d, 0, 0])); labels.push(L('Non-polar molecule', 'Symmetric — dipoles cancel', [-d * 0.7, -d * 0.7, 0])); }
  if (kind === 'XeF4') { put('Xe', 'F', oct.slice(0, 4), [oct[4], oct[5]]); labels.push(L('XeF₄ — square planar', '4 bond pairs + 2 lone pairs (trans, axial); sp³d²', [0, 0, 0])); labels.push(L('Lone pairs axial (opposite)', 'Minimises lp–lp repulsion', [0, 0, 0.7])); labels.push(L('F atoms in a plane', 'F–Xe–F = 90°', [d, 0, 0])); }
  if (kind === 'NH3') { const t = [[0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]]; put('N', 'H', t, [[0, 1, 0]]); labels.push(L('NH₃ — trigonal pyramidal', '3 bp + 1 lp; sp³; H–N–H = 107° (< 109.5°)', [0, 0, 0])); labels.push(L('Lone pair', 'Repels bond pairs more strongly (lp–bp > bp–bp)', [0, 0.7, 0])); labels.push(L('N–H bonds', 'Pushed closer together', [0.94 * d, -0.33 * d, 0])); }
  if (kind === 'H2O') { put('O', 'H', [[0.79, -0.61, 0], [-0.79, -0.61, 0]], [[0, 0.6, 0.8], [0, 0.6, -0.8]]); labels.push(L('H₂O — bent (V-shaped)', '2 bp + 2 lp; sp³; H–O–H = 104.5°', [0, 0, 0])); labels.push(L('Two lone pairs', 'Greater repulsion → smaller bond angle than NH₃', [0, 0.45, 0.6])); labels.push(L('O–H bond', 'Polar; molecule polar', [0.79 * d, -0.61 * d, 0])); }
  if (kind === 'PCl5') { put('P', 'Cl', eq.concat(ax), []); labels.push(L('PCl₅ — trigonal bipyramidal', '5 bp; sp³d; equatorial 120°, axial 90°', [0, 0, 0])); labels.push(L('Axial bonds (longer, 240 pm)', 'Suffer more repulsion from 3 equatorial pairs at 90°', [0, d, 0])); labels.push(L('Equatorial bonds (shorter, 202 pm)', 'Only 2 neighbours at 90°', [d, 0, 0])); }
  if (kind === 'CH4') { const t = [[0.58, 0.58, 0.58], [-0.58, -0.58, 0.58], [-0.58, 0.58, -0.58], [0.58, -0.58, -0.58]]; put('C', 'H', t, []); labels.push(L('CH₄ — tetrahedral', '4 bp; sp³; H–C–H = 109.5°', [0, 0, 0])); labels.push(L('C–H bond', 'All equivalent', [0.58 * d, 0.58 * d, 0.58 * d])); }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c11-3-1', cls: 11, unit: UI, ch: 'Ch 3 — Chemical Bonding & Molecular Structure', fig: 'VSEPR geometries', title: 'VSEPR molecular shapes',
  desc: 'VSEPR theory: electron pairs around the central atom arrange to minimise repulsion (lp–lp > lp–bp > bp–bp). Lone pairs distort ideal geometries: ClF₃ T-shaped, SF₄ see-saw, BrF₅ square pyramidal, SF₆ octahedral.',
  points: ['5 pairs → trigonal bipyramidal base: PCl₅ (0 lp), SF₄ see-saw (1 lp), ClF₃ T-shape (2 lp), XeF₂ linear (3 lp).', '6 pairs → octahedral base: SF₆ (0 lp), BrF₅ square pyramidal (1 lp), XeF₄ square planar (2 lp).', 'Lone pairs occupy equatorial positions in trigonal bipyramid (more room).', 'Bond angles: CH₄ 109.5°, NH₃ 107°, H₂O 104.5°.'],
  variants: [{ name: 'ClF₃ (T-shape)', build: () => vsepr('ClF3') }, { name: 'SF₄ (see-saw)', build: () => vsepr('SF4') }, { name: 'BrF₅ (sq. pyramidal)', build: () => vsepr('BrF5') }, { name: 'SF₆ (octahedral)', build: () => vsepr('SF6') }, { name: 'XeF₄ (sq. planar)', build: () => vsepr('XeF4') }, { name: 'PCl₅', build: () => vsepr('PCl5') }, { name: 'CH₄', build: () => vsepr('CH4') }, { name: 'NH₃', build: () => vsepr('NH3') }, { name: 'H₂O', build: () => vsepr('H2O') }]
}));

function overlap(kind) {
  const g = H.grp(), labels = [];
  const P = '#60a5fa', N = '#f472b6';
  if (kind === 'ss') { g.add(H.sphere(0.9, P, [-0.9, 0, 0], { op: 0.45 })); g.add(H.sphere(0.9, P, [0.9, 0, 0], { op: 0.45 })); g.add(H.sphere(0.1, C.white, [-0.9, 0, 0])); g.add(H.sphere(0.1, C.white, [0.9, 0, 0])); g.add(H.line([[-2.5, 0, 0], [2.5, 0, 0]], C.grey, { dashed: true })); labels.push(L('s–s overlap → σ bond', 'Two s orbitals overlap head-on along the internuclear axis (H₂)', [0, 0, 0.5])); labels.push(L('Internuclear axis', 'Overlap region lies ON the axis', [2.4, 0, 0])); labels.push(L('Nuclei', 'Electron density between them', [-0.9, 0, 0])); }
  if (kind === 'sp') { g.add(H.sphere(0.8, P, [-1.4, 0, 0], { op: 0.45 })); g.add(H.lobe(1.6, 0.6, P, [1.4, 0, 0], [-1, 0, 0])); g.add(H.lobe(1.6, 0.6, N, [1.4, 0, 0], [1, 0, 0])); g.add(H.sphere(0.1, C.white, [-1.4, 0, 0])); g.add(H.sphere(0.1, C.white, [1.4, 0, 0])); g.add(H.line([[-2.8, 0, 0], [3.4, 0, 0]], C.grey, { dashed: true })); labels.push(L('s–p overlap → σ bond', 's orbital with one lobe of p orbital along the axis (HF, HCl)', [0, 0, 0.4])); labels.push(L('s orbital', 'Spherical', [-1.4, 0.5, 0])); labels.push(L('p orbital (lobe toward s)', 'Same-sign lobe overlaps', [1.4, 0.7, 0])); }
  if (kind === 'pp') { g.add(H.lobe(1.5, 0.55, P, [-1.5, 0, 0], [1, 0, 0])); g.add(H.lobe(1.5, 0.55, N, [-1.5, 0, 0], [-1, 0, 0])); g.add(H.lobe(1.5, 0.55, P, [1.5, 0, 0], [-1, 0, 0])); g.add(H.lobe(1.5, 0.55, N, [1.5, 0, 0], [1, 0, 0])); g.add(H.sphere(0.1, C.white, [-1.5, 0, 0])); g.add(H.sphere(0.1, C.white, [1.5, 0, 0])); g.add(H.line([[-3.4, 0, 0], [3.4, 0, 0]], C.grey, { dashed: true })); labels.push(L('p–p head-on overlap → σ bond', 'Along internuclear axis (F₂, Cl₂); strong', [0, 0, 0.4])); labels.push(L('Overlapping lobes', 'Same sign (+ with +)', [0, 0.5, 0])); labels.push(L('Free (rotation possible)', 'σ bond symmetric about the axis', [2.5, -0.7, 0])); }
  if (kind === 'pi') { g.add(H.lobe(1.4, 0.55, P, [-1.0, 0, 0], [0, 1, 0])); g.add(H.lobe(1.4, 0.55, N, [-1.0, 0, 0], [0, -1, 0])); g.add(H.lobe(1.4, 0.55, P, [1.0, 0, 0], [0, 1, 0])); g.add(H.lobe(1.4, 0.55, N, [1.0, 0, 0], [0, -1, 0])); g.add(H.sphere(0.1, C.white, [-1.0, 0, 0])); g.add(H.sphere(0.1, C.white, [1.0, 0, 0])); g.add(H.rod([-1.0, 0, 0], [1.0, 0, 0], 0.05, C.grey)); g.add(H.ell(0.9, 0.45, 0.45, C.yellow, [0, 1.0, 0], { op: 0.25 })); g.add(H.ell(0.9, 0.45, 0.45, C.yellow, [0, -1.0, 0], { op: 0.25 })); labels.push(L('p–p sideways overlap → π bond', 'Lobes parallel, overlap ABOVE and BELOW the axis (C=C, O₂)', [0, 1.0, 0])); labels.push(L('Nodal plane on the axis', 'Electron density zero along internuclear line', [1.6, 0, 0])); labels.push(L('Weaker than σ', 'Less overlap; π bond forms only after σ; restricts rotation', [0, -1.0, 0])); labels.push(L('σ bond (already formed)', 'Along the axis', [0, 0, 0.1])); }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c11-3-2', cls: 11, unit: UI, ch: 'Ch 3 — Chemical Bonding & Molecular Structure', fig: 'Orbital overlap', title: 'σ and π bond formation',
  desc: 'Valence bond theory: covalent bonds form by overlap of half-filled atomic orbitals. Head-on (axial) overlap gives σ bonds; sideways (lateral) overlap of p orbitals gives π bonds.',
  points: ['σ: s–s, s–p, p–p (head-on); electron density along the axis; free rotation.', 'π: p–p sideways; density above & below the plane; forms only after σ; weaker; restricts rotation.', 'Single bond = 1σ; double = 1σ + 1π; triple = 1σ + 2π.', 'Bond strength ∝ extent of overlap: p–p σ > s–p σ > s–s σ; σ > π.'],
  variants: [{ name: 's–s σ', build: () => overlap('ss') }, { name: 's–p σ', build: () => overlap('sp') }, { name: 'p–p σ', build: () => overlap('pp') }, { name: 'p–p π', build: () => overlap('pi') }]
}));

function moDiagram(mol) {
  const g = H.grp(), labels = [];
  const isN = mol === 'N2';
  const xL = -2.2, xR = 2.2, xM = 0;
  const lv = (x, y, col, lab, e, o) => g.add(H.level(x, y, 0.7, col, lab, e, o));
  // atomic orbitals
  lv(xL, -2.2, C.grey, '2s', 'ud', { lx: -0.8 }); lv(xR, -2.2, C.grey, '2s', 'ud'); lv(xL, 0.0, C.grey, '2p', null, { lx: -0.8 }); lv(xR, 0.0, C.grey, '2p');
  const pe = isN ? ['u', 'u', 'u'] : ['ud', 'u', 'u'];
  for (let i = 0; i < 3; i++) { g.add(H.box(0.3, 0.04, 0.06, C.grey, [xL + (i - 1) * 0.35, 0.0, 0])); g.add(H.box(0.3, 0.04, 0.06, C.grey, [xR + (i - 1) * 0.35, 0.0, 0])); }
  [['u', 'u', 'u'], ['u', 'u', 'u']].forEach((arr, s) => arr.forEach((e, i) => { const x = (s ? xR : xL) + (i - 1) * 0.35; g.add(H.arrow([x, 0.02, 0.03], [x, 0.32, 0.03], '#fde68a', { r: 0.012, head: 0.08, hr: 0.04 })); }));
  if (!isN) { g.add(H.arrow([xL - 0.35 + 0.08, 0.32, 0.03], [xL - 0.35 + 0.08, 0.02, 0.03], '#fde68a', { r: 0.012, head: 0.08, hr: 0.04 })); g.add(H.arrow([xR - 0.35 + 0.08, 0.32, 0.03], [xR - 0.35 + 0.08, 0.02, 0.03], '#fde68a', { r: 0.012, head: 0.08, hr: 0.04 })); }
  // molecular orbitals
  lv(xM, -2.9, C.blue, 'σ2s', 'ud'); lv(xM, -1.6, C.red, 'σ*2s', 'ud');
  const pos = {};
  if (isN) { pos.pi = -0.5; pos.sig = 0.4; pos.pistar = 1.6; pos.sigstar = 2.6; }
  else { pos.sig = -0.6; pos.pi = 0.3; pos.pistar = 1.5; pos.sigstar = 2.6; }
  lv(xM, pos.sig, C.blue, 'σ2p_z', 'ud');
  g.add(H.level(xM - 0.4, pos.pi, 0.6, C.green, null, 'ud')); g.add(H.level(xM + 0.4, pos.pi, 0.6, C.green, 'π2p_x, π2p_y', 'ud', { lx: 0.5 }));
  g.add(H.level(xM - 0.4, pos.pistar, 0.6, C.orange, null, isN ? null : 'u')); g.add(H.level(xM + 0.4, pos.pistar, 0.6, C.orange, 'π*2p_x, π*2p_y', isN ? null : 'u', { lx: 0.5 }));
  lv(xM, pos.sigstar, C.red, 'σ*2p_z', null);
  // correlation lines
  const cl = (y0, y1) => { g.add(H.line([[xL + 0.35, y0, 0], [xM - 0.35, y1, 0]], C.dgrey, { dashed: true })); g.add(H.line([[xR - 0.35, y0, 0], [xM + 0.35, y1, 0]], C.dgrey, { dashed: true })); };
  cl(-2.2, -2.9); cl(-2.2, -1.6); cl(0, pos.sig); cl(0, pos.pi); cl(0, pos.pistar); cl(0, pos.sigstar);
  g.add(H.text(isN ? 'N' : 'O', { size: 0.3, bold: true, pos: [xL, 3.2, 0] })); g.add(H.text(isN ? 'N₂' : 'O₂', { size: 0.3, bold: true, pos: [xM, 3.2, 0] })); g.add(H.text(isN ? 'N' : 'O', { size: 0.3, bold: true, pos: [xR, 3.2, 0] }));
  g.add(H.arrow([-3.3, -3.0, 0], [-3.3, 3.0, 0], C.grey, { r: 0.015, head: 0.15 })); g.add(H.text('Energy', { size: 0.16, pos: [-3.3, 3.3, 0], color: C.grey }));
  labels.push(L(isN ? 'N₂: σ2p_z ABOVE π2p' : 'O₂: σ2p_z BELOW π2p', isN ? 'For B₂, C₂, N₂ (s–p mixing): π2p_x = π2p_y < σ2p_z' : 'For O₂, F₂, Ne₂: σ2p_z < π2p_x = π2p_y', [xM, pos.sig, 0]));
  labels.push(L('σ2s (bonding)', 'Lowest energy MO from 2s combination', [xM, -2.9, 0]));
  labels.push(L('σ*2s (antibonding)', 'Node between nuclei', [xM, -1.6, 0]));
  labels.push(L('π2p_x, π2p_y (degenerate)', 'Bonding π orbitals — equal energy', [xM + 0.4, pos.pi, 0]));
  labels.push(L(isN ? 'π*2p empty' : 'π*2p — two unpaired electrons', isN ? 'N₂ diamagnetic; bond order = (10−4)/2 = 3' : 'Hund\'s rule: one in each → O₂ PARAMAGNETIC; bond order = (10−6)/2 = 2', [xM + 0.4, pos.pistar, 0]));
  labels.push(L('σ*2p_z (highest)', 'Empty antibonding', [xM, pos.sigstar, 0]));
  labels.push(L('Atomic 2p orbitals', isN ? '3 unpaired electrons each' : '4 electrons each (2p⁴)', [xL, 0, 0]));
  labels.push(L('Atomic 2s orbitals', 'Filled (2 electrons)', [xR, -2.2, 0]));
  return { g, labels, note: isN ? 'N₂: KK σ2s² σ*2s² π2p_x² π2p_y² σ2p_z² — bond order 3, diamagnetic.' : 'O₂: KK σ2s² σ*2s² σ2p_z² π2p_x² π2p_y² π*2p_x¹ π*2p_y¹ — bond order 2, paramagnetic (2 unpaired e⁻).' };
}
reg(Object.assign({}, CH, {
  id: 'c11-3-3', cls: 11, unit: UI, ch: 'Ch 3 — Chemical Bonding & Molecular Structure', fig: 'MO diagrams', title: 'Molecular orbital diagrams: N₂ and O₂',
  desc: 'Atomic orbitals combine (LCAO) into bonding and antibonding molecular orbitals. The energy order differs: for O₂ and F₂, σ2p_z lies below π2p; for B₂, C₂, N₂ the π2p orbitals lie below σ2p_z.',
  points: ['Bond order = (N_b − N_a)/2. N₂: 3 (diamagnetic); O₂: 2 (paramagnetic, 2 unpaired e⁻ in π*).', 'O₂⁺: 2.5; O₂⁻: 1.5; O₂²⁻: 1 — stability O₂⁺ > O₂ > O₂⁻ > O₂²⁻.', 'Order for O₂/F₂: σ1s<σ*1s<σ2s<σ*2s<σ2p_z<(π2p_x=π2p_y)<(π*2p_x=π*2p_y)<σ*2p_z.', 'Order for Li₂–N₂: σ2s<σ*2s<(π2p_x=π2p_y)<σ2p_z<(π*2p_x=π*2p_y)<σ*2p_z.'],
  variants: [{ name: 'O₂', build: () => moDiagram('O2') }, { name: 'N₂', build: () => moDiagram('N2') }]
}));

/* ---------- Class 12 Ch 6 d- and f-block ---------- */
function oxoanion(kind) {
  const g = H.grp(), labels = [];
  const T = [[0.58, 0.58, 0.58], [-0.58, -0.58, 0.58], [-0.58, 0.58, -0.58], [0.58, -0.58, -0.58]];
  const tet = (cen, pos, col, exclude = -1) => { g.add(H.atom(cen, pos, { r: 0.4, color: col })); T.forEach((v, i) => { if (i === exclude) return; const p = [pos[0] + v[0] * 1.5, pos[1] + v[1] * 1.5, pos[2] + v[2] * 1.5]; g.add(H.bond(pos, p, { order: 1 })); g.add(H.atom('O', p, { r: 0.3 })); }); };
  if (kind === 'CrO4') { tet('Cr', [0, 0, 0], '#facc15'); labels.push(L('Chromate ion CrO₄²⁻', 'Tetrahedral; Cr in +6 oxidation state; yellow', [0, 0, 0])); labels.push(L('Cr–O bonds (equal)', 'All four equivalent — resonance; Cr–O ≈ 166 pm', [0.58 * 1.5, 0.58 * 1.5, 0.58 * 1.5])); labels.push(L('Stable in basic/neutral medium', 'Acidify → converts to dichromate', [-0.58 * 1.5, -0.58 * 1.5, 0.58 * 1.5])); }
  if (kind === 'Cr2O7') { const c1 = [-1.3, 0, 0], c2 = [1.3, 0, 0]; const bridge = [0, 0.55, 0]; g.add(H.atom('Cr', c1, { r: 0.4, color: '#f97316' })); g.add(H.atom('Cr', c2, { r: 0.4, color: '#f97316' })); g.add(H.atom('O', bridge, { r: 0.3 })); g.add(H.bond(c1, bridge)); g.add(H.bond(c2, bridge)); [[-0.9, -0.5, 0.8], [-0.9, -0.5, -0.8], [-0.7, 0.9, 0]].forEach(v => { const p = [c1[0] + v[0] * 1.3, c1[1] + v[1] * 1.3, c1[2] + v[2] * 1.3]; g.add(H.bond(c1, p)); g.add(H.atom('O', p, { r: 0.3 })); }); [[0.9, -0.5, 0.8], [0.9, -0.5, -0.8], [0.7, 0.9, 0]].forEach(v => { const p = [c2[0] + v[0] * 1.3, c2[1] + v[1] * 1.3, c2[2] + v[2] * 1.3]; g.add(H.bond(c2, p)); g.add(H.atom('O', p, { r: 0.3 })); }); labels.push(L('Dichromate ion Cr₂O₇²⁻', 'Two tetrahedra sharing one corner (bridging O); orange', [0, -0.6, 0])); labels.push(L('Bridging oxygen — Cr–O–Cr = 126°', 'Cr–O(bridge) 179 pm (longer)', bridge)); labels.push(L('Terminal Cr–O (163 pm)', 'Shorter, double-bond character', [c2[0] + 0.9 * 1.3, c2[1] - 0.5 * 1.3, c2[2] + 0.8 * 1.3])); labels.push(L('Cr (+6)', 'Strong oxidising agent in acid: Cr₂O₇²⁻ + 14H⁺ + 6e⁻ → 2Cr³⁺ + 7H₂O', c1)); }
  if (kind === 'MnO4-') { tet('Mn', [0, 0, 0], '#a855f7'); labels.push(L('Permanganate ion MnO₄⁻', 'Tetrahedral; Mn +7; intense purple (charge-transfer)', [0, 0, 0])); labels.push(L('Mn–O bonds (π bonding)', 'Mn–O ≈ 163 pm; O p-orbitals → empty Mn d-orbitals', [0.58 * 1.5, 0.58 * 1.5, 0.58 * 1.5])); labels.push(L('Diamagnetic', 'd⁰ Mn(VII); strong oxidant', [-0.58 * 1.5, 0.58 * 1.5, -0.58 * 1.5])); }
  if (kind === 'MnO4--') { tet('Mn', [0, 0, 0], '#22c55e'); labels.push(L('Manganate ion MnO₄²⁻', 'Tetrahedral; Mn +6; dark green', [0, 0, 0])); labels.push(L('Paramagnetic (1 unpaired e⁻)', 'd¹ Mn(VI)', [0.58 * 1.5, 0.58 * 1.5, 0.58 * 1.5])); labels.push(L('Disproportionates in acid', '3MnO₄²⁻ + 4H⁺ → 2MnO₄⁻ + MnO₂ + 2H₂O', [-0.58 * 1.5, -0.58 * 1.5, 0.58 * 1.5])); }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-6-1', cls: 12, unit: UI, ch: 'Ch 6 — The d- and f-Block Elements', fig: 'Oxoanions', title: 'Structures of chromate, dichromate, manganate & permanganate',
  desc: 'Chromate and dichromate (Cr +6) and manganate/permanganate (Mn +6/+7) ions are tetrahedral oxoanions. Dichromate consists of two tetrahedra sharing a corner with Cr–O–Cr angle 126°.',
  points: ['2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O (pH-dependent interconversion: yellow ⇌ orange).', 'KMnO₄ prepared from MnO₂: fusion with KOH/air → K₂MnO₄ (green) → electrolytic oxidation → KMnO₄ (purple).', 'Permanganate colour due to charge transfer (not d–d); manganate paramagnetic, permanganate diamagnetic.', 'Both are strong oxidants: acidic KMnO₄ (5e⁻), K₂Cr₂O₇ (6e⁻).'],
  variants: [{ name: 'Chromate CrO₄²⁻', build: () => oxoanion('CrO4') }, { name: 'Dichromate Cr₂O₇²⁻', build: () => oxoanion('Cr2O7') }, { name: 'Manganate MnO₄²⁻', build: () => oxoanion('MnO4--') }, { name: 'Permanganate MnO₄⁻', build: () => oxoanion('MnO4-') }]
}));

/* ---------- Ch 7 Coordination compounds ---------- */
function isomer(kind) {
  const g = H.grp(), labels = [];
  const d = 1.5;
  const sqPlanar = (cen, lig, pos) => { g.add(H.atom(cen, pos, { r: 0.4 })); const dirs = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]]; dirs.forEach((v, i) => { const p = [pos[0] + v[0] * d, pos[1], pos[2] + v[2] * d]; g.add(H.bond(pos, p)); g.add(H.atom(lig[i], p, { r: lig[i] === 'Cl' ? 0.3 : 0.27, label: lig[i] === 'N' ? 'NH₃' : lig[i] })); }); g.add(H.plane(3.4, 3.4, C.grey, pos, [PI / 2, 0, 0], { op: 0.1 })); };
  const octa = (cen, lig, pos) => { g.add(H.atom(cen, pos, { r: 0.4 })); const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]; dirs.forEach((v, i) => { const p = [pos[0] + v[0] * d, pos[1] + v[1] * d, pos[2] + v[2] * d]; g.add(H.bond(pos, p)); g.add(H.atom(lig[i], p, { r: 0.28, label: lig[i] === 'N' ? 'NH₃' : lig[i] })); }); };
  if (kind === 'cistrans-sq') { sqPlanar('Pt', ['N', 'N', 'Cl', 'Cl'], [-2.2, 0, 0]); sqPlanar('Pt', ['N', 'Cl', 'N', 'Cl'], [2.2, 0, 0]); g.add(H.text('cis', { size: 0.26, bold: true, pos: [-2.2, 1.4, 0] })); g.add(H.text('trans', { size: 0.26, bold: true, pos: [2.2, 1.4, 0] })); labels.push(L('cis-[Pt(NH₃)₂Cl₂]', 'Identical ligands adjacent (90°) — cisplatin, anticancer', [-2.2, 0, 0])); labels.push(L('trans-[Pt(NH₃)₂Cl₂]', 'Identical ligands opposite (180°)', [2.2, 0, 0])); labels.push(L('Square planar [MA₂B₂]', 'Geometrical isomerism possible; NOT in tetrahedral', [-2.2 + d, 0, 0])); labels.push(L('Cl ligands opposite', 'trans arrangement', [2.2 + d, 0, 0])); }
  if (kind === 'cistrans-oct') { octa('Co', ['Cl', 'N', 'Cl', 'N', 'N', 'N'], [-2.4, 0, 0]); octa('Co', ['N', 'N', 'N', 'N', 'Cl', 'Cl'], [2.4, 0, 0]); g.add(H.text('cis', { size: 0.26, bold: true, pos: [-2.4, 2.1, 0] })); g.add(H.text('trans', { size: 0.26, bold: true, pos: [2.4, 2.1, 0] })); labels.push(L('cis-[Co(NH₃)₄Cl₂]⁺', 'Two Cl adjacent — violet', [-2.4, 0, 0])); labels.push(L('trans-[Co(NH₃)₄Cl₂]⁺', 'Two Cl opposite (axial) — green', [2.4, 0, 0])); labels.push(L('Cl (cis, 90° apart)', 'Octahedral [MA₄B₂]', [-2.4 + d, 0, 0])); labels.push(L('Cl (trans, 180° apart)', 'Axial positions', [2.4, d, 0])); }
  if (kind === 'facmer') { octa('Co', ['N', 'Cl', 'N', 'Cl', 'N', 'Cl'], [-2.4, 0, 0]); octa('Co', ['N', 'Cl', 'Cl', 'N', 'N', 'Cl'], [2.4, 0, 0]); g.add(H.text('fac', { size: 0.26, bold: true, pos: [-2.4, 2.1, 0] })); g.add(H.text('mer', { size: 0.26, bold: true, pos: [2.4, 2.1, 0] })); labels.push(L('fac-[Co(NH₃)₃(NO₂)₃] type (facial)', 'Three identical ligands on one triangular face', [-2.4, 0, 0])); labels.push(L('mer (meridional)', 'Three identical ligands around a meridian (one plane)', [2.4, 0, 0])); labels.push(L('Facial triangle', 'NH₃ on +x, +z, +y — all mutually cis', [-2.4 + d, 0, 0])); labels.push(L('Meridional plane', 'Two trans + one cis', [2.4 + d, 0, 0])); }
  if (kind === 'optical') { const en = (pos, a, b) => { const A = [pos[0] + a[0] * d, pos[1] + a[1] * d, pos[2] + a[2] * d], B = [pos[0] + b[0] * d, pos[1] + b[1] * d, pos[2] + b[2] * d]; g.add(H.bond(pos, A)); g.add(H.bond(pos, B)); g.add(H.atom('N', A, { r: 0.25 })); g.add(H.atom('N', B, { r: 0.25 })); const mid = [(A[0] + B[0]) / 2 * 1.25 - pos[0] * 0.25, (A[1] + B[1]) / 2 * 1.25 - pos[1] * 0.25, (A[2] + B[2]) / 2 * 1.25 - pos[2] * 0.25]; g.add(H.tube([A, mid, B], 0.06, C.lime, { seg: 12 })); }; const mk = (pos, mirror) => { g.add(H.atom('Co', pos, { r: 0.4 })); const s = mirror ? -1 : 1; en(pos, [s, 0, 0], [0, 0, 1]); en(pos, [-s, 0, 0], [0, 1, 0]); en(pos, [0, -1, 0], [0, 0, -1]); }; mk([-2.4, 0, 0], false); mk([2.4, 0, 0], true); g.add(H.plane(0.02, 4.5, C.white, [0, 0, 0], [0, PI / 2, 0], { op: 0.3 })); g.add(H.text('mirror', { size: 0.16, pos: [0, 2.5, 0], color: C.grey })); g.add(H.text('d (Δ)', { size: 0.26, bold: true, pos: [-2.4, 2.2, 0] })); g.add(H.text('l (Λ)', { size: 0.26, bold: true, pos: [2.4, 2.2, 0] })); labels.push(L('[Co(en)₃]³⁺ — dextro', 'Rotates plane-polarised light to the right', [-2.4, 0, 0])); labels.push(L('[Co(en)₃]³⁺ — laevo', 'Non-superimposable mirror image (enantiomer)', [2.4, 0, 0])); labels.push(L('Chelating en ligand (bidentate)', 'Ethane-1,2-diamine spans two cis positions', [-2.4 + d * 0.6, 0, d * 0.6])); labels.push(L('Mirror plane', 'Optical isomers = chiral pair; common in [M(AA)₃] and cis-[M(AA)₂X₂]', [0, 0, 0])); }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-7-1', cls: 12, unit: UI, ch: 'Ch 7 — Coordination Compounds', fig: 'Isomerism', title: 'Geometrical & optical isomerism in complexes',
  desc: 'Stereoisomers have the same bonds but different spatial arrangement. Geometrical (cis/trans, fac/mer) isomerism occurs in square planar [MA₂B₂] and octahedral complexes; optical isomerism (d/l) in chiral complexes like [Co(en)₃]³⁺.',
  points: ['Tetrahedral complexes show no geometrical isomerism.', 'Square planar [MABXL] has 3 isomers; octahedral [MA₄B₂] cis/trans; [MA₃B₃] fac/mer.', 'Optical: cis-[Co(en)₂Cl₂]⁺ is chiral; trans is not (has plane of symmetry).', 'Structural isomers: linkage (NO₂/ONO), coordination, ionisation, solvate (hydrate).'],
  variants: [{ name: 'cis/trans square planar', build: () => isomer('cistrans-sq') }, { name: 'cis/trans octahedral', build: () => isomer('cistrans-oct') }, { name: 'fac/mer', build: () => isomer('facmer') }, { name: 'Optical (d/l)', build: () => isomer('optical') }]
}));

function cft(oct) {
  const g = H.grp(), labels = [];
  const lv = (x, y, w, col, lab, o) => g.add(H.level(x, y, w, col, lab, null, o));
  // free ion (degenerate 5 d)
  for (let i = 0; i < 5; i++) lv(-2.6 + (i - 2) * 0.3, 0, 0.26, C.grey, null);
  g.add(H.text('free ion (5 degenerate d)', { size: 0.14, pos: [-2.6, -0.4, 0], color: C.grey }));
  // spherical field
  for (let i = 0; i < 5; i++) lv(-0.6 + (i - 2) * 0.3, 0.8, 0.26, C.grey, null);
  g.add(H.text('spherical field', { size: 0.14, pos: [-0.6, 0.4, 0], color: C.grey }));
  g.add(H.line([[-0.2, 0.8, 0], [3.4, 0.8, 0]], C.dgrey, { dashed: true })); g.add(H.text('barycentre', { size: 0.13, pos: [3.6, 0.8, 0], color: C.grey }));
  if (oct) {
    const up = 0.8 + 0.9, dn = 0.8 - 0.6;
    lv(1.6 - 0.2, up, 0.3, C.orange, null); lv(1.6 + 0.2, up, 0.3, C.orange, 'e_g  (d_x²−y², d_z²)', { lx: 0.4 });
    lv(2.0 - 0.35, dn, 0.3, C.green, null); lv(2.0, dn, 0.3, C.green, null); lv(2.0 + 0.35, dn, 0.3, C.green, 't₂g  (d_xy, d_yz, d_xz)', { lx: 0.4 });
    g.add(H.arrow([1.0, dn, 0], [1.0, up, 0], C.yellow, { r: 0.015, head: 0.12 })); g.add(H.text('Δₒ', { size: 0.2, bold: true, pos: [0.75, (up + dn) / 2, 0], color: C.yellow }));
    g.add(H.text('+0.6 Δₒ', { size: 0.13, pos: [1.6, up + 0.25, 0], color: C.orange })); g.add(H.text('−0.4 Δₒ', { size: 0.13, pos: [2.0, dn - 0.25, 0], color: C.green }));
    labels.push(L('Octahedral splitting', 'Ligands approach along axes — d orbitals along axes (e_g) raised more', [1.6, up, 0]));
    labels.push(L('e_g set (higher, 2 orbitals)', 'd_x²−y² and d_z² point AT ligands → more repulsion; +0.6 Δₒ', [1.8, up, 0]));
    labels.push(L('t₂g set (lower, 3 orbitals)', 'd_xy, d_yz, d_xz between axes; −0.4 Δₒ', [2.0, dn, 0]));
    labels.push(L('Δₒ = crystal field splitting energy', 'Depends on ligand strength (spectrochemical series) & metal', [0.75, (up + dn) / 2, 0]));
    labels.push(L('High spin vs low spin (d⁴–d⁷)', 'If Δₒ < P (pairing energy) → high spin (weak field); Δₒ > P → low spin (strong field)', [-2.6, 1.6, 0]));
    labels.push(L('Free metal ion', 'Five degenerate d orbitals', [-2.6, 0, 0]));
  } else {
    const up = 0.8 + 0.4, dn = 0.8 - 0.6;
    lv(1.6 - 0.35, up, 0.3, C.orange, null); lv(1.6, up, 0.3, C.orange, null); lv(1.6 + 0.35, up, 0.3, C.orange, 't₂  (d_xy, d_yz, d_xz)', { lx: 0.4 });
    lv(2.0 - 0.2, dn, 0.3, C.green, null); lv(2.0 + 0.2, dn, 0.3, C.green, 'e  (d_x²−y², d_z²)', { lx: 0.4 });
    g.add(H.arrow([1.0, dn, 0], [1.0, up, 0], C.yellow, { r: 0.015, head: 0.12 })); g.add(H.text('Δₜ', { size: 0.2, bold: true, pos: [0.75, (up + dn) / 2, 0], color: C.yellow }));
    g.add(H.text('+0.4 Δₜ', { size: 0.13, pos: [1.6, up + 0.25, 0], color: C.orange })); g.add(H.text('−0.6 Δₜ', { size: 0.13, pos: [2.0, dn - 0.25, 0], color: C.green }));
    labels.push(L('Tetrahedral splitting (inverted)', 'Ligands between axes → t₂ raised, e lowered', [1.6, up, 0]));
    labels.push(L('t₂ set (higher, 3 orbitals)', 'd_xy, d_yz, d_xz closer to ligands', [1.8, up, 0]));
    labels.push(L('e set (lower, 2 orbitals)', 'd_x²−y², d_z² away from ligands', [2.0, dn, 0]));
    labels.push(L('Δₜ = (4/9) Δₒ', 'Smaller splitting (4 ligands, none on axes) → tetrahedral complexes usually high spin', [0.75, (up + dn) / 2, 0]));
    labels.push(L('Free metal ion', 'Five degenerate d orbitals', [-2.6, 0, 0]));
  }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-7-2', cls: 12, unit: UI, ch: 'Ch 7 — Coordination Compounds', fig: 'Crystal field splitting', title: 'Crystal field splitting: octahedral & tetrahedral',
  desc: 'In an octahedral field the five degenerate d orbitals split into a lower t₂g set (−0.4 Δₒ) and upper e_g set (+0.6 Δₒ). In a tetrahedral field the splitting is inverted and smaller: Δₜ = (4/9) Δₒ.',
  points: ['Spectrochemical series: I⁻ < Br⁻ < SCN⁻ < Cl⁻ < S²⁻ < F⁻ < OH⁻ < C₂O₄²⁻ < H₂O < NCS⁻ < edta⁴⁻ < NH₃ < en < CN⁻ < CO.', 'd⁴ octahedral: Δₒ < P → t₂g³e_g¹ (high spin); Δₒ > P → t₂g⁴ (low spin).', 'Colour arises from d–d transitions; [Ti(H₂O)₆]³⁺ violet (absorbs yellow-green).', 'Tetrahedral complexes: no low spin (Δₜ small).'],
  variants: [{ name: 'Octahedral', build: () => cft(true) }, { name: 'Tetrahedral', build: () => cft(false) }]
}));

/* ---------- Class 11 Ch 8 Organic — purification ---------- */
function flaskRB(pos, r, col, liquidLevel) { const g = H.grp(); g.add(H.sphere(r, C.white, pos, { op: 0.15, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(r * 0.95, col, pos, { op: 0.45, theta: PI - liquidLevel, thetaStart: liquidLevel, side: THREE.DoubleSide })); g.add(H.cyl(r * 0.3, r * 0.3, r * 0.9, C.white, [pos[0], pos[1] + r * 1.2, pos[2]], null, { op: 0.2, open: true, side: THREE.DoubleSide })); return g; }
function condenser(g, a, b, col = C.cyan) { g.add(H.rod(a, b, 0.09, C.white, { op: 0.25, side: THREE.DoubleSide })); g.add(H.rod(a, b, 0.18, col, { op: 0.2, side: THREE.DoubleSide })); const A = vec(a), B = vec(b); const p1 = A.clone().lerp(B, 0.2), p2 = A.clone().lerp(B, 0.8); g.add(H.tube([p1.toArray(), [p1.x, p1.y - 0.5, p1.z]], 0.04, C.cyan)); g.add(H.tube([p2.toArray(), [p2.x, p2.y + 0.5, p2.z]], 0.04, C.cyan)); g.add(H.text('water in', { size: 0.12, pos: [p1.x, p1.y - 0.7, p1.z], color: C.cyan })); g.add(H.text('water out', { size: 0.12, pos: [p2.x, p2.y + 0.7, p2.z], color: C.cyan })); }
function fracDist() {
  const g = H.grp(), labels = [];
  g.add(flaskRB([-2.0, -1.4, 0], 0.8, C.amber, 1.9));
  g.add(H.box(0.9, 0.12, 0.6, C.red, [-2.0, -2.25, 0], null, { e: 0.6 }));
  g.add(H.cyl(0.22, 0.22, 2.6, C.white, [-2.0, 0.6, 0], null, { op: 0.2, open: true, side: THREE.DoubleSide }));
  for (let i = 0; i < 9; i++) g.add(H.sphere(0.16, C.grey, [-2.0 + (i % 2 ? 0.06 : -0.06), -0.5 + i * 0.28, 0], { op: 0.8, seg: 10 }));
  g.add(H.rod([-2.0, 1.9, 0], [-2.0, 2.5, 0], 0.03, C.white)); g.add(H.sphere(0.06, C.red, [-2.0, 2.55, 0]));
  g.add(H.tube([[-1.85, 1.75, 0], [-1.2, 1.7, 0], [0.4, 0.9, 0]], 0.08, C.white, { op: 0.4 }));
  condenser(g, [-0.9, 1.55, 0], [1.6, 0.3, 0]);
  g.add(H.tube([[1.6, 0.3, 0], [2.1, 0.05, 0], [2.3, -0.7, 0]], 0.06, C.white, { op: 0.5 }));
  g.add(H.lathe([[0.5, -2.1], [0.55, -1.2], [0.2, -0.9]], C.white, [2.4, 0, 0], null, { seg: 20, op: 0.2, side: THREE.DoubleSide })); g.add(H.cyl(0.45, 0.45, 0.5, C.lime, [2.4, -1.75, 0], null, { op: 0.5 }));
  labels.push(L('Round-bottom flask (liquid mixture)', 'Two miscible liquids with close boiling points (e.g. crude oil fractions)', [-2.0, -1.4, 0.8]));
  labels.push(L('Heating', 'Both liquids vaporise', [-2.0, -2.25, 0.3]));
  labels.push(L('Fractionating column', 'Packed with glass beads — repeated condensation & vaporisation', [-2.0, 0.6, 0.22]));
  labels.push(L('Glass beads / plates', 'Large surface for vapour–liquid contact', [-2.06, 0.62, 0]));
  labels.push(L('Thermometer', 'Reads boiling point of fraction distilling', [-2.0, 2.5, 0]));
  labels.push(L('Water condenser', 'Cold water in at lower end, out at upper', [0.35, 0.92, 0]));
  labels.push(L('Receiver', 'Lower-boiling fraction collects first', [2.4, -1.5, 0.45]));
  labels.push(L('Vapour of lower-boiling component', 'Rises to top; higher-boiling one returns to flask', [-1.2, 1.7, 0]));
  return { g, labels, note: 'Fractional distillation: separates liquids with boiling-point difference < 25 K (petroleum refining, acetone–methanol). Each cycle in the column enriches vapour in the more volatile component.' };
}
function steamDist() {
  const g = H.grp(), labels = [];
  g.add(flaskRB([-3.0, -1.2, 0], 0.7, C.blue, 2.0)); g.add(H.box(0.8, 0.12, 0.6, C.red, [-3.0, -1.95, 0], null, { e: 0.6 }));
  g.add(H.rod([-3.0, -1.2, 0], [-3.0, 0.8, 0], 0.04, C.white)); g.add(H.text('safety tube', { size: 0.12, pos: [-3.0, 1.0, 0], color: C.grey }));
  g.add(H.tube([[-2.7, -0.4, 0], [-2.0, -0.3, 0], [-1.3, -0.6, 0], [-1.0, -1.2, 0]], 0.06, C.white, { op: 0.5 }));
  g.add(flaskRB([-0.8, -1.4, 0], 0.75, C.amber, 1.9)); g.add(H.box(0.8, 0.12, 0.6, C.red, [-0.8, -2.2, 0], null, { e: 0.6 }));
  g.add(H.tube([[-0.6, -0.5, 0], [-0.3, 0.3, 0], [0.5, 0.5, 0]], 0.07, C.white, { op: 0.5 }));
  condenser(g, [0.3, 0.55, 0], [2.4, -0.4, 0]);
  g.add(H.tube([[2.4, -0.4, 0], [2.8, -0.6, 0], [2.9, -1.2, 0]], 0.06, C.white, { op: 0.5 }));
  g.add(H.lathe([[0.45, -2.2], [0.5, -1.3], [0.2, -1.0]], C.white, [3.0, 0, 0], null, { seg: 20, op: 0.2, side: THREE.DoubleSide })); g.add(H.cyl(0.4, 0.4, 0.5, C.cyan, [3.0, -1.9, 0], null, { op: 0.5 })); g.add(H.cyl(0.4, 0.4, 0.15, C.amber, [3.0, -1.55, 0], null, { op: 0.8 }));
  labels.push(L('Steam generator (water flask)', 'Boiled to generate steam', [-3.0, -1.2, 0.7]));
  labels.push(L('Steam inlet tube', 'Steam bubbled into the mixture', [-2.0, -0.3, 0]));
  labels.push(L('Flask with impure organic liquid + water', 'Steam-volatile, water-immiscible compound (aniline, essential oils)', [-0.8, -1.4, 0.75]));
  labels.push(L('Mixture of steam + organic vapour', 'Distils when p₁ + p₂ = atmospheric (below 373 K)', [-0.3, 0.3, 0]));
  labels.push(L('Condenser', 'Condenses both vapours', [1.35, 0.1, 0]));
  labels.push(L('Receiver: two immiscible layers', 'Organic layer separated with a separating funnel', [3.0, -1.7, 0.4]));
  labels.push(L('Heating', 'Keeps the mixture warm', [-0.8, -2.2, 0.3]));
  return { g, labels, note: 'Steam distillation: for substances volatile in steam and immiscible with water; boils below 373 K as p_org + p_water = p_atm; e.g. aniline from aniline–water mixture.' };
}
function diffExtract() {
  const g = H.grp(), labels = [];
  g.add(H.lathe([[0, 2.6], [0.25, 2.5], [0.3, 2.2], [0.9, 1.4], [1.1, 0.3], [0.9, -0.7], [0.4, -1.4], [0.12, -1.8], [0.12, -2.6], [0, -2.6]], C.white, null, null, { seg: 28, op: 0.2, side: THREE.DoubleSide }));
  g.add(H.lathe([[0, 1.0], [0.95, 1.0], [1.05, 0.3], [0.88, -0.7], [0.4, -1.35], [0, -1.35]], C.amber, null, null, { seg: 28, op: 0.5, side: THREE.DoubleSide }));
  g.add(H.lathe([[0, 1.85], [0.55, 1.85], [0.92, 1.35], [0.98, 1.0], [0, 1.0]], C.blue, null, null, { seg: 28, op: 0.5, side: THREE.DoubleSide }));
  g.add(H.cyl(0.3, 0.3, 0.2, C.grey, [0, 2.65, 0], null, { seg: 16 }));
  g.add(H.box(0.5, 0.12, 0.3, C.grey, [0.1, -1.75, 0], [0, 0, 0.3])); g.add(H.cyl(0.12, 0.12, 0.3, C.grey, [0, -1.75, 0], null, { seg: 10 }));
  g.add(H.torus(0.4, 0.05, C.dgrey, [0, 0.2, 0], [PI / 2, 0, 0])); g.add(H.rod([0.4, 0.2, 0], [2.2, 0.2, 0], 0.05, C.dgrey)); g.add(H.rod([2.2, 0.2, 0], [2.2, 3.0, 0], 0.05, C.dgrey));
  g.add(H.lathe([[0.55, -0.6], [0.6, 0.3], [0.5, 0.5]], C.white, [0, -3.2, 0], null, { seg: 20, op: 0.2, side: THREE.DoubleSide }));
  labels.push(L('Separating funnel', 'Two immiscible layers separate by density', [1.1, 0.3, 0]));
  labels.push(L('Aqueous layer (denser, lower)', 'Water containing impurities', [0, -0.3, 0.9]));
  labels.push(L('Organic solvent layer (upper)', 'Compound dissolved in benzene/ether/chloroform', [0, 1.4, 0.9]));
  labels.push(L('Stopper', 'Closed while shaking', [0, 2.65, 0.3]));
  labels.push(L('Stopcock (tap)', 'Opened to run off the lower layer', [0.3, -1.75, 0]));
  labels.push(L('Interface', 'Boundary between the two layers', [0.98, 1.0, 0]));
  labels.push(L('Collection flask', 'Lower layer drained here; solvent later removed by distillation', [0, -3.1, 0.55]));
  return { g, labels, note: 'Differential extraction: organic compound in aqueous solution shaken with immiscible solvent in which it is more soluble; layers separated; repeated extraction with small volumes is more efficient.' };
}
reg(Object.assign({}, CH, {
  id: 'c11-8-1', cls: 11, unit: UO, ch: 'Ch 8 — Organic Chemistry: Basic Principles & Techniques', fig: 'Purification setups', title: 'Fractional distillation, steam distillation & differential extraction',
  desc: 'Purification methods depend on the nature of the compound and impurity: distillation (volatile liquids with non-volatile impurities or very different b.p.), fractional (close b.p.), reduced pressure (decomposes at b.p.), steam (steam-volatile, immiscible), differential extraction (solvent partition).',
  points: ['Fractional distillation: crude oil; column with beads/plates; difference in b.p. small.', 'Distillation under reduced pressure: glycerol from spent lye; sugar concentration.', 'Steam distillation: aniline; boils below 373 K.', 'Sublimation: camphor, naphthalene; Crystallisation: most common for solids.'],
  variants: [{ name: 'Fractional distillation', build: fracDist }, { name: 'Steam distillation', build: steamDist }, { name: 'Differential extraction', build: diffExtract }]
}));

function chromPaper(tlc) {
  const g = H.grp(), labels = [];
  g.add(H.cyl(1.4, 1.4, 3.6, C.white, [0, 0, 0], null, { op: 0.12, open: true, side: THREE.DoubleSide, seg: 32, dw: false })); g.add(H.disc(1.4, C.white, [0, -1.8, 0], [PI / 2, 0, 0], { op: 0.3 })); g.add(H.disc(1.45, C.grey, [0, 1.85, 0], [PI / 2, 0, 0], { op: 0.7 }));
  g.add(H.cyl(1.35, 1.35, 0.35, C.cyan, [0, -1.6, 0], null, { op: 0.45, seg: 32 }));
  if (tlc) { g.add(H.box(1.2, 3.0, 0.08, C.grey, [0, 0.1, 0], null, { op: 0.9 })); g.add(H.box(1.2, 3.0, 0.02, C.white, [0, 0.1, 0.05], null, { op: 0.8 })); } else { g.add(H.box(1.1, 3.1, 0.03, C.bone, [0, 0.15, 0], null, { op: 0.95 })); g.add(H.rod([0, 1.85, 0], [0, 1.7, 0], 0.04, C.grey)); }
  g.add(H.line([[-0.55, -1.0, 0.07], [0.55, -1.0, 0.07]], C.ink)); g.add(H.line([[-0.55, 1.05, 0.07], [0.55, 1.05, 0.07]], C.blue, { dashed: true }));
  g.add(H.sphere(0.06, C.dgrey, [0, -1.0, 0.07], { op: 0.5 }));
  g.add(H.sphere(0.1, C.red, [0, -0.2, 0.08])); g.add(H.sphere(0.1, C.green, [0, 0.5, 0.08])); g.add(H.sphere(0.09, C.purple, [0, -0.6, 0.08]));
  g.add(H.line([[0.7, -1.0, 0.07], [0.7, 0.5, 0.07]], C.yellow)); g.add(H.line([[0.9, -1.0, 0.07], [0.9, 1.05, 0.07]], C.blue));
  g.add(H.text('x', { size: 0.13, pos: [0.75, -0.25, 0.1], color: C.yellow })); g.add(H.text('y', { size: 0.13, pos: [1.05, 0.0, 0.1], color: C.blue }));
  g.add(H.text('R_f = x / y', { size: 0.16, pos: [0, 2.2, 0], color: C.white }));
  labels.push(L(tlc ? 'TLC plate (glass + thin adsorbent layer)' : 'Chromatography paper (strip)', tlc ? 'Silica gel / alumina spread ~0.2 mm thick; stationary phase = adsorbent' : 'Stationary phase = water trapped in the paper (partition)', [0, 0.1, 0.05]));
  labels.push(L('Base line — sample spot applied', 'Mixture spotted ~2 cm from the bottom', [0, -1.0, 0.07]));
  labels.push(L('Mobile phase (solvent)', 'Rises by capillary action', [0, -1.6, 1.35]));
  labels.push(L('Separated spots', 'Different components move different distances (adsorption / solubility differences)', [0, 0.5, 0.08]));
  labels.push(L('Solvent front', 'Farthest point reached by solvent', [0, 1.05, 0.07]));
  labels.push(L('R_f value', 'Distance moved by substance ÷ distance moved by solvent (constant for a compound in a given system)', [0, 2.2, 0]));
  labels.push(L('Closed chamber (jar)', 'Saturated with solvent vapour', [1.4, 0.8, 0]));
  labels.push(L('Visualising spots', 'UV light, iodine vapour, ninhydrin (amino acids)', [-1.4, -0.4, 0]));
  return { g, labels, note: tlc ? 'Thin layer chromatography (adsorption): components separate on adsorbent-coated glass plate; identified by R_f values.' : 'Paper chromatography (partition): water in paper pores is stationary phase; developed chromatogram shows spots; ascending/descending.' };
}
reg(Object.assign({}, CH, {
  id: 'c11-8-2', cls: 11, unit: UO, ch: 'Ch 8 — Organic Chemistry: Basic Principles & Techniques', fig: 'Chromatography', title: 'Paper & thin-layer chromatography',
  desc: 'Chromatography separates mixtures based on differential distribution between a stationary phase and a mobile phase. Adsorption chromatography (column, TLC) uses an adsorbent; partition chromatography (paper) uses liquid stationary phase in paper.',
  points: ['Column chromatography: adsorbent (silica/alumina) in a column; eluent; components eluted in order of adsorption.', 'TLC: R_f = distance by substance / distance by solvent front.', 'Paper: cellulose paper; water = stationary phase; spots visualised by spraying reagents.', 'Tswett (1906) — coloured plant pigments ("chroma").'],
  variants: [{ name: 'Paper chromatography', build: () => chromPaper(false) }, { name: 'TLC', build: () => chromPaper(true) }]
}));

/* ---------- Class 12 Organic mechanisms ---------- */
function sn2() {
  const g = H.grp(), labels = [];
  // CH3Br with Nu (OH-) attacking from back
  const c = H.atom('C', [0, 0, 0], { r: 0.38 }); g.add(c);
  const br = H.atom('Br', [1.6, 0, 0], { r: 0.42 }); g.add(br);
  const brBond = H.bond([0, 0, 0], [1.6, 0, 0]); g.add(brBond);
  const nu = H.atom('O', [-2.4, 0, 0], { r: 0.34, label: 'OH⁻' }); g.add(nu);
  const nuBond = H.bond([-2.4, 0, 0], [0, 0, 0], { dashed: true }); g.add(nuBond);
  const hs = [], hb = [];
  const hdir0 = [[-0.4, 0.85, 0.3], [-0.4, -0.55, 0.75], [-0.4, -0.3, -0.85]];
  hdir0.forEach((d, i) => { const p = d.map(v => v * 1.15); const h = H.atom('H', p, { r: 0.2 }); g.add(h); hs.push(h); const b = H.bond([0, 0, 0], p); g.add(b); hb.push(b); });
  g.add(H.arrow([-1.9, 0.6, 0], [-0.7, 0.2, 0], C.yellow, { r: 0.015, head: 0.12 }));
  g.add(H.text('backside attack (180°)', { size: 0.14, pos: [-1.4, 1.0, 0], color: C.yellow }));
  const tsText = H.text('transition state [HO···C···Br]⁻', { size: 0.15, pos: [0, 1.7, 0], color: C.orange }); tsText.visible = false; g.add(tsText);
  const slide = t => { const nx = lerp(-2.4, -1.6, t); nu.position.set(nx, 0, 0); const bx = lerp(1.6, 2.6, t); br.position.set(bx, 0, 0); brBond.children.forEach(m => { m.scale.y = bx; m.position.x = bx / 2; }); brBond.children.forEach(m => m.material = H.mat('#cbd5e1', { op: 1 - t * 0.8 })); nuBond.children.forEach(m => { const len = -nx; m.scale.y = len; m.position.x = nx / 2; m.material = H.mat('#cbd5e1', { op: 0.25 + t * 0.75 }); }); hs.forEach((h, i) => { const d0 = hdir0[i]; const dx = lerp(d0[0], -d0[0], t); const p = [dx * 1.15, d0[1] * 1.15, d0[2] * 1.15]; h.position.set(...p); const b = hb[i].children[0]; const a = V3(0, 0, 0), bpt = V3(...p); const dd = bpt.clone().sub(a); b.scale.y = dd.length(); b.position.copy(a).add(bpt).multiplyScalar(0.5); b.quaternion.setFromUnitVectors(V3(0, 1, 0), dd.normalize()); }); tsText.visible = t > 0.3 && t < 0.7; };
  labels.push(L('Nucleophile (OH⁻)', 'Attacks carbon from the side OPPOSITE the leaving group', [-2.4, 0, 0]));
  labels.push(L('Substrate carbon (CH₃Br)', 'sp³ → trigonal bipyramidal TS → sp³; one-step, bimolecular', [0, 0, 0]));
  labels.push(L('Leaving group (Br⁻)', 'C–Br breaks as O–C forms (concerted)', [1.6, 0, 0]));
  labels.push(L('Inversion of configuration (Walden)', 'H atoms flip like an umbrella in wind', hdir0[0].map(v => v * 1.15)));
  labels.push(L('Rate = k[RX][Nu]', 'Second order; order CH₃ > 1° > 2° > 3° (steric hindrance)', [0, -1.5, 0]));
  return { g, labels, slide };
}
function sn1() {
  const g = H.grp(), labels = [];
  const c = H.atom('C', [0, 0, 0], { r: 0.38 }); g.add(c);
  const br = H.atom('Br', [0, 1.7, 0], { r: 0.42 }); g.add(br);
  const brBond = H.bond([0, 0, 0], [0, 1.7, 0]); g.add(brBond);
  const dirs = [[1, -0.33, 0], [-0.5, -0.33, 0.87], [-0.5, -0.33, -0.87]];
  const subs = [], sb = [];
  dirs.forEach((d, i) => { const p = d.map(v => v * 1.5); const a = H.atom('C', p, { r: 0.3, label: 'CH₃' }); g.add(a); subs.push(a); const b = H.bond([0, 0, 0], p); g.add(b); sb.push(b); });
  const nu1 = H.atom('O', [0, 2.6, 0], { r: 0.3, label: 'OH⁻' }); nu1.visible = false; g.add(nu1);
  const nu2 = H.atom('O', [0, -2.6, 0], { r: 0.3, label: 'OH⁻' }); nu2.visible = false; g.add(nu2);
  const a1 = H.arrow([0, 2.3, 0.3], [0, 0.7, 0.3], C.yellow, { r: 0.012, head: 0.12 }); a1.visible = false; g.add(a1);
  const a2 = H.arrow([0, -2.3, 0.3], [0, -0.7, 0.3], C.yellow, { r: 0.012, head: 0.12 }); a2.visible = false; g.add(a2);
  const plus = H.text('+', { size: 0.3, bold: true, pos: [0.45, 0.35, 0.3], color: C.yellow }); plus.visible = false; g.add(plus);
  const cap = H.text('planar carbocation (sp²)', { size: 0.15, pos: [0, -1.3, 0], color: C.orange }); cap.visible = false; g.add(cap);
  g.add(H.plane(3.2, 3.2, C.grey, [0, -0.45, 0], [PI / 2, 0, 0], { op: 0.08 }));
  const slide = t => { const by = lerp(1.7, 3.6, Math.min(1, t * 1.6)); br.position.set(0, by, 0); brBond.children.forEach(m => { m.scale.y = by; m.position.y = by / 2; m.material = H.mat('#cbd5e1', { op: Math.max(0, 1 - t * 2) }); }); br.children[0].material = H.mat(H.CPK.Br[0], { op: Math.max(0.15, 1 - t) }); const flat = Math.min(1, t * 1.5); subs.forEach((s, i) => { const d = dirs[i]; const p = [d[0] * 1.5, lerp(d[1], 0, flat) * 1.5, d[2] * 1.5]; s.position.set(...p); const b = sb[i].children[0]; const bpt = V3(...p); b.scale.y = bpt.length(); b.position.copy(bpt).multiplyScalar(0.5); b.quaternion.setFromUnitVectors(V3(0, 1, 0), bpt.clone().normalize()); }); const showNu = t > 0.55; nu1.visible = showNu; nu2.visible = showNu; a1.visible = showNu; a2.visible = showNu; plus.visible = t > 0.4; cap.visible = t > 0.4; };
  labels.push(L('Tertiary halide (CH₃)₃C–Br', 'Step 1 (slow): C–Br ionises → carbocation + Br⁻', [0, 0, 0]));
  labels.push(L('Leaving group Br⁻', 'Departs first; polar protic solvent stabilises ions', [0, 1.7, 0]));
  labels.push(L('Planar carbocation (sp²)', 'Trigonal planar; stabilised by +I / hyperconjugation: 3° > 2° > 1°', [1.5, -0.5, 0]));
  labels.push(L('Nucleophile attack from either face', 'Step 2 (fast): equal probability from top or bottom', [0, 2.6, 0]));
  labels.push(L('Racemisation', 'Chiral substrate → 50:50 mixture of enantiomers (retention + inversion)', [0, -2.6, 0]));
  labels.push(L('Rate = k[RX]', 'First order; unimolecular; two steps', [-1.5, -0.5, 0]));
  return { g, labels, slide };
}
reg(Object.assign({}, CH, {
  id: 'c12-org-1', cls: 12, unit: UO, ch: 'Ch 10 — Haloalkanes and Haloarenes', fig: 'Sₙ1 & Sₙ2 mechanisms', title: 'Nucleophilic substitution: Sₙ2 and Sₙ1',
  desc: 'Sₙ2: one-step bimolecular attack from the back side through a trigonal bipyramidal transition state, giving inversion of configuration. Sₙ1: two-step unimolecular pathway via a planar carbocation, giving racemisation. Use the slider to run the reaction.',
  points: ['Sₙ2 favoured by CH₃X > 1° > 2° > 3°; strong nucleophile; polar aprotic solvent (DMSO, acetone).', 'Sₙ1 favoured by 3° > 2° > 1°; weak nucleophile; polar protic solvent (water, alcohol); carbocation stability.', 'Sₙ2 → inversion (Walden inversion); Sₙ1 → racemisation.', 'Allylic & benzylic halides react fast by Sₙ1 (resonance-stabilised carbocation).'],
  variants: [{ name: 'Sₙ2 (inversion)', slide: 'React', build: sn2 }, { name: 'Sₙ1 (racemisation)', slide: 'React', build: sn1 }]
}));

/* ---------- Ch 13 Biomolecules ---------- */
function haworth(kind) {
  const g = H.grp(), labels = [];
  // pyranose ring (6-membered) or furanose (5)
  const n = kind === 'fru' ? 5 : 6;
  const R = 1.3;
  const ring = []; for (let i = 0; i < n; i++) { const a = PI / 2 + i * TAU / n; ring.push([R * Math.cos(a), 0, -R * Math.sin(a)]); }
  // atoms: index 0 = O ring (top-right for pyranose): assign O at last
  const oIdx = n - 1;
  ring.forEach((p, i) => { g.add(H.atom(i === oIdx ? 'O' : 'C', p, { r: i === oIdx ? 0.3 : 0.28, label: i === oIdx ? 'O' : 'C' + ((i + 1)) })); g.add(H.bond(p, ring[(i + 1) % n], { r: 0.05 })); });
  g.add(H.plane(3.4, 3.4, C.grey, [0, 0, 0], [PI / 2, 0, 0], { op: 0.1 }));
  const sub = (i, up, label, col) => { const p = ring[i]; const q = [p[0], up ? 0.95 : -0.95, p[2]]; g.add(H.bond(p, q, { r: 0.04 })); const a = H.atom('O', q, { r: 0.2, label, color: col }); g.add(a); return q; };
  if (kind === 'aglc' || kind === 'bglc') {
    const alpha = kind === 'aglc';
    const c1 = sub(0, !alpha, 'OH', C.red); sub(0, alpha, 'H', C.white);
    sub(1, false, 'OH', C.red); sub(1, true, 'H', C.white);
    sub(2, true, 'OH', C.red); sub(2, false, 'H', C.white);
    sub(3, false, 'OH', C.red); sub(3, true, 'H', C.white);
    const c6 = sub(4, true, 'CH₂OH', C.grey); sub(4, false, 'H', C.white);
    g.add(H.text(alpha ? 'α-D-(+)-Glucopyranose' : 'β-D-(+)-Glucopyranose', { size: 0.2, bold: true, pos: [0, 1.8, 0] }));
    labels.push(L(alpha ? 'C1 –OH DOWN (α anomer)' : 'C1 –OH UP (β anomer)', alpha ? 'trans to CH₂OH; α-D-glucose m.p. 419 K' : 'cis (same side) as CH₂OH; β-D-glucose m.p. 423 K', c1));
    labels.push(L('Anomeric carbon (C1)', 'New chiral centre formed on ring closure; α & β = anomers', ring[0]));
    labels.push(L('Ring oxygen', 'From C5–OH attacking C1 aldehyde (hemiacetal)', ring[oIdx]));
    labels.push(L('C6 –CH₂OH (up)', 'Defines D-configuration in Haworth projection', c6));
    labels.push(L('C2 –OH down, C3 –OH up, C4 –OH down', 'Same in both anomers; only C1 differs', [ring[2][0], 0.95, ring[2][2]]));
    labels.push(L('Pyranose ring (6-membered)', 'Like pyran; 5 C + 1 O', [0, -0.3, 0]));
  } else {
    const c2 = sub(0, true, 'OH', C.red); const c2b = sub(0, false, 'CH₂OH', C.grey);
    sub(1, false, 'OH', C.red); sub(1, true, 'H', C.white);
    sub(2, true, 'OH', C.red); sub(2, false, 'H', C.white);
    const c5 = sub(3, true, 'CH₂OH', C.grey); sub(3, false, 'H', C.white);
    g.add(H.text('β-D-(−)-Fructofuranose', { size: 0.2, bold: true, pos: [0, 1.8, 0] }));
    labels.push(L('Anomeric carbon (C2) — OH up (β)', 'Ketone carbon forms hemiketal; β: C2–OH on the same side as C6–CH₂OH', c2));
    labels.push(L('C1 –CH₂OH (down on C2)', 'Extra carbon outside the ring; in sucrose C2 links to glucose C1', c2b));
    labels.push(L('Ring oxygen', 'From C5–OH attacking C2 keto group', ring[oIdx]));
    labels.push(L('C6 –CH₂OH', 'Attached to C5', c5));
    labels.push(L('C3 –OH down, C4 –OH up', 'Configuration at ring carbons', [ring[1][0], -0.95, ring[1][2]]));
    labels.push(L('Furanose ring (5-membered)', 'Like furan; 4 C + 1 O; fructose in sucrose is β-furanose', [0, -0.3, 0]));
  }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-13-1', cls: 12, unit: UO, ch: 'Ch 13 — Biomolecules', fig: 'Haworth projections', title: 'Haworth projections: α/β-D-glucose & fructose',
  desc: 'Glucose exists as six-membered pyranose rings (α and β anomers differing at C1); fructose as a five-membered furanose ring (anomeric C2). Ring forms explain why glucose does not give some open-chain aldehyde reactions.',
  points: ['α-D-glucose: C1–OH below the ring (opposite to CH₂OH); β: above (same side).', 'Anomers interconvert via open chain — mutarotation.', 'Sucrose = α-D-glucose (C1) + β-D-fructose (C2) glycosidic link — non-reducing (both anomeric carbons used). Invert sugar on hydrolysis.', 'Maltose: α-1,4 glucose–glucose (reducing); Lactose: β-D-galactose + β-D-glucose (β-1,4).'],
  variants: [{ name: 'α-D-Glucose', build: () => haworth('aglc') }, { name: 'β-D-Glucose', build: () => haworth('bglc') }, { name: 'Fructose (furanose)', build: () => haworth('fru') }]
}));

function proteinLevel(kind) {
  const g = H.grp(), labels = [];
  if (kind === 'primary') { const cols = [C.red, C.blue, C.green, C.yellow, C.purple, C.orange, C.teal, C.pink]; const names = ['Gly', 'Ala', 'Ser', 'Val', 'Leu', 'Lys', 'Phe', 'Asp']; for (let i = 0; i < 8; i++) { const x = -3.15 + i * 0.9; g.add(H.sphere(0.33, cols[i], [x, 0, 0])); g.add(H.text(names[i], { size: 0.16, pos: [x, 0, 0.36], top: true })); if (i < 7) g.add(H.rod([x + 0.33, 0, 0], [x + 0.57, 0, 0], 0.08, C.grey)); } g.add(H.text('N-terminus (–NH₂)', { size: 0.14, pos: [-3.3, 0.6, 0], color: C.grey })); g.add(H.text('C-terminus (–COOH)', { size: 0.14, pos: [3.2, 0.6, 0], color: C.grey })); labels.push(L('Primary structure', 'Linear sequence of amino acids joined by peptide bonds', [-1.35, 0, 0])); labels.push(L('Peptide bond (–CO–NH–)', 'Amide link formed by loss of water', [-2.7, 0, 0])); labels.push(L('N-terminal amino acid', 'Free –NH₂ (written on left)', [-3.15, 0, 0])); labels.push(L('C-terminal amino acid', 'Free –COOH (right)', [3.15, 0, 0])); labels.push(L('Each protein has a unique sequence', 'A change in even one residue alters the protein (e.g. sickle-cell Hb)', [0.45, 0, 0])); }
  if (kind === 'helix') { g.add(H.helix(0.6, 4.2, 5, 0.09, C.orange, { ppt: 24 })); for (let i = 0; i < 20; i++) { const t = i / 20; const a = t * 5 * TAU; g.add(H.sphere(0.12, C.yellow, [0.6 * Math.cos(a), -2.1 + t * 4.2, 0.6 * Math.sin(a)], { seg: 8 })); g.add(H.rod([0.6 * Math.cos(a), -2.1 + t * 4.2, 0.6 * Math.sin(a)], [0.95 * Math.cos(a), -2.1 + t * 4.2, 0.95 * Math.sin(a)], 0.03, C.grey)); g.add(H.sphere(0.08, C.purple, [0.95 * Math.cos(a), -2.1 + t * 4.2, 0.95 * Math.sin(a)], { seg: 6 })); } for (let i = 0; i < 12; i++) { const t = i / 14; const a = t * 5 * TAU; const y = -2.1 + t * 4.2; g.add(H.line([[0.55 * Math.cos(a), y, 0.55 * Math.sin(a)], [0.55 * Math.cos(a), y + 0.84, 0.55 * Math.sin(a)]], C.cyan, { dashed: true })); } labels.push(L('α-Helix (secondary structure)', 'Right-handed coil; 3.6 residues per turn (Pauling)', [0.6, 1.5, 0])); labels.push(L('Polypeptide backbone', 'Coils like a spring', [-0.6, -0.5, 0])); labels.push(L('Hydrogen bonds', '–NH of one residue to –C=O of residue 4 places ahead; parallel to axis', [0.55, 0.3, 0])); labels.push(L('R groups (side chains)', 'Project outward', [0.95, -1.4, 0])); labels.push(L('Keratin (hair, wool)', 'Fibrous protein with α-helix', [-0.9, 2.0, 0])); }
  if (kind === 'sheet') { for (let s = 0; s < 3; s++) { const z = (s - 1) * 1.1; const pts = []; for (let i = 0; i <= 10; i++) pts.push([-2.5 + i * 0.5, 0.25 * (i % 2 ? 1 : -1), z]); g.add(H.tube(pts, 0.07, s % 2 ? C.blue : C.teal, { seg: 40, tension: 0 })); pts.forEach((p, i) => { g.add(H.sphere(0.1, C.yellow, p, { seg: 8 })); g.add(H.rod(p, [p[0], p[1] + (i % 2 ? 0.5 : -0.5), p[2]], 0.03, C.grey)); g.add(H.sphere(0.07, C.purple, [p[0], p[1] + (i % 2 ? 0.5 : -0.5), p[2]], { seg: 6 })); }); g.add(H.arrow([2.4, 0, z], [3.1, 0, z], s % 2 ? C.blue : C.teal, { r: 0.04, head: 0.3, hr: 0.2 })); if (s < 2) for (let i = 0; i <= 10; i += 2) g.add(H.line([[-2.5 + i * 0.5, -0.25, z], [-2.5 + i * 0.5, -0.25, z + 1.1]], C.cyan, { dashed: true })); } labels.push(L('β-Pleated sheet (secondary)', 'Polypeptide chains laid side by side, zig-zag (pleated)', [0, 0.25, 0])); labels.push(L('Adjacent strands', 'Held by inter-chain hydrogen bonds', [0, -0.25, 1.1])); labels.push(L('Hydrogen bonds between chains', 'C=O···H–N perpendicular to strands', [0.5, -0.25, 0.55])); labels.push(L('R groups alternate above/below', 'Side chains project on either side of sheet', [-1.5, 0.75, -1.1])); labels.push(L('Antiparallel / parallel', 'Arrows show strand direction (silk fibroin: antiparallel)', [3.1, 0, 0])); }
  if (kind === 'tertiary') { const rng = H.rng(44); const pts = []; for (let i = 0; i < 26; i++) pts.push([(rng() - 0.5) * 3.6, (rng() - 0.5) * 3.2, (rng() - 0.5) * 3.0]); const tube = H.tube(pts, 0.1, C.green, { seg: 200, tension: 0.6 }); g.add(tube); g.add(H.helix(0.35, 1.3, 3, 0.06, C.orange, { pos: [pts[5][0], pts[5][1], pts[5][2]] })); g.add(H.rod([pts[8][0], pts[8][1], pts[8][2]], [pts[15][0], pts[15][1], pts[15][2]], 0.03, C.yellow)); g.add(H.text('S–S', { size: 0.14, pos: [(pts[8][0] + pts[15][0]) / 2, (pts[8][1] + pts[15][1]) / 2 + 0.2, (pts[8][2] + pts[15][2]) / 2], color: C.yellow })); g.add(H.line([pts[3], pts[20]], C.cyan, { dashed: true })); g.add(H.sphere(0.35, C.red, [pts[12][0], pts[12][1], pts[12][2]], { op: 0.6 })); labels.push(L('Tertiary structure', 'Overall 3-D folding of a single polypeptide chain', [0, 0, 0])); labels.push(L('α-helix segment', 'Secondary elements within the fold', pts[5])); labels.push(L('Disulphide bond (S–S)', 'Between cysteine residues — covalent', [(pts[8][0] + pts[15][0]) / 2, (pts[8][1] + pts[15][1]) / 2, (pts[8][2] + pts[15][2]) / 2])); labels.push(L('Hydrogen bonds / van der Waals / ionic', 'Non-covalent forces holding the fold', pts[3])); labels.push(L('Globular shape', 'Hydrophobic residues inside, hydrophilic outside (e.g. myoglobin)', pts[12])); }
  if (kind === 'quaternary') { const cols = [C.red, C.blue, C.orange, C.teal]; const centers = [[-1.0, 0.8, 0], [1.0, 0.8, 0.2], [-1.0, -0.8, 0.2], [1.0, -0.8, 0]]; centers.forEach((c, k) => { const rng = H.rng(50 + k); const pts = []; for (let i = 0; i < 14; i++) pts.push([c[0] + (rng() - 0.5) * 1.6, c[1] + (rng() - 0.5) * 1.5, c[2] + (rng() - 0.5) * 1.4]); g.add(H.tube(pts, 0.09, cols[k], { seg: 120, tension: 0.6 })); g.add(H.torus(0.22, 0.05, C.yellow, c, [0.5, 0.4, 0], { e: 0.8 })); g.add(H.sphere(0.09, C.amber, c, { e: 0.9 })); }); labels.push(L('Quaternary structure', 'Assembly of two or more polypeptide sub-units', [0, 0, 0.5])); labels.push(L('α sub-unit (×2)', 'Haemoglobin: 2 α chains', centers[0])); labels.push(L('β sub-unit (×2)', '2 β chains — α₂β₂ tetramer', centers[1])); labels.push(L('Haem group (Fe²⁺)', 'Prosthetic group binding O₂', centers[3])); labels.push(L('Non-covalent forces', 'Hold sub-units together', [0, 0, -0.6])); }
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-13-2', cls: 12, unit: UO, ch: 'Ch 13 — Biomolecules', fig: 'Protein structure', title: 'Protein structure: primary → quaternary',
  desc: 'Primary: sequence of amino acids. Secondary: local folding into α-helix (intra-chain H-bonds) or β-pleated sheet (inter-chain H-bonds). Tertiary: overall 3-D fold (fibrous vs globular). Quaternary: arrangement of sub-units.',
  points: ['20 α-amino acids; 10 essential; zwitterion; isoelectric point.', 'α-Helix: right-handed, H-bond between C=O of residue i and N–H of i+4; keratin, myosin.', 'β-Sheet: extended chains side by side; silk fibroin.', 'Denaturation (heat, pH) destroys 2° & 3° structure, not 1° (coagulation of egg white, curdling of milk).'],
  variants: [{ name: 'Primary', build: () => proteinLevel('primary') }, { name: 'Secondary: α-helix', build: () => proteinLevel('helix') }, { name: 'Secondary: β-sheet', build: () => proteinLevel('sheet') }, { name: 'Tertiary', build: () => proteinLevel('tertiary') }, { name: 'Quaternary (Hb)', build: () => proteinLevel('quaternary') }]
}));

function baseRing(kind) {
  const g = H.grp(), labels = [];
  const hexR = 1.0;
  const hex = []; for (let i = 0; i < 6; i++) { const a = PI / 2 + i * TAU / 6; hex.push([hexR * Math.cos(a), hexR * Math.sin(a), 0]); }
  // purine: hexagon + pentagon fused on right edge (hex[4]-hex[5]) -> we fuse on edge between index 5 and 0? define fused edge = hex[5],hex[0]
  const add = (sym, p, lab) => { g.add(H.atom(sym, p, { r: sym === 'H' ? 0.16 : 0.27, label: lab })); return p; };
  const bd = (a, b, o = 1) => g.add(H.bond(a, b, { order: o, r: 0.045 }));
  if (kind === 'A' || kind === 'G') {
    // purine numbering: N1 C2 N3 C4 C5 C6 (six ring), N7 C8 N9 (five ring fused at C4-C5)
    const N1 = hex[0], C2 = hex[1], N3 = hex[2], C4 = hex[3], C5 = hex[4], C6 = hex[5];
    add('N', N1, 'N1'); add('C', C2, 'C2'); add('N', N3, 'N3'); add('C', C4, 'C4'); add('C', C5, 'C5'); add('C', C6, 'C6');
    bd(N1, C2, 2); bd(C2, N3); bd(N3, C4, 2); bd(C4, C5); bd(C5, C6, 2); bd(C6, N1);
    // pentagon on C4-C5 edge (pointing to the right/down)
    const mid = [(C4[0] + C5[0]) / 2, (C4[1] + C5[1]) / 2, 0]; const out = [mid[0] * 1.0 - 0, mid[1], 0]; const dir = V3(mid[0], mid[1], 0).normalize();
    const N7 = [C5[0] + dir.x * 0.95 + 0.3 * (C5[1] - C4[1]), C5[1] + dir.y * 0.95 - 0.3 * (C5[0] - C4[0]), 0];
    const N9 = [C4[0] + dir.x * 0.95 - 0.3 * (C5[1] - C4[1]), C4[1] + dir.y * 0.95 + 0.3 * (C5[0] - C4[0]), 0];
    const C8 = [mid[0] + dir.x * 1.7, mid[1] + dir.y * 1.7, 0];
    add('N', N7, 'N7'); add('C', C8, 'C8'); add('N', N9, 'N9'); bd(C5, N7); bd(N7, C8, 2); bd(C8, N9); bd(N9, C4);
    const h9 = [N9[0] + dir.x * 0.5 - 0.4 * (C5[1] - C4[1]), N9[1] + dir.y * 0.5 + 0.4 * (C5[0] - C4[0]), 0]; add('H', h9); bd(N9, h9);
    if (kind === 'A') { const am = [C6[0] + (C6[0] - hex[2][0]) * 0.5, C6[1] + 0.9, 0]; add('N', am, 'NH₂'); bd(C6, am); g.add(H.text('Adenine (A)', { size: 0.24, bold: true, pos: [0, -2.0, 0] })); labels.push(L('Adenine — purine', 'Two fused rings (6 + 5); 6-aminopurine', [0, 0, 0])); labels.push(L('–NH₂ at C6', 'Amino group; pairs with T (DNA) / U (RNA) by 2 H-bonds', am)); labels.push(L('N9 — attaches to sugar', 'N-glycosidic bond to C1′ of ribose/deoxyribose', N9)); labels.push(L('Six-membered pyrimidine ring', 'N1, C2, N3, C4, C5, C6', N3)); labels.push(L('Five-membered imidazole ring', 'N7, C8, N9', C8)); }
    else { const ox = [C6[0] + 0.0, C6[1] + 0.95, 0]; add('O', ox, 'O'); bd(C6, ox, 2); const am = [C2[0] - 0.9, C2[1] - 0.2, 0]; add('N', am, 'NH₂'); bd(C2, am); const h1 = [N1[0], N1[1] + 0.55, 0.2]; add('H', h1); bd(N1, h1); g.add(H.text('Guanine (G)', { size: 0.24, bold: true, pos: [0, -2.0, 0] })); labels.push(L('Guanine — purine', '2-amino-6-oxopurine', [0, 0, 0])); labels.push(L('C=O at C6', 'Keto group; pairs with cytosine by 3 H-bonds', ox)); labels.push(L('–NH₂ at C2', 'Amino group', am)); labels.push(L('N1–H', 'H-bond donor to C', h1)); labels.push(L('N9 — sugar attachment', 'N-glycosidic bond', N9)); }
  } else {
    // pyrimidine: N1 C2 N3 C4 C5 C6
    const N1 = hex[3], C2 = hex[4], N3 = hex[5], C4 = hex[0], C5 = hex[1], C6 = hex[2];
    add('N', N1, 'N1'); add('C', C2, 'C2'); add('N', N3, 'N3'); add('C', C4, 'C4'); add('C', C5, 'C5'); add('C', C6, 'C6');
    bd(N1, C2); bd(C2, N3); bd(N3, C4, kind === 'C' ? 2 : 1); bd(C4, C5, kind === 'C' ? 1 : 1); bd(C5, C6, 2); bd(C6, N1);
    const o2 = [C2[0], C2[1] - 0.95, 0]; add('O', o2, 'O'); bd(C2, o2, 2);
    const h1 = [N1[0] - 0.55, N1[1] - 0.3, 0.2]; add('H', h1); bd(N1, h1);
    g.add(H.text(kind === 'C' ? 'Cytosine (C)' : kind === 'T' ? 'Thymine (T)' : 'Uracil (U)', { size: 0.24, bold: true, pos: [0, -2.2, 0] }));
    labels.push(L((kind === 'C' ? 'Cytosine' : kind === 'T' ? 'Thymine' : 'Uracil') + ' — pyrimidine', 'Single six-membered ring with 2 N', [0, 0, 0]));
    labels.push(L('C=O at C2', 'Keto group', o2));
    labels.push(L('N1–H — sugar attachment', 'N-glycosidic bond at N1', N1));
    if (kind === 'C') { const am = [C4[0], C4[1] + 0.95, 0]; add('N', am, 'NH₂'); bd(C4, am); labels.push(L('–NH₂ at C4', 'Amino group; C pairs with G (3 H-bonds)', am)); labels.push(L('Present in both DNA & RNA', '2-oxo-4-aminopyrimidine', C5)); }
    else { const o4 = [C4[0], C4[1] + 0.95, 0]; add('O', o4, 'O'); bd(C4, o4, 2); const h3 = [N3[0] + 0.55, N3[1] - 0.3, 0.2]; add('H', h3); bd(N3, h3); labels.push(L('C=O at C4', 'Second keto group', o4)); labels.push(L('N3–H', 'H-bond donor', h3)); if (kind === 'T') { const me = [C5[0] + 0.95, C5[1] + 0.2, 0]; add('C', me, 'CH₃'); bd(C5, me); labels.push(L('–CH₃ at C5 (thymine only)', '5-methyluracil; DNA only; pairs with A (2 H-bonds)', me)); } else labels.push(L('H at C5 (no methyl)', 'Uracil replaces thymine in RNA; pairs with A', C5)); }
  }
  return { g, labels };
}
function nucleotideChain() {
  const g = H.grp(), labels = [];
  const unit = (y, base, col) => { const s = [0, y, 0]; // sugar as pentagon
    const pent = []; for (let i = 0; i < 5; i++) { const a = PI / 2 + i * TAU / 5; pent.push([s[0] + 0.5 * Math.cos(a), s[1] + 0.5 * Math.sin(a), 0]); }
    pent.forEach((p, i) => { g.add(H.atom(i === 0 ? 'O' : 'C', p, { r: 0.16, label: i === 0 ? 'O' : ['', "1′", "2′", "3′", "4′"][i] })); g.add(H.bond(p, pent[(i + 1) % 5], { r: 0.035 })); });
    // C5' out to phosphate above
    const c5 = [pent[4][0] - 0.55, pent[4][1] + 0.45, 0]; g.add(H.atom('C', c5, { r: 0.14, label: "5′" })); g.add(H.bond(pent[4], c5, { r: 0.035 }));
    const P = [c5[0] - 0.1, c5[1] + 0.7, 0]; g.add(H.atom('P', P, { r: 0.24 })); g.add(H.bond(c5, P, { r: 0.035 })); g.add(H.atom('O', [P[0] - 0.55, P[1], 0], { r: 0.13, label: 'O⁻' })); g.add(H.bond(P, [P[0] - 0.55, P[1], 0], { r: 0.03 })); g.add(H.atom('O', [P[0] + 0.5, P[1] + 0.2, 0], { r: 0.13, label: 'O' })); g.add(H.bond(P, [P[0] + 0.5, P[1] + 0.2, 0], { r: 0.03, order: 2, gap: 0.05 }));
    // base on C1'
    const b = [pent[1][0] + 0.9, pent[1][1] + 0.1, 0]; g.add(H.bond(pent[1], b, { r: 0.035 })); g.add(H.box(0.9, 0.55, 0.15, col, [b[0] + 0.45, b[1], 0], null, { op: 0.85 })); g.add(H.text(base, { size: 0.2, bold: true, pos: [b[0] + 0.45, b[1], 0.1], top: true }));
    return { pent, P, c5, base: [b[0] + 0.45, b[1], 0] };
  };
  const u1 = unit(1.6, 'A', C.green), u2 = unit(-0.4, 'T', C.red), u3 = unit(-2.4, 'G', C.purple);
  // phosphodiester: C3' of upper to P of lower
  g.add(H.bond(u1.pent[3], u2.P, { r: 0.035 })); g.add(H.bond(u2.pent[3], u3.P, { r: 0.035 }));
  g.add(H.text("5′ end", { size: 0.16, pos: [u1.P[0], u1.P[1] + 0.6, 0], color: C.grey })); g.add(H.text("3′ end", { size: 0.16, pos: [u3.pent[3][0], u3.pent[3][1] - 0.5, 0], color: C.grey }));
  labels.push(L('Pentose sugar (2-deoxyribose)', 'Five-membered furanose; ribose in RNA has 2′-OH', [0, 1.6, 0]));
  labels.push(L('Phosphate group', 'Esterified to C5′-OH', u1.P));
  labels.push(L('Nitrogenous base (on C1′)', 'N-glycosidic bond; purine (A, G) or pyrimidine (C, T/U)', u1.base));
  labels.push(L('Phosphodiester linkage (3′→5′)', 'Phosphate bridges C3′ of one sugar and C5′ of the next', [(u1.pent[3][0] + u2.P[0]) / 2, (u1.pent[3][1] + u2.P[1]) / 2, 0]));
  labels.push(L('Nucleoside = sugar + base', 'Nucleotide = nucleoside + phosphate', u2.pent[1]));
  labels.push(L('Sugar–phosphate backbone', 'Polarity: 5′ end (free phosphate) → 3′ end (free OH)', u2.P));
  labels.push(L("3′ end", "Free 3′-OH where the next nucleotide adds", u3.pent[3]));
  return { g, labels };
}
reg(Object.assign({}, CH, {
  id: 'c12-13-3', cls: 12, unit: UO, ch: 'Ch 13 — Biomolecules', fig: 'Nucleic acids', title: 'Nitrogenous bases & nucleotide chain',
  desc: 'Nucleic acids are polynucleotides: pentose sugar (ribose/2-deoxyribose) + phosphate + heterocyclic base. Purines (adenine, guanine) have two fused rings; pyrimidines (cytosine, thymine, uracil) have one ring. Thymine is in DNA only, uracil in RNA only.',
  points: ['Base pairing: A=T (2 H-bonds), G≡C (3 H-bonds); in RNA A=U.', 'Nucleoside = base + sugar (C1′ N-glycosidic); nucleotide = nucleoside + phosphate (C5′).', 'Phosphodiester bonds (3′–5′) form the backbone; DNA double helix (Watson–Crick) is antiparallel.', 'DNA: hereditary material; RNA: mRNA, tRNA, rRNA (protein synthesis).'],
  variants: [{ name: 'Adenine', build: () => baseRing('A') }, { name: 'Guanine', build: () => baseRing('G') }, { name: 'Cytosine', build: () => baseRing('C') }, { name: 'Thymine', build: () => baseRing('T') }, { name: 'Uracil', build: () => baseRing('U') }, { name: 'Nucleotide chain', build: nucleotideChain }]
}));


/* ================================================================
   6. PHYSICS
   ================================================================ */
const PH = { sub: 'phy' };
const UM = 'Mechanics, Waves & Thermodynamics', UE = 'Electrodynamics & Magnetism';

/* ---------- Ch 3 Kinematics ---------- */
function kinGraph(kind) {
  const g = H.grp(), labels = [];
  if (kind === 'xt') {
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [0, 10], xl: 'time t', yl: 'position x', nx: 5, ny: 5, curves: [{ f: t => 0.6 * t, color: C.green, r: 0.035, label: 'uniform (v const)' }, { f: t => 0.09 * t * t, color: C.orange, r: 0.035, label: 'uniform accel.', dom: [0, 10] }, { f: t => 4, color: C.grey, dashed: true }] });
    g.add(G);
    labels.push(L('Uniform motion — straight line', 'Slope = velocity (constant)', G.map(5, 3)));
    labels.push(L('Uniformly accelerated — parabola', 'x = ½at²; slope (velocity) increases with time', G.map(8, 0.09 * 64)));
    labels.push(L('At rest — horizontal line', 'Position does not change; slope = 0', G.map(2, 4)));
    labels.push(L('Slope of x–t = velocity', 'Tangent slope gives instantaneous velocity', G.map(9, 5.4)));
    return { g, labels, note: 'Position–time graph: slope = velocity. Straight line → uniform velocity; parabola → uniform acceleration; horizontal → rest.' };
  }
  if (kind === 'vt') {
    const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [0, 10], xl: 'time t', yl: 'velocity v', nx: 5, ny: 5, curves: [{ f: t => 5, color: C.green, r: 0.035, label: 'uniform (a = 0)' }, { f: t => 1 + 0.8 * t, color: C.orange, r: 0.035, label: 'uniform accel.' }, { f: t => 9 - 0.7 * t, color: C.red, r: 0.035, label: 'retardation' }] });
    g.add(G);
    const shade = []; for (let i = 0; i <= 10; i++) shade.push(G.map(i * 0.6, 1 + 0.48 * i, 0.03)); g.add(H.extrude([[G.map(0, 0)[0], G.map(0, 0)[1]], [G.map(6, 0)[0], G.map(6, 0)[1]], [G.map(6, 5.8)[0], G.map(6, 5.8)[1]], [G.map(0, 1)[0], G.map(0, 1)[1]]], 0.02, C.orange, [0, 0, 0.02], null, { op: 0.2 }));
    labels.push(L('Constant velocity — horizontal line', 'Acceleration zero', G.map(3, 5)));
    labels.push(L('Uniform acceleration — straight line with +slope', 'Slope = acceleration; intercept = u', G.map(8, 1 + 6.4)));
    labels.push(L('Retardation — negative slope', 'Velocity decreasing', G.map(8, 9 - 5.6)));
    labels.push(L('Area under v–t = displacement', 'Shaded trapezium: s = ut + ½at²', G.map(3, 1.5)));
    return { g, labels, note: 'Velocity–time graph: slope = acceleration; area under curve = displacement.' };
  }
  const G = H.graph({ w: 4.6, h: 3, xr: [0, 10], yr: [-4, 6], xl: 'time t', yl: 'acceleration a', nx: 5, ny: 5, yt: [[0, '0']], curves: [{ f: t => 3, color: C.orange, r: 0.035, label: 'uniform a' }, { f: t => 0, color: C.green, r: 0.03, label: 'a = 0 (uniform v)' }, { f: t => -2, color: C.red, r: 0.03, label: 'retardation' }] });
  g.add(G);
  labels.push(L('Uniform acceleration — horizontal line above axis', 'Area under a–t = change in velocity', G.map(4, 3)));
  labels.push(L('Zero acceleration', 'Uniform velocity motion', G.map(7, 0)));
  labels.push(L('Negative (retardation)', 'Velocity decreases', G.map(4, -2)));
  labels.push(L('Area = Δv', 'a·Δt = v − u', G.map(9, 3.5)));
  return { g, labels, note: 'Acceleration–time graph: area under the curve = change in velocity; horizontal line = uniform acceleration.' };
}
reg(Object.assign({}, PH, {
  id: 'p11-3-1', cls: 11, unit: UM, ch: 'Ch 3 — Motion in a Straight Line', fig: 'Kinematic graphs', title: 'x–t, v–t and a–t graphs',
  desc: 'Graphs of position, velocity and acceleration against time for uniform and uniformly accelerated motion. Slopes and areas link the three: slope of x–t = v; slope of v–t = a; area under v–t = displacement; area under a–t = Δv.',
  points: ['Uniform motion: x–t straight line; v–t horizontal; a–t zero.', 'Uniform acceleration: x–t parabola; v–t straight line; a–t horizontal.', 'v = u + at; s = ut + ½at²; v² = u² + 2as (constant a only).', 'Displacement can be negative (area below axis); distance cannot.'],
  variants: [{ name: 'x–t', build: () => kinGraph('xt') }, { name: 'v–t', build: () => kinGraph('vt') }, { name: 'a–t', build: () => kinGraph('at') }]
}));

reg(Object.assign({}, PH, {
  id: 'p11-3-2', cls: 11, unit: UM, ch: 'Ch 4 — Motion in a Plane', fig: 'Projectile motion', title: 'Projectile motion — velocity components',
  desc: 'A projectile launched with speed u at angle θ follows a parabola. Horizontal velocity v_x = u cos θ stays constant; vertical velocity v_y = u sin θ − gt changes, becoming zero at the top. Range R = u² sin 2θ / g; max height H = u² sin²θ / 2g; time of flight T = 2u sin θ / g.',
  points: ['Horizontal and vertical motions are independent.', 'At maximum height only v_x remains (velocity horizontal, minimum speed).', 'Max range at θ = 45°; complementary angles give the same range.', 'Trajectory: y = x tan θ − g x² / (2u² cos²θ).'],
  build() {
    const g = H.grp(), labels = [];
    const u = 10, th = deg(55), gg = 9.8; const T = 2 * u * Math.sin(th) / gg;
    const sx = 0.42, sy = 0.55; const X = t => (u * Math.cos(th) * t) * sx - 2.4, Y = t => (u * Math.sin(th) * t - 0.5 * gg * t * t) * sy - 1.4;
    const pts = []; for (let i = 0; i <= 60; i++) { const t = T * i / 60; pts.push([X(t), Y(t), 0]); }
    g.add(H.plane(6, 1.5, C.brown, [0, -1.4, -0.75], [-PI / 2, 0, 0], { op: 0.3 })); g.add(H.line([[-3, -1.4, 0], [3, -1.4, 0]], C.grey));
    g.add(H.tube(pts, 0.035, C.yellow, { seg: 80, tension: 0.2 }));
    const vec2 = (t, col) => { const p = [X(t), Y(t), 0]; const vx = u * Math.cos(th) * 0.09, vy = (u * Math.sin(th) - gg * t) * 0.09; g.add(H.sphere(0.08, C.white, p, { e: 0.8 })); g.add(H.arrow(p, [p[0] + vx, p[1], 0], C.cyan, { r: 0.018, head: 0.12 })); if (Math.abs(vy) > 0.05) g.add(H.arrow(p, [p[0], p[1] + vy, 0], C.orange, { r: 0.018, head: 0.12 })); g.add(H.arrow(p, [p[0] + vx, p[1] + vy, 0], col, { r: 0.015, head: 0.1, op: 0.7 })); return p; };
    const p0 = vec2(0.05, C.red), p1 = vec2(T * 0.25, C.red), p2 = vec2(T / 2, C.red), p3 = vec2(T * 0.75, C.red), p4 = vec2(T * 0.98, C.red);
    g.add(H.line([[X(T / 2), -1.4, 0], [X(T / 2), Y(T / 2), 0]], C.grey, { dashed: true })); g.add(H.text('H', { size: 0.2, pos: [X(T / 2) + 0.2, (Y(T / 2) - 1.4) / 2, 0], color: C.grey }));
    g.add(H.arrow([X(0), -1.6, 0], [X(T), -1.6, 0], C.grey, { r: 0.012, head: 0.1 })); g.add(H.text('R = u² sin2θ / g', { size: 0.16, pos: [0, -1.85, 0], color: C.grey }));
    g.add(H.torus(0.35, 0.015, C.white, [X(0), Y(0), 0], null, { arc: th })); g.add(H.text('θ', { size: 0.18, pos: [X(0) + 0.5, Y(0) + 0.2, 0], color: C.white }));
    g.add(H.arrow([2.5, 0.8, 0], [2.5, 0.1, 0], C.red, { r: 0.02, head: 0.12 })); g.add(H.text('g', { size: 0.2, pos: [2.75, 0.45, 0], color: C.red }));
    labels.push(L('Launch: u at angle θ', 'v_x = u cos θ, v_y = u sin θ', p0));
    labels.push(L('v_x constant (horizontal)', 'No horizontal force → u cos θ throughout', [p1[0] + 0.45, p1[1], 0]));
    labels.push(L('v_y decreases going up', 'v_y = u sin θ − gt', [p1[0], p1[1] + 0.5, 0]));
    labels.push(L('Highest point: v_y = 0', 'Velocity purely horizontal; speed minimum = u cos θ', p2));
    labels.push(L('v_y increases downward', 'Symmetric to ascent', [p3[0], p3[1] - 0.4, 0]));
    labels.push(L('Landing: same speed u, angle θ below', 'Time of flight T = 2u sin θ / g', p4));
    labels.push(L('Maximum height H = u² sin²θ / 2g', 'Reached at t = T/2', [X(T / 2), (Y(T / 2) - 1.4) / 2, 0]));
    labels.push(L('Range R', 'Maximum at θ = 45°', [0, -1.85, 0]));
    labels.push(L('Acceleration g (constant, downward)', 'Only vertical component of motion is accelerated', [2.5, 0.45, 0]));
    return { g, labels };
  }
}));

/* ---------- Ch 4/5 Laws of Motion ---------- */
function fbd(kind) {
  const g = H.grp(), labels = [];
  const A = (a, b, col, o) => g.add(H.arrow(a, b, col, Object.assign({ r: 0.03, head: 0.22 }, o)));
  if (kind === 'flat') {
    g.add(H.box(6, 0.2, 2.4, C.grey, [0, -1.1, 0], null, { op: 0.6 })); g.add(H.box(1.4, 1.2, 1.2, C.amber, [0, -0.4, 0]));
    A([0, 0.2, 0], [0, 1.9, 0], C.green); g.add(H.text('N', { size: 0.22, bold: true, pos: [0.3, 1.8, 0], color: C.green }));
    A([0, -0.4, 0], [0, -2.1, 0], C.red); g.add(H.text('mg', { size: 0.22, bold: true, pos: [0.35, -2.0, 0], color: C.red }));
    A([0.7, -0.4, 0], [2.6, -0.4, 0], C.cyan); g.add(H.text('F (applied)', { size: 0.2, bold: true, pos: [2.2, -0.05, 0], color: C.cyan }));
    A([-0.7, -0.95, 0], [-2.0, -0.95, 0], C.orange); g.add(H.text('f (friction)', { size: 0.2, bold: true, pos: [-1.8, -0.6, 0], color: C.orange }));
    labels.push(L('Normal reaction N', 'Perpendicular to surface; N = mg on a horizontal surface', [0, 1.5, 0]));
    labels.push(L('Weight mg', 'Acts at centre of mass, vertically down', [0, -1.8, 0]));
    labels.push(L('Applied force F', 'Horizontal push/pull', [2.2, -0.4, 0]));
    labels.push(L('Friction f', 'Opposes relative motion; f ≤ μ_s N (static), f_k = μ_k N (kinetic)', [-1.7, -0.95, 0]));
    labels.push(L('Net force → acceleration', 'F − f = ma; N − mg = 0', [0, -0.4, 0.7]));
    return { g, labels, note: 'Block on horizontal surface: vertical N = mg; horizontal F − f = ma. Static friction adjusts up to μ_s N.' };
  }
  if (kind === 'incline') {
    const th = deg(30);
    g.add(H.extrude([[-3, -1.5], [3, -1.5], [3, -1.5 + 6 * Math.tan(th)]], 2.0, C.grey, null, null, { op: 0.5 }));
    const bg = H.grp([], [0.4, -1.5 + 3.4 * Math.tan(th) + 0.55, 0], [0, 0, th]); bg.add(H.box(1.3, 1.0, 1.0, C.amber, [0, 0, 0]));
    // forces in block frame: N along local +y, friction along local +x (up slope), mg components
    bg.add(H.arrow([0, 0.5, 0], [0, 2.0, 0], C.green, { r: 0.03, head: 0.22 })); bg.add(H.text('N', { size: 0.22, bold: true, pos: [0.3, 1.9, 0], color: C.green }));
    bg.add(H.arrow([-0.65, -0.3, 0], [-2.0, -0.3, 0], C.orange, { r: 0.03, head: 0.22 })); bg.add(H.text('f', { size: 0.22, bold: true, pos: [-1.9, 0.05, 0], color: C.orange }));
    bg.add(H.arrow([0, 0, 0], [1.6, 0, 0], C.pink, { r: 0.025, head: 0.18 })); bg.add(H.text('mg sinθ', { size: 0.18, bold: true, pos: [1.5, 0.35, 0], color: C.pink }));
    bg.add(H.arrow([0, 0, 0], [0, -1.7, 0], C.purple, { r: 0.025, head: 0.18 })); bg.add(H.text('mg cosθ', { size: 0.18, bold: true, pos: [0.6, -1.5, 0], color: C.purple }));
    g.add(bg);
    const bp = bg.position.toArray();
    g.add(H.arrow(bp, [bp[0], bp[1] - 2.2, 0], C.red, { r: 0.03, head: 0.22 })); g.add(H.text('mg', { size: 0.22, bold: true, pos: [bp[0] - 0.35, bp[1] - 2.1, 0], color: C.red }));
    g.add(H.torus(0.6, 0.015, C.white, [-3, -1.5, 1.0], null, { arc: th })); g.add(H.text('θ', { size: 0.2, pos: [-2.2, -1.3, 1.0], color: C.white }));
    const W = (x, y) => [bp[0] + x * Math.cos(th) - y * Math.sin(th), bp[1] + x * Math.sin(th) + y * Math.cos(th), 0];
    labels.push(L('Normal reaction N = mg cosθ', 'Perpendicular to the incline', W(0, 1.7)));
    labels.push(L('Friction f (up the slope)', 'Opposes tendency to slide down; f = μN when sliding', W(-1.8, -0.3)));
    labels.push(L('mg sinθ (along slope)', 'Component driving the block down', W(1.5, 0)));
    labels.push(L('mg cosθ (into slope)', 'Balanced by N', W(0, -1.5)));
    labels.push(L('Weight mg (vertical)', 'Resolved into two components', [bp[0], bp[1] - 2.0, 0]));
    labels.push(L('Angle of incline θ', 'Block just slides when tanθ = μ_s (angle of repose)', [-2.2, -1.3, 1.0]));
    return { g, labels, note: 'Inclined plane: N = mg cosθ; along slope mg sinθ − f = ma. At rest: f = mg sinθ ≤ μ_s mg cosθ → tanθ ≤ μ_s.' };
  }
  // hanging mass / pulley (Atwood-like)
  g.add(H.box(3, 0.2, 1.5, C.grey, [0, 2.4, 0], null, { op: 0.6 })); g.add(H.torus(0.4, 0.08, C.dgrey, [0, 1.7, 0])); g.add(H.rod([0, 2.3, 0], [0, 1.7, 0], 0.04, C.grey));
  g.add(H.rod([-0.4, 1.7, 0], [-0.4, 0.2, 0], 0.025, C.white)); g.add(H.rod([0.4, 1.7, 0], [0.4, -0.6, 0], 0.025, C.white));
  g.add(H.box(0.8, 0.8, 0.8, C.amber, [-0.4, -0.2, 0])); g.add(H.text('m₁', { size: 0.2, bold: true, pos: [-0.4, -0.2, 0.42], top: true }));
  g.add(H.box(1.0, 1.0, 1.0, C.orange, [0.4, -1.1, 0])); g.add(H.text('m₂', { size: 0.2, bold: true, pos: [0.4, -1.1, 0.52], top: true }));
  A([-0.4, 0.2, 0.2], [-0.4, 1.3, 0.2], C.green); g.add(H.text('T', { size: 0.22, bold: true, pos: [-0.75, 1.2, 0.2], color: C.green }));
  A([-0.4, -0.2, 0.2], [-0.4, -1.4, 0.2], C.red); g.add(H.text('m₁g', { size: 0.2, bold: true, pos: [-0.95, -1.3, 0.2], color: C.red }));
  A([0.4, -0.6, 0.3], [0.4, 0.5, 0.3], C.green); g.add(H.text('T', { size: 0.22, bold: true, pos: [0.75, 0.4, 0.3], color: C.green }));
  A([0.4, -1.1, 0.3], [0.4, -2.6, 0.3], C.red); g.add(H.text('m₂g', { size: 0.2, bold: true, pos: [0.95, -2.5, 0.3], color: C.red }));
  A([1.4, -0.4, 0], [1.4, -1.2, 0], C.cyan, { r: 0.02 }); g.add(H.text('a', { size: 0.2, pos: [1.7, -0.8, 0], color: C.cyan })); A([-1.4, -0.9, 0], [-1.4, -0.1, 0], C.cyan, { r: 0.02 }); g.add(H.text('a', { size: 0.2, pos: [-1.7, -0.5, 0], color: C.cyan }));
  labels.push(L('Tension T (same in massless string)', 'Frictionless pulley → T equal on both sides', [-0.4, 1.0, 0.2]));
  labels.push(L('Weight m₁g', 'Lighter mass accelerates upward: T − m₁g = m₁a', [-0.4, -1.2, 0.2]));
  labels.push(L('Weight m₂g', 'Heavier mass accelerates downward: m₂g − T = m₂a', [0.4, -2.3, 0.3]));
  labels.push(L('Acceleration a = (m₂ − m₁)g/(m₁ + m₂)', 'T = 2m₁m₂g/(m₁ + m₂)', [1.4, -0.8, 0]));
  labels.push(L('Frictionless, massless pulley', 'Changes direction of tension only', [0, 1.7, 0.4]));
  return { g, labels, note: 'Atwood machine: apply Newton\'s second law to each mass separately; string constraint gives equal a.' };
}
reg(Object.assign({}, PH, {
  id: 'p11-4-1', cls: 11, unit: UM, ch: 'Ch 5 — Laws of Motion', fig: 'Free body diagrams', title: 'Free body diagrams',
  desc: 'A free body diagram isolates one body and shows all external forces acting on it: weight, normal reaction, tension, friction and applied forces. Newton\'s second law is then applied along chosen axes.',
  points: ['Normal reaction is perpendicular to the contact surface; on an incline N = mg cosθ.', 'Static friction is self-adjusting up to f_max = μ_s N; kinetic friction f_k = μ_k N (μ_k < μ_s).', 'Tension in a massless string is the same throughout if pulley is frictionless.', 'Choose axes along and perpendicular to the surface for inclines.'],
  variants: [{ name: 'Block on flat surface', build: () => fbd('flat') }, { name: 'Block on incline', build: () => fbd('incline') }, { name: 'Pulley (Atwood)', build: () => fbd('pulley') }]
}));

reg(Object.assign({}, PH, {
  id: 'p11-4-2', cls: 11, unit: UM, ch: 'Ch 5 — Laws of Motion', fig: 'Banking of roads', title: 'Banking of roads — vehicle on a curved banked track',
  desc: 'On a road banked at angle θ, the horizontal component of the normal reaction (N sinθ) provides the centripetal force, so a vehicle can turn without relying on friction. With friction: v_max = √[Rg (μ + tanθ)/(1 − μ tanθ)]; without: v₀ = √(Rg tanθ).',
  points: ['Vertical: N cosθ = mg (+ friction component). Horizontal: N sinθ (+ f cosθ) = mv²/R.', 'Optimum speed v₀ = √(Rg tanθ): no friction needed; no wear of tyres.', 'Below v₀ friction acts up the slope; above v₀ friction acts down the slope.', 'Unbanked road: v_max = √(μRg).'],
  build() {
    const g = H.grp(), labels = [];
    const th = deg(25);
    g.add(H.extrude([[-3, -1.5], [3, -1.5], [3, -1.5 + 6 * Math.tan(th)]], 2.2, C.grey, null, null, { op: 0.5 }));
    const cg = H.grp([], [0.2, -1.5 + 3.2 * Math.tan(th) + 0.5, 0], [0, 0, th]);
    cg.add(H.box(1.8, 0.5, 1.0, C.red, [0, 0.1, 0])); cg.add(H.box(1.0, 0.4, 0.9, C.cyan, [-0.1, 0.55, 0], null, { op: 0.6 })); for (const x of [-0.6, 0.6]) for (const z of [-0.5, 0.5]) cg.add(H.cyl(0.22, 0.22, 0.15, C.ink, [x, -0.2, z], [PI / 2, 0, 0], { seg: 14 }));
    cg.add(H.arrow([0, 0.2, 0], [0, 2.2, 0], C.green, { r: 0.03, head: 0.22 })); cg.add(H.text('N', { size: 0.22, bold: true, pos: [0.3, 2.1, 0], color: C.green }));
    cg.add(H.arrow([-0.95, -0.35, 0], [-2.1, -0.35, 0], C.orange, { r: 0.025, head: 0.18 })); cg.add(H.text('f', { size: 0.2, bold: true, pos: [-2.0, 0.0, 0], color: C.orange }));
    g.add(cg);
    const bp = cg.position.toArray();
    g.add(H.arrow(bp, [bp[0], bp[1] - 2.2, 0], C.red, { r: 0.03, head: 0.22 })); g.add(H.text('mg', { size: 0.22, bold: true, pos: [bp[0] + 0.4, bp[1] - 2.1, 0], color: C.red }));
    // N components
    const Nx = -2.0 * Math.sin(th), Ny = 2.0 * Math.cos(th);
    g.add(H.line([bp, [bp[0] + Nx, bp[1] + Ny, 0]], C.green, { dashed: true }));
    g.add(H.arrow(bp, [bp[0], bp[1] + Ny, 0], C.lime, { r: 0.02, head: 0.14 })); g.add(H.text('N cosθ', { size: 0.16, pos: [bp[0] + 0.55, bp[1] + Ny, 0], color: C.lime }));
    g.add(H.arrow(bp, [bp[0] + Nx, bp[1], 0], C.yellow, { r: 0.02, head: 0.14 })); g.add(H.text('N sinθ', { size: 0.16, pos: [bp[0] + Nx - 0.2, bp[1] - 0.3, 0], color: C.yellow }));
    g.add(H.line([[bp[0] + Nx, bp[1], 0], [bp[0] + Nx, bp[1] + Ny, 0]], C.grey, { dashed: true })); g.add(H.line([[bp[0], bp[1] + Ny, 0], [bp[0] + Nx, bp[1] + Ny, 0]], C.grey, { dashed: true }));
    g.add(H.torus(0.6, 0.015, C.white, [-3, -1.5, 1.1], null, { arc: th })); g.add(H.text('θ', { size: 0.2, pos: [-2.2, -1.3, 1.1], color: C.white }));
    g.add(H.arrow([bp[0] + 0.3, bp[1] + 0.9, -1.2], [bp[0] - 1.2, bp[1] + 0.9, -1.2], C.cyan, { r: 0.02, head: 0.15 })); g.add(H.text('centre of curve ←', { size: 0.14, pos: [bp[0] - 0.9, bp[1] + 1.2, -1.2], color: C.cyan }));
    labels.push(L('Normal reaction N', 'Perpendicular to the banked surface', [bp[0] + Nx * 0.8, bp[1] + Ny * 0.8, 0]));
    labels.push(L('N cosθ (vertical component)', 'Balances weight: N cosθ = mg (ideal case)', [bp[0], bp[1] + Ny, 0]));
    labels.push(L('N sinθ (horizontal component)', 'Provides centripetal force: N sinθ = mv²/R', [bp[0] + Nx, bp[1], 0]));
    labels.push(L('Weight mg', 'Vertically downward', [bp[0], bp[1] - 2.0, 0]));
    labels.push(L('Friction f (along slope)', 'Up-slope at low speed, down-slope at high speed; zero at v₀ = √(Rg tanθ)', [bp[0] - 1.8 * Math.cos(th), bp[1] - 1.8 * Math.sin(th) - 0.3, 0]));
    labels.push(L('Banking angle θ', 'tanθ = v₀²/Rg', [-2.2, -1.3, 1.1]));
    labels.push(L('Direction to centre of the curve', 'Inward horizontal force needed for circular motion', [bp[0] - 0.9, bp[1] + 0.9, -1.2]));
    return { g, labels };
  }
}));

/* ---------- Ch 6/7 Rotational ---------- */
reg(Object.assign({}, PH, {
  id: 'p11-6-1', cls: 11, unit: UM, ch: 'Ch 7 — System of Particles & Rotational Motion', fig: 'Centre of mass', title: 'Centre of mass of symmetric bodies',
  desc: 'For bodies of uniform density with symmetry, the centre of mass lies at the geometric centre — even where there is no mass (ring). For a semicircular/hemispherical body it is shifted from the flat face; for a cone it lies on the axis at h/4 from the base.',
  points: ['Ring, disc, sphere, cube, rod: COM at geometric centre.', 'Solid cone: h/4 from base; hollow cone: h/3 from base. Solid hemisphere: 3R/8 from flat face; hollow: R/2.', 'Triangular lamina: centroid (intersection of medians).', 'Semicircular ring: 2R/π from centre; semicircular disc: 4R/3π.'],
  build() {
    const g = H.grp(), labels = [];
    const dot = p => { g.add(H.sphere(0.09, C.yellow, p, { e: 1 })); return p; };
    g.add(H.torus(0.8, 0.07, C.cyan, [-2.6, 1.3, 0])); const ring = dot([-2.6, 1.3, 0]);
    g.add(H.cyl(0.8, 0.8, 0.12, C.green, [0, 1.3, 0], [PI / 2, 0, 0], { op: 0.85 })); const disc = dot([0, 1.3, 0]);
    g.add(H.sphere(0.75, C.orange, [2.6, 1.3, 0], { op: 0.5 })); const sph = dot([2.6, 1.3, 0]);
    g.add(H.rod([-3.5, -0.4, 0], [-1.7, -0.4, 0], 0.08, C.pink)); const rod = dot([-2.6, -0.4, 0]);
    g.add(H.extrude([[-0.9, -0.5], [0.9, -0.5], [0.2, 0.9]], 0.1, C.purple, [0, -0.6, 0], null, { op: 0.85 })); const tri = dot([0 + (-0.9 + 0.9 + 0.2) / 3, -0.6 + (-0.5 - 0.5 + 0.9) / 3, 0.06]);
    g.add(H.cone(0.7, 1.4, C.teal, [2.6, -0.5, 0], null, { op: 0.6 })); const cone = dot([2.6, -0.5 - 0.7 + 0.35, 0]);
    g.add(H.sphere(0.75, C.amber, [-1.3, -2.2, 0], { op: 0.55, theta: PI / 2 })); g.add(H.disc(0.75, C.amber, [-1.3, -2.2, 0], [PI / 2, 0, 0], { op: 0.6 })); const hemi = dot([-1.3, -2.2 + 0.75 * 3 / 8, 0]);
    g.add(H.box(1.1, 1.1, 1.1, C.blue, [1.3, -2.2, 0], null, { op: 0.5 })); const cube = dot([1.3, -2.2, 0]);
    labels.push(L('Ring — centre (no mass there)', 'COM need not lie on the body', ring));
    labels.push(L('Disc — geometric centre', 'By symmetry', disc));
    labels.push(L('Sphere — centre', 'Solid or hollow', sph));
    labels.push(L('Uniform rod — midpoint', 'L/2 from either end', rod));
    labels.push(L('Triangular lamina — centroid', 'Intersection of medians (2/3 along each median)', tri));
    labels.push(L('Solid cone — h/4 from base', 'On the axis; hollow cone h/3', cone));
    labels.push(L('Solid hemisphere — 3R/8 from flat face', 'Hollow hemisphere R/2', hemi));
    labels.push(L('Cube — centre', 'Intersection of body diagonals', cube));
    return { g, labels };
  }
}));

/* ---------- Ch 8/9 Mechanical properties ---------- */
reg(Object.assign({}, PH, {
  id: 'p11-8-1', cls: 11, unit: UM, ch: 'Ch 8 — Mechanical Properties of Solids', fig: 'Stress–strain curve', title: 'Stress–strain curve for a metal wire',
  desc: 'Up to the proportional limit A stress ∝ strain (Hooke\'s law). B is the elastic limit/yield point; beyond it the material deforms plastically. D is the ultimate tensile strength; E the fracture point. If D and E are close the material is brittle; if far apart, ductile.',
  points: ['Young\'s modulus Y = stress/strain in the linear region (slope OA).', 'Yield strength σ_y at B; ultimate tensile strength σ_u at D.', 'Permanent set: on unloading beyond B the wire does not return to original length.', 'Elastomers (rubber) show no linear region and no plastic region — large strain, returns to original.'],
  build() {
    const g = H.grp(), labels = [];
    const f = x => x < 2 ? 2.2 * x : x < 2.6 ? 4.4 + 1.2 * (x - 2) : x < 6 ? 5.12 + 2.3 * Math.sin((x - 2.6) / 3.4 * PI / 2) : 7.42 - 1.4 * (x - 6);
    const G = H.graph({ w: 4.8, h: 3, xr: [0, 8], yr: [0, 9], xl: 'Strain', yl: 'Stress', nx: 8, ny: 6, curves: [{ f, color: C.orange, r: 0.04, n: 120, dom: [0, 7.4] }], marks: [{ x: 2, y: f(2), color: C.green, label: 'A', dx: -0.3, dy: 0.15 }, { x: 2.6, y: f(2.6), color: C.yellow, label: 'B', dx: -0.3, dy: 0.15 }, { x: 4.0, y: f(4.0), color: C.cyan, label: 'C', dx: -0.1, dy: 0.25 }, { x: 6, y: f(6), color: C.red, label: 'D', dx: 0.1, dy: 0.25 }, { x: 7.4, y: f(7.4), color: C.white, label: 'E', dx: 0.3, dy: 0.1 }] });
    g.add(G);
    g.add(H.line([G.map(3.0, 0), G.map(3.0, f(3.0))], C.grey, { dashed: true })); g.add(H.line([G.map(3.0, f(3.0)), G.map(1.0, 0)], C.grey, { dashed: true })); g.add(H.text('permanent set', { size: 0.13, pos: G.map(0.9, -0.9), color: C.grey }));
    labels.push(L('O–A: linear region (Hooke\'s law)', 'Stress ∝ strain; slope = Young\'s modulus', G.map(1, f(1))));
    labels.push(L('A: proportional limit', 'End of straight line', G.map(2, f(2))));
    labels.push(L('B: elastic limit / yield point', 'Beyond B, deformation is permanent (plastic)', G.map(2.6, f(2.6))));
    labels.push(L('Plastic region B–D', 'Large strain for small stress increase', G.map(4.0, f(4.0))));
    labels.push(L('D: ultimate tensile strength', 'Maximum stress the material withstands', G.map(6, f(6))));
    labels.push(L('E: fracture point', 'Wire breaks; D–E close → brittle; far → ductile', G.map(7.4, f(7.4))));
    labels.push(L('Unloading from plastic region', 'Returns along dashed line — permanent set', G.map(2.0, 2.2)));
    return { g, labels };
  }
}));

function fluid(kind) {
  const g = H.grp(), labels = [];
  if (kind === 'stream') {
    g.add(H.cyl(0.5, 0.5, 2.0, C.grey, [0, 0, 0], [PI / 2, 0, 0], { op: 0.7, seg: 24 }));
    for (let i = -3; i <= 3; i++) { const y0 = i * 0.42; const pts = []; for (let k = 0; k <= 30; k++) { const x = -3.2 + k * 6.4 / 30; const push = Math.exp(-x * x / 1.2) * (0.62 - Math.abs(y0) * 0.35) * Math.sign(y0 || 1); pts.push([x, y0 + (Math.abs(y0) < 0.55 ? push : push * 0.3), 0]); } g.add(H.tube(pts, 0.02, C.cyan, { seg: 60, tension: 0.3 })); g.add(H.cone(0.06, 0.16, C.cyan, [pts[30][0], pts[30][1], 0], [0, 0, -PI / 2], { seg: 8 })); }
    labels.push(L('Streamlines', 'Path of fluid particles; tangent gives velocity direction; never cross', [-2.5, 0.84, 0]));
    labels.push(L('Obstacle (cylinder)', 'Flow divides smoothly around it', [0, 0, 0.5]));
    labels.push(L('Steady (laminar) flow', 'Velocity at any point constant in time; Re < 1000', [2.5, 1.26, 0]));
    labels.push(L('Closer streamlines = higher speed', 'Equation of continuity: Av = constant', [0, 0.9, 0]));
    return { g, labels, note: 'Streamline flow: every particle follows the path of the preceding one; streamlines do not cross; Reynolds number < 1000.' };
  }
  if (kind === 'turb') {
    g.add(H.cyl(0.5, 0.5, 2.0, C.grey, [0, 0, 0], [PI / 2, 0, 0], { op: 0.7, seg: 24 }));
    for (let i = -3; i <= 3; i++) { const y0 = i * 0.42; const pts = []; for (let k = 0; k <= 10; k++) { const x = -3.2 + k * 0.28; const push = Math.exp(-x * x / 1.2) * (0.62 - Math.abs(y0) * 0.35) * Math.sign(y0 || 1); pts.push([x, y0 + (Math.abs(y0) < 0.55 ? push : push * 0.3), 0]); } g.add(H.tube(pts, 0.02, C.cyan, { seg: 24 })); }
    const rng = H.rng(77); for (let i = 0; i < 7; i++) { const cx = 0.9 + rng() * 2.2, cy = (rng() - 0.5) * 2.2, r = 0.15 + rng() * 0.3; const pts = []; for (let k = 0; k <= 20; k++) { const t = k / 20 * TAU * 1.5; pts.push([cx + r * Math.cos(t) * (1 + t * 0.05), cy + r * Math.sin(t), (rng() - 0.5) * 0.2]); } g.add(H.tube(pts, 0.018, C.orange, { seg: 40 })); }
    labels.push(L('Laminar upstream', 'Ordered layers before the obstacle', [-2.5, 0.84, 0]));
    labels.push(L('Eddies / vortices', 'Irregular, chaotic motion behind the obstacle', [2.0, 0.3, 0]));
    labels.push(L('Turbulent flow', 'Velocity fluctuates; Re > 2000; energy dissipated', [2.5, -1.1, 0]));
    labels.push(L('Critical speed', 'Beyond it streamline flow becomes turbulent; Re = ρvd/η', [0, -1.2, 0]));
    return { g, labels, note: 'Turbulent flow: above critical speed; Reynolds number > 2000; between 1000 and 2000 unsteady.' };
  }
  // venturi
  g.add(H.lathe([[0.7, -3], [0.7, -1.2], [0.3, -0.5], [0.3, 0.5], [0.7, 1.2], [0.7, 3]], C.cyan, null, [0, 0, PI / 2], { seg: 32, op: 0.25, side: THREE.DoubleSide }));
  g.add(H.lathe([[0.72, -3], [0.72, -1.2], [0.32, -0.5], [0.32, 0.5], [0.72, 1.2], [0.72, 3]], C.grey, null, [0, 0, PI / 2], { seg: 32, wire: true, op: 0.3 }));
  for (let k = -1; k <= 1; k++) { const pts = []; for (let i = 0; i <= 30; i++) { const x = -2.8 + i * 5.6 / 30; const r = Math.abs(x) < 0.5 ? 0.3 : Math.abs(x) < 1.2 ? 0.3 + (Math.abs(x) - 0.5) / 0.7 * 0.4 : 0.7; pts.push([x, k * r * 0.6, 0]); } g.add(H.tube(pts, 0.015, C.white, { seg: 60 })); }
  g.add(H.arrow([-3.4, 0, 0], [-2.9, 0, 0], C.yellow, { r: 0.02, head: 0.15 })); g.add(H.text('v₁, P₁, A₁', { size: 0.15, pos: [-2.0, 1.0, 0], color: C.yellow })); g.add(H.text('v₂ > v₁, P₂ < P₁, A₂', { size: 0.15, pos: [0, 0.7, 0], color: C.yellow }));
  // manometer U-tube
  g.add(H.tube([[-2.0, -0.7, 0], [-2.0, -1.8, 0], [-2.0, -2.5, 0], [-1.0, -2.5, 0], [0, -2.5, 0], [0, -1.8, 0], [0, -0.3, 0]], 0.08, C.white, { seg: 40, op: 0.35 }));
  g.add(H.tube([[-2.0, -1.6, 0], [-2.0, -2.5, 0], [-1.0, -2.5, 0], [0, -2.5, 0], [0, -1.0, 0]], 0.07, C.purple, { seg: 30 }));
  g.add(H.line([[-2.0, -1.6, 0.1], [0, -1.6, 0.1]], C.grey, { dashed: true })); g.add(H.line([[0, -1.0, 0.1], [0.5, -1.0, 0.1]], C.grey, { dashed: true })); g.add(H.text('h', { size: 0.18, pos: [0.3, -1.3, 0.1], color: C.white }));
  labels.push(L('Wide section (A₁)', 'Lower speed v₁, higher pressure P₁', [-2.0, 0, 0.7]));
  labels.push(L('Constriction / throat (A₂)', 'Higher speed v₂ = A₁v₁/A₂ (continuity), lower pressure', [0, 0, 0.3]));
  labels.push(L('Manometer (U-tube)', 'Measures pressure difference P₁ − P₂ = ρ_m g h', [-1.0, -2.5, 0]));
  labels.push(L('Height difference h', 'Liquid rises on the low-pressure side', [0.3, -1.3, 0.1]));
  labels.push(L('Bernoulli: P₁ − P₂ = ½ρ(v₂² − v₁²)', 'Gives flow speed v₁ = √[2ρ_m g h / ρ((A₁/A₂)² − 1)]', [2.0, -1.0, 0]));
  labels.push(L('Applications', 'Carburettor, atomiser/spray gun, Bunsen burner, filter pump', [2.0, 1.2, 0]));
  return { g, labels, note: 'Venturimeter: measures flow speed of incompressible fluid using Bernoulli\'s principle and continuity equation.' };
}
reg(Object.assign({}, PH, {
  id: 'p11-8-2', cls: 11, unit: UM, ch: 'Ch 9 — Mechanical Properties of Fluids', fig: 'Fluid flow', title: 'Streamline vs turbulent flow & Venturimeter',
  desc: 'In steady (streamline) flow each fluid particle follows the same path as the preceding one; above a critical speed flow becomes turbulent with eddies. The Venturimeter uses Bernoulli\'s principle: pressure falls where speed rises at a constriction.',
  points: ['Reynolds number Re = ρvd/η: < 1000 laminar; > 2000 turbulent; 1000–2000 unsteady.', 'Continuity: A₁v₁ = A₂v₂. Bernoulli: P + ½ρv² + ρgh = constant (non-viscous, incompressible, steady).', 'Venturimeter: v₁ = √[2ρ_m g h / ρ((A₁/A₂)² − 1)].', 'Dynamic lift of aircraft wing, Magnus effect, and spinning ball also follow from Bernoulli.'],
  variants: [{ name: 'Streamline flow', build: () => fluid('stream') }, { name: 'Turbulent flow', build: () => fluid('turb') }, { name: 'Venturimeter', build: () => fluid('venturi') }]
}));

/* ---------- Ch 11/12 Thermodynamics ---------- */
reg(Object.assign({}, PH, {
  id: 'p11-11-1', cls: 11, unit: UM, ch: 'Ch 12 — Thermodynamics', fig: 'P–V indicator diagrams', title: 'P–V diagrams: isothermal, isobaric, isochoric, adiabatic',
  desc: 'Indicator (P–V) diagrams show quasi-static processes: isothermal (PV = const, hyperbola), isobaric (horizontal), isochoric (vertical), adiabatic (PV^γ = const, steeper than isothermal). Area under the curve = work done by the gas.',
  points: ['Isothermal: ΔU = 0, Q = W = nRT ln(V₂/V₁).', 'Adiabatic: Q = 0, W = (P₁V₁ − P₂V₂)/(γ − 1); temperature changes.', 'Isochoric: W = 0, Q = ΔU. Isobaric: W = PΔV, Q = nC_pΔT.', 'Adiabatic curve is steeper: slope = γ × isothermal slope at the same point.'],
  build() {
    const g = H.grp(), labels = [];
    const P0 = 8, V0 = 2, gam = 1.4;
    const G = H.graph({ w: 4.8, h: 3.2, xr: [0, 10], yr: [0, 10], xl: 'Volume V', yl: 'Pressure P', nx: 5, ny: 5,
      curves: [{ f: v => P0 * V0 / v, color: C.green, r: 0.035, dom: [1.6, 10], label: 'isothermal' }, { f: v => P0 * Math.pow(V0 / v, gam), color: C.red, r: 0.035, dom: [1.6, 10], label: 'adiabatic' }, { f: v => P0, color: C.orange, r: 0.035, dom: [2, 8], label: 'isobaric' }, { pts: [[2, 8], [2, 1]], color: C.purple, r: 0.035, label: 'isochoric' }],
      marks: [{ x: 2, y: 8, color: C.white, label: '(P₁,V₁)', dx: 0.35, dy: 0.35 }] });
    g.add(G);
    labels.push(L('Isothermal (T constant)', 'PV = constant — rectangular hyperbola', G.map(5, P0 * V0 / 5)));
    labels.push(L('Adiabatic (Q = 0)', 'PV^γ = constant — steeper than isothermal; falls faster', G.map(4, P0 * Math.pow(V0 / 4, gam))));
    labels.push(L('Isobaric (P constant)', 'Horizontal line; W = PΔV', G.map(6, P0)));
    labels.push(L('Isochoric (V constant)', 'Vertical line; no work done', G.map(2, 4)));
    labels.push(L('Common starting state', 'Same P₁, V₁ for all four processes', G.map(2, 8)));
    labels.push(L('Area under curve = work', 'Work by gas in expansion (positive)', G.map(8, 0.6)));
    return { g, labels };
  }
}));

reg(Object.assign({}, PH, {
  id: 'p11-11-2', cls: 11, unit: UM, ch: 'Ch 12 — Thermodynamics', fig: 'Carnot cycle', title: 'Carnot cycle (P–V loop)',
  desc: 'A reversible cycle of an ideal gas between two reservoirs T₁ (hot) and T₂ (cold): isothermal expansion A→B at T₁ (absorbs Q₁), adiabatic expansion B→C (T₁→T₂), isothermal compression C→D at T₂ (rejects Q₂), adiabatic compression D→A. Efficiency η = 1 − T₂/T₁.',
  points: ['Work per cycle = area enclosed ABCD = Q₁ − Q₂.', 'η = 1 − Q₂/Q₁ = 1 − T₂/T₁ — independent of working substance (Carnot\'s theorem: no engine can beat it).', 'Q₁ = nRT₁ ln(V₂/V₁); Q₂ = nRT₂ ln(V₃/V₄); V₂/V₁ = V₃/V₄.', 'Reversed Carnot cycle = ideal refrigerator; coefficient of performance α = T₂/(T₁ − T₂).'],
  build() {
    const g = H.grp(), labels = [];
    const T1 = 20, T2 = 11, gam = 1.4;
    const VA = 1.5, VB = 3.5; const PA = T1 / VA, PB = T1 / VB; const VC = VB * Math.pow(T1 / T2, 1 / (gam - 1)); const VD = VA * Math.pow(T1 / T2, 1 / (gam - 1)); const PC = T2 / VC, PD = T2 / VD;
    const iso = (T, v0, v1) => { const p = []; for (let i = 0; i <= 30; i++) { const v = v0 + (v1 - v0) * i / 30; p.push([v, T / v]); } return p; };
    const adia = (v0, v1, p0) => { const p = []; for (let i = 0; i <= 30; i++) { const v = v0 + (v1 - v0) * i / 30; p.push([v, p0 * Math.pow(v0 / v, gam)]); } return p; };
    const AB = iso(T1, VA, VB), BC = adia(VB, VC, PB), CD = iso(T2, VC, VD), DA = adia(VD, VA, PD);
    const G = H.graph({ w: 4.8, h: 3.2, xr: [0, VC + 1], yr: [0, PA + 2], xl: 'Volume V', yl: 'Pressure P', nx: 5, ny: 5,
      curves: [{ pts: AB, color: C.red, r: 0.04 }, { pts: BC, color: C.orange, r: 0.04 }, { pts: CD, color: C.blue, r: 0.04 }, { pts: DA, color: C.purple, r: 0.04 }],
      marks: [{ x: VA, y: PA, label: 'A', dx: -0.25, dy: 0.2 }, { x: VB, y: PB, label: 'B', dx: 0.25, dy: 0.2 }, { x: VC, y: PC, label: 'C', dx: 0.25, dy: 0.1 }, { x: VD, y: PD, label: 'D', dx: -0.25, dy: -0.2 }] });
    g.add(G);
    const poly = AB.concat(BC, CD, DA).map(p => { const m = G.map(p[0], p[1]); return [m[0], m[1]]; }); g.add(H.extrude(poly, 0.02, C.yellow, [0, 0, 0.03], null, { op: 0.18 }));
    const dir = (pts, col) => { const i = 15; const a = G.map(pts[i][0], pts[i][1], 0.09), b = G.map(pts[i + 2][0], pts[i + 2][1], 0.09); g.add(H.arrow(a, b, col, { r: 0.02, head: 0.16 })); };
    dir(AB, C.red); dir(BC, C.orange); dir(CD, C.blue); dir(DA, C.purple);
    g.add(H.text('W = area ABCD', { size: 0.16, pos: G.map(4.5, 4.2, 0.1), color: C.yellow }));
    labels.push(L('A→B: isothermal expansion at T₁', 'Gas absorbs heat Q₁ from hot reservoir; W₁ = nRT₁ ln(V_B/V_A)', G.map(AB[15][0], AB[15][1])));
    labels.push(L('B→C: adiabatic expansion', 'No heat exchange; temperature falls T₁ → T₂', G.map(BC[15][0], BC[15][1])));
    labels.push(L('C→D: isothermal compression at T₂', 'Gas rejects heat Q₂ to cold reservoir', G.map(CD[15][0], CD[15][1])));
    labels.push(L('D→A: adiabatic compression', 'Temperature rises T₂ → T₁; cycle closes', G.map(DA[15][0], DA[15][1])));
    labels.push(L('Enclosed area = net work W = Q₁ − Q₂', 'Efficiency η = W/Q₁ = 1 − T₂/T₁', G.map(4.5, 4.2)));
    labels.push(L('State A (V₁, P₁, T₁)', 'Start of cycle', G.map(VA, PA)));
    return { g, labels };
  }
}));

/* ---------- Class 12 Ch 1 Electric charges ---------- */
function fieldLines(kind) {
  const g = H.grp(), labels = [];
  const charge = (p, pos, col) => { g.add(H.sphere(0.28, col, p, { e: 0.6 })); g.add(H.text(pos ? '+' : '−', { size: 0.38, bold: true, pos: [p[0], p[1], p[2] + 0.3], top: true, color: '#111' })); };
  const lineFrom = (start, charges, steps = 140, ds = 0.06, reverse = false) => { const pts = [start.slice()]; let p = V3(...start); for (let s = 0; s < steps; s++) { const E = V3(); for (const c of charges) { const r = p.clone().sub(V3(...c.p)); const d = r.length(); if (d < 0.32) return pts; E.add(r.multiplyScalar(c.q / (d * d * d))); } if (E.length() < 1e-6) break; E.normalize().multiplyScalar(ds * (reverse ? -1 : 1)); p.add(E); if (p.length() > 4.2) break; pts.push(p.toArray()); } return pts; };
  const draw = (charges, nLines = 16, arrowsOut = true) => { charges.forEach(c => { if ((c.q > 0) !== arrowsOut) return; for (let i = 0; i < nLines; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * (i + 0.5) / nLines); const d = V3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); const start = V3(...c.p).add(d.multiplyScalar(0.34)).toArray(); const pts = lineFrom(start, charges, 140, 0.06, c.q < 0); if (pts.length > 3) { g.add(H.tube(pts, 0.028, C.cyan, { seg: pts.length, tension: 0, e: 0.6 })); const k = Math.min(pts.length - 2, Math.floor(pts.length * 0.55)); const A = V3(...pts[k]), B = V3(...pts[k + 1]); const cone = H.cone(0.06, 0.16, C.cyan, null, null, { seg: 8 }); cone.position.copy(A); cone.quaternion.setFromUnitVectors(V3(0, 1, 0), (c.q < 0 ? A.clone().sub(B) : B.clone().sub(A)).normalize()); g.add(cone); } } }); };
  if (kind === 'pos') { charge([0, 0, 0], true, C.red); draw([{ p: [0, 0, 0], q: 1 }], 20); labels.push(L('Positive point charge', 'Field lines start on + charge and go radially OUTWARD to infinity', [0, 0, 0])); labels.push(L('Radial field lines', 'E = kq/r² directed away from charge', [0, 2.2, 0])); labels.push(L('Density of lines ∝ field strength', 'Lines crowd near the charge', [1.5, -1.5, 0])); }
  if (kind === 'neg') { charge([0, 0, 0], false, C.blue); draw([{ p: [0, 0, 0], q: -1 }], 20, false); labels.push(L('Negative point charge', 'Field lines come radially INWARD from infinity and end on − charge', [0, 0, 0])); labels.push(L('Arrows point toward the charge', 'Direction of force on a positive test charge', [0, 2.2, 0])); }
  if (kind === 'dipole') { charge([-1.3, 0, 0], true, C.red); charge([1.3, 0, 0], false, C.blue); draw([{ p: [-1.3, 0, 0], q: 1 }, { p: [1.3, 0, 0], q: -1 }], 18); g.add(H.arrow([1.3, -2.6, 0], [-1.3, -2.6, 0], C.yellow, { r: 0.02, head: 0.15 })); g.add(H.text('dipole moment p (− → +)', { size: 0.14, pos: [0, -2.9, 0], color: C.yellow })); labels.push(L('Positive charge (+q)', 'Lines emerge', [-1.3, 0, 0])); labels.push(L('Negative charge (−q)', 'Lines terminate', [1.3, 0, 0])); labels.push(L('Curved lines from + to −', 'Field of an electric dipole; strongest between charges', [0, 1.0, 0])); labels.push(L('Dipole moment p = q × 2a', 'Direction from −q to +q; E on axis = 2kp/r³, equatorial = kp/r³', [0, -2.9, 0])); labels.push(L('Lines never cross', 'Field has a unique direction at each point', [0, -1.6, 0])); }
  if (kind === 'like') { charge([-1.4, 0, 0], true, C.red); charge([1.4, 0, 0], true, C.red); draw([{ p: [-1.4, 0, 0], q: 1 }, { p: [1.4, 0, 0], q: 1 }], 18); g.add(H.sphere(0.07, C.yellow, [0, 0, 0], { e: 1 })); g.add(H.text('N', { size: 0.18, pos: [0, 0.3, 0], color: C.yellow })); labels.push(L('Two like (positive) charges', 'Lines repel each other', [-1.4, 0, 0])); labels.push(L('Neutral point N', 'Midpoint where E = 0 (fields cancel)', [0, 0, 0])); labels.push(L('Lines bend away', 'No line connects the two charges', [0, 1.8, 0])); labels.push(L('Field lines leave toward infinity', 'Net charge positive', [1.4, 0, 0])); }
  return { g, labels };
}
reg(Object.assign({}, PH, {
  id: 'p12-1-1', cls: 12, unit: UE, ch: 'Ch 1 — Electric Charges and Fields', fig: 'Electric field lines', title: 'Electric field lines',
  desc: 'Field lines are continuous curves whose tangent gives the field direction. They start on positive charges and end on negative charges (or at infinity), never cross, and never form closed loops in electrostatics. Their density measures field strength.',
  points: ['Single +q: radially outward; −q: radially inward.', 'Dipole: curved lines from +q to −q; two like charges: neutral point at the midpoint.', 'Lines are continuous in charge-free regions; do not cross; electrostatic field lines do not form closed loops.', 'E of dipole on axis: 2p/(4πε₀r³); on equatorial line: −p/(4πε₀r³).'],
  variants: [{ name: '+q', build: () => fieldLines('pos') }, { name: '−q', build: () => fieldLines('neg') }, { name: 'Dipole', build: () => fieldLines('dipole') }, { name: 'Two like charges', build: () => fieldLines('like') }]
}));

/* ---------- Ch 2 Potential & Capacitance ---------- */
function equipot(kind) {
  const g = H.grp(), labels = [];
  if (kind === 'uniform') {
    for (let i = -2; i <= 2; i++) g.add(H.plane(2.6, 2.6, C.purple, [i * 1.0, 0, 0], [0, PI / 2, 0], { op: 0.3 }));
    for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) g.add(H.arrow([-2.8, k * 0.9, m * 0.9], [2.8, k * 0.9, m * 0.9], C.cyan, { r: 0.015, head: 0.15 }));
    g.add(H.text('E', { size: 0.24, bold: true, pos: [3.0, 1.2, 0], color: C.cyan }));
    labels.push(L('Equipotential surfaces (planes)', 'Perpendicular to E; equally spaced for uniform field', [-1.0, 1.3, 0]));
    labels.push(L('Uniform electric field E', 'Parallel field lines along +x', [2.8, 0.9, 0.9]));
    labels.push(L('Potential decreases along E', 'V₁ > V₂ > V₃ …; E = −dV/dr', [2.0, -1.3, 0]));
    labels.push(L('No work along a surface', 'W = qΔV = 0 moving a charge on the same surface', [0, -1.3, 0]));
    return { g, labels, note: 'Uniform field: equipotentials are parallel planes perpendicular to the field; spacing ΔV/E constant.' };
  }
  if (kind === 'point') {
    g.add(H.sphere(0.25, C.red, [0, 0, 0], { e: 0.6 })); g.add(H.text('+q', { size: 0.2, pos: [0, 0.45, 0], top: true }));
    [0.7, 1.15, 1.7, 2.4].forEach((r, i) => g.add(H.sphere(r, C.purple, [0, 0, 0], { op: 0.18 - i * 0.03, side: THREE.DoubleSide, dw: false })));
    for (let i = 0; i < 12; i++) { const a = i * 2.39, b = Math.acos(1 - 2 * (i + 0.5) / 12); const d = V3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); g.add(H.arrow(d.clone().multiplyScalar(0.3).toArray(), d.clone().multiplyScalar(2.8).toArray(), C.cyan, { r: 0.012, head: 0.14 })); }
    labels.push(L('Point charge', 'V = q/(4πε₀r)', [0, 0, 0]));
    labels.push(L('Concentric spherical equipotentials', 'Same V at same r', [0, 1.7, 0]));
    labels.push(L('Spacing increases outward', 'E weakens as 1/r²; equal ΔV needs larger Δr', [0, -2.4, 0]));
    labels.push(L('Field lines radial — perpendicular to surfaces', 'E always normal to equipotential', [2.0, 1.4, 0.8]));
    return { g, labels, note: 'Point charge: equipotentials are concentric spheres; field lines radial and normal to them; surfaces get farther apart with distance.' };
  }
  // dipole
  g.add(H.sphere(0.22, C.red, [-1.2, 0, 0], { e: 0.6 })); g.add(H.sphere(0.22, C.blue, [1.2, 0, 0], { e: 0.6 }));
  g.add(H.text('+q', { size: 0.18, pos: [-1.2, 0.4, 0], top: true })); g.add(H.text('−q', { size: 0.18, pos: [1.2, 0.4, 0], top: true }));
  const rings = [0.45, 0.8, 1.3]; rings.forEach((r, i) => { g.add(H.sphere(r, C.red, [-1.2 - i * 0.15, 0, 0], { op: 0.15, side: THREE.DoubleSide, dw: false })); g.add(H.sphere(r, C.blue, [1.2 + i * 0.15, 0, 0], { op: 0.15, side: THREE.DoubleSide, dw: false })); });
  g.add(H.plane(3.2, 3.2, C.purple, [0, 0, 0], [0, PI / 2, 0], { op: 0.35 }));
  // few field lines
  for (let i = -2; i <= 2; i++) { const pts = []; for (let k = 0; k <= 20; k++) { const t = -1 + k / 10; pts.push([t * 1.2, i * 0.55 * (1 - t * t) * 1.6, 0]); } g.add(H.tube(pts, 0.012, C.cyan, { seg: 30 })); }
  labels.push(L('Dipole: +q and −q', 'Equipotentials are closed surfaces around each charge', [-1.2, 0, 0]));
  labels.push(L('Zero-potential plane', 'Perpendicular bisector: V = 0 everywhere (equidistant from ±q)', [0, 1.4, 0]));
  labels.push(L('Surfaces around +q (V > 0)', 'Distorted spheres', [-1.2, 1.3, 0]));
  labels.push(L('Surfaces around −q (V < 0)', 'Mirror image, negative potential', [1.2, -1.3, 0]));
  labels.push(L('Field lines cross surfaces at 90°', 'From + to −', [0, 0.8, 0]));
  return { g, labels, note: 'Dipole equipotentials: closed surfaces around each charge; the perpendicular bisector plane is at zero potential.' };
}
reg(Object.assign({}, PH, {
  id: 'p12-2-1', cls: 12, unit: UE, ch: 'Ch 2 — Electrostatic Potential and Capacitance', fig: 'Equipotential surfaces', title: 'Equipotential surfaces',
  desc: 'An equipotential surface has the same potential at every point. The electric field is always perpendicular to it and no work is done moving a charge along it. Surfaces are closer where the field is stronger.',
  points: ['Point charge: concentric spheres. Uniform field: parallel planes normal to E. Dipole: closed surfaces + zero-potential bisector plane.', 'E = −dV/dr: field points in direction of steepest decrease of V.', 'Two equipotential surfaces never intersect.', 'Conductor surface is an equipotential in electrostatics; E inside = 0.'],
  variants: [{ name: 'Uniform field', build: () => equipot('uniform') }, { name: 'Point charge', build: () => equipot('point') }, { name: 'Dipole', build: () => equipot('dipole') }]
}));

function dielectric(polar) {
  const g = H.grp(), labels = [];
  g.add(H.box(0.15, 3.0, 2.2, C.grey, [-2.4, 0, 0])); g.add(H.box(0.15, 3.0, 2.2, C.grey, [2.4, 0, 0]));
  g.add(H.text('+', { size: 0.4, bold: true, pos: [-2.4, 1.75, 0] })); g.add(H.text('−', { size: 0.4, bold: true, pos: [2.4, 1.75, 0] }));
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) g.add(H.arrow([-2.2, i * 0.9, k * 0.8], [2.2, i * 0.9, k * 0.8], C.cyan, { r: 0.008, head: 0.1, op: 0.3 }));
  g.add(H.box(3.6, 2.6, 1.8, C.purple, [0, 0, 0], null, { op: 0.1, dw: false }));
  const mols = [];
  const rng = H.rng(12);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) for (let m = 0; m < 2; m++) { const p = [-1.2 + k * 0.8, -0.8 + i * 0.8, -0.45 + m * 0.9]; const mg = H.grp([], p); if (polar) { mg.add(H.sphere(0.13, C.red, [0.18, 0, 0])); mg.add(H.sphere(0.13, C.blue, [-0.18, 0, 0])); mg.add(H.rod([-0.18, 0, 0], [0.18, 0, 0], 0.05, C.grey)); mg.userData.a0 = rng() * TAU; mg.userData.b0 = rng() * TAU; mg.rotation.set(0, mg.userData.b0, mg.userData.a0); } else { mg.add(H.sphere(0.2, C.teal, [0, 0, 0], { op: 0.5 })); const plus = H.sphere(0.08, C.red, [0, 0, 0], { e: 0.8 }); const minus = H.sphere(0.12, C.blue, [0, 0, 0], { op: 0.7 }); mg.add(plus); mg.add(minus); mg.userData.plus = plus; mg.userData.minus = minus; } g.add(mg); mols.push(mg); }
  // induced surface charges (appear with field)
  const ind = []; for (let i = -1; i <= 1; i++) { const a = H.text('−', { size: 0.3, bold: true, pos: [-1.85, i * 0.8, 0], color: C.blue }); const b = H.text('+', { size: 0.3, bold: true, pos: [1.85, i * 0.8, 0], color: C.red }); a.visible = b.visible = false; g.add(a); g.add(b); ind.push(a, b); }
  const slide = t => { mols.forEach(m => { if (polar) { m.rotation.set(0, m.userData.b0 * (1 - t), m.userData.a0 * (1 - t) + PI * 0 ); if (t > 0.98) m.rotation.set(0, 0, 0); } else { m.userData.plus.position.x = -0.12 * t; m.userData.minus.position.x = 0.12 * t; } }); ind.forEach(x => x.visible = t > 0.6); };
  labels.push(L('Capacitor plates (+ and −)', 'Applied field E₀ from + to −', [-2.4, 0, 1.1]));
  labels.push(L(polar ? 'Polar molecules (permanent dipoles)' : 'Non-polar molecules (no permanent dipole)', polar ? 'Randomly oriented without field (thermal agitation)' : 'Centres of + and − charge coincide without field', [-1.2, 0.8, 0.45]));
  labels.push(L(polar ? 'Alignment with field' : 'Induced dipoles', polar ? 'Slider: dipoles align along E → net polarisation' : 'Slider: field displaces charges → induced dipole moment along E', [0.4, 0, 0.45]));
  labels.push(L('Induced surface charges', 'Opposite to plate charges → reduce net field E = E₀/K', [-1.85, 0, 0]));
  labels.push(L('Dielectric constant K', 'C = K C₀; polarisation P = χ ε₀ E', [1.85, 0, 0]));
  labels.push(L('Applied field E₀', 'Between the plates', [2.2, 0.9, 0.8]));
  return { g, labels, slide };
}
reg(Object.assign({}, PH, {
  id: 'p12-2-2', cls: 12, unit: UE, ch: 'Ch 2 — Electrostatic Potential and Capacitance', fig: 'Dielectrics', title: 'Dielectrics in a capacitor: polar vs non-polar',
  desc: 'A dielectric in an electric field becomes polarised: non-polar molecules acquire induced dipole moments; polar molecules (already dipoles) align with the field. The induced surface charges produce a field opposing E₀, reducing the net field to E₀/K and increasing capacitance to KC₀.',
  points: ['Non-polar: H₂, O₂, N₂, CO₂ (centres of charge coincide). Polar: H₂O, HCl, NH₃ (permanent dipoles).', 'Polarisation P = χ_e ε₀ E; K = 1 + χ_e.', 'With dielectric: C = K ε₀ A/d; E = E₀/K; V = V₀/K (battery removed); energy decreases.', 'Dielectric strength: max field before breakdown (~3 × 10⁶ V/m for air).'],
  variants: [{ name: 'Polar molecules', slide: 'Apply field', build: () => dielectric(true) }, { name: 'Non-polar molecules', slide: 'Apply field', build: () => dielectric(false) }]
}));

/* ---------- Ch 3 Current Electricity ---------- */
function resistor(a, b, col = C.amber, label) { const g = H.grp(); a = vec(a); b = vec(b); const d = b.clone().sub(a); const m = a.clone().add(b).multiplyScalar(0.5); const box = H.box(d.length() * 0.45, 0.22, 0.22, col, null, null, { e: 0.4 }); box.position.copy(m); box.quaternion.setFromUnitVectors(V3(1, 0, 0), d.clone().normalize()); g.add(box); g.add(H.rod(a, m.clone().sub(d.clone().multiplyScalar(0.225)), 0.02, C.white)); g.add(H.rod(m.clone().add(d.clone().multiplyScalar(0.225)), b, 0.02, C.white)); if (label) g.add(H.text(label, { size: 0.2, bold: true, pos: [m.x, m.y + 0.32, m.z + 0.1] })); return g; }
function galv(p, txt = 'G') { const g = H.grp(); g.add(H.torus(0.3, 0.03, C.white, p)); g.add(H.disc(0.28, C.ink, p, null, { op: 0.6 })); g.add(H.text(txt, { size: 0.3, bold: true, pos: [p[0], p[1], p[2] + 0.05] })); return g; }
function battery(p, horizontal = true) { const g = H.grp(); if (horizontal) { g.add(H.box(0.06, 0.6, 0.25, C.white, [p[0] - 0.08, p[1], p[2]])); g.add(H.box(0.06, 0.35, 0.25, C.white, [p[0] + 0.08, p[1], p[2]])); } else { g.add(H.box(0.6, 0.06, 0.25, C.white, [p[0], p[1] + 0.08, p[2]])); g.add(H.box(0.35, 0.06, 0.25, C.white, [p[0], p[1] - 0.08, p[2]])); } return g; }
function wheatstone() {
  const g = H.grp(), labels = [];
  const A = [-2.2, 0, 0], B = [0, 1.6, 0], C_ = [2.2, 0, 0], D = [0, -1.6, 0];
  g.add(resistor(A, B, C.amber, 'P')); g.add(resistor(B, C_, C.orange, 'Q')); g.add(resistor(A, D, C.teal, 'R')); g.add(resistor(D, C_, C.green, 'S'));
  g.add(H.rod(B, [0, 0.35, 0], 0.02, C.white)); g.add(H.rod([0, -0.35, 0], D, 0.02, C.white)); g.add(galv([0, 0, 0]));
  g.add(H.tube([A, [-2.2, -2.6, 0], [-0.4, -2.6, 0]], 0.02, C.white)); g.add(H.tube([[0.4, -2.6, 0], [2.2, -2.6, 0], C_], 0.02, C.white)); g.add(battery([0, -2.6, 0])); g.add(H.text('ε', { size: 0.2, pos: [0, -3.0, 0] }));
  [A, B, C_, D].forEach((p, i) => { g.add(H.sphere(0.07, C.yellow, p, { e: 0.9 })); g.add(H.text('ABCD'[i], { size: 0.2, pos: [p[0] + (i === 0 ? -0.3 : i === 2 ? 0.3 : 0), p[1] + (i === 1 ? 0.3 : i === 3 ? -0.3 : 0), 0], color: C.yellow })); });
  g.add(H.arrow([-2.0, -2.3, 0.1], [-1.0, -2.3, 0.1], C.cyan, { r: 0.012, head: 0.1 })); g.add(H.text('I', { size: 0.16, pos: [-1.5, -2.1, 0.1], color: C.cyan }));
  g.add(H.text('I₁', { size: 0.15, pos: [-1.5, 1.1, 0.1], color: C.cyan })); g.add(H.text('I₂', { size: 0.15, pos: [-1.5, -1.1, 0.1], color: C.cyan }));
  g.add(H.text('Balance: P/Q = R/S', { size: 0.2, bold: true, pos: [0, 2.3, 0], color: C.yellow }));
  labels.push(L('P and Q (ratio arms)', 'Known resistances', [-1.1, 0.8, 0]));
  labels.push(L('R (known / variable)', 'Adjusted to obtain balance', [-1.1, -0.8, 0]));
  labels.push(L('S (unknown)', 'S = R Q / P at balance', [1.1, -0.8, 0]));
  labels.push(L('Galvanometer G', 'Between B and D; reads zero at balance → V_B = V_D', [0, 0, 0]));
  labels.push(L('Battery ε across A and C', 'Drives current I which splits into I₁ (ABC) and I₂ (ADC)', [0, -2.6, 0]));
  labels.push(L('Balance condition', 'I_g = 0 ⇒ P/Q = R/S (Kirchhoff\'s rules)', [0, 2.3, 0]));
  return { g, labels, note: 'Wheatstone bridge: four resistances in a quadrilateral; at balance no current through galvanometer and P/Q = R/S — used to measure unknown resistance.' };
}
function meterBridge() {
  const g = H.grp(), labels = [];
  g.add(H.box(6.4, 0.2, 1.4, C.brown, [0, -0.6, 0], null, { op: 0.8 }));
  g.add(H.rod([-3, -0.45, 0.3], [3, -0.45, 0.3], 0.02, C.amber, { e: 0.6 }));
  for (let i = 0; i <= 10; i++) { g.add(H.line([[-3 + i * 0.6, -0.45, 0.42], [-3 + i * 0.6, -0.45, 0.55]], C.white)); g.add(H.text(String(i * 10), { size: 0.11, pos: [-3 + i * 0.6, -0.45, 0.72], color: C.grey })); }
  g.add(H.box(0.4, 0.12, 0.5, C.grey, [-3, -0.4, 0])); g.add(H.box(0.4, 0.12, 0.5, C.grey, [3, -0.4, 0])); g.add(H.box(2.4, 0.12, 0.5, C.grey, [0, -0.4, -0.3]));
  g.add(resistor([-2.6, 0.2, -0.3], [-1.2, 0.2, -0.3], C.teal, 'R')); g.add(resistor([1.2, 0.2, -0.3], [2.6, 0.2, -0.3], C.green, 'S'));
  g.add(H.rod([-2.6, 0.2, -0.3], [-3, -0.35, 0], 0.02, C.white)); g.add(H.rod([-1.2, 0.2, -0.3], [-1.0, -0.35, -0.3], 0.02, C.white)); g.add(H.rod([1.2, 0.2, -0.3], [1.0, -0.35, -0.3], 0.02, C.white)); g.add(H.rod([2.6, 0.2, -0.3], [3, -0.35, 0], 0.02, C.white));
  g.add(galv([0, 1.4, -0.3])); g.add(H.rod([0, -0.35, -0.3], [0, 1.1, -0.3], 0.02, C.white));
  g.add(H.tube([[0.3, 1.4, -0.3], [1.0, 1.4, -0.3], [1.0, 0.6, 0.3], [0.5, -0.1, 0.3]], 0.02, C.white)); g.add(H.cone(0.06, 0.5, C.white, [0.5, -0.2, 0.3], [PI, 0, 0], { seg: 8 }));
  g.add(H.tube([[-3, -0.7, 0], [-3, -1.6, 0], [-0.5, -1.6, 0]], 0.02, C.white)); g.add(H.tube([[0.5, -1.6, 0], [3, -1.6, 0], [3, -0.7, 0]], 0.02, C.white)); g.add(battery([0, -1.6, 0])); g.add(H.box(0.3, 0.15, 0.15, C.grey, [1.8, -1.6, 0])); g.add(H.text('K', { size: 0.14, pos: [1.8, -1.35, 0] }));
  g.add(H.text('l', { size: 0.2, pos: [-1.2, -0.9, 0.5], color: C.yellow })); g.add(H.text('100 − l', { size: 0.2, pos: [1.7, -0.9, 0.5], color: C.yellow }));
  g.add(H.text('S = R (100 − l) / l', { size: 0.2, bold: true, pos: [0, 2.2, 0], color: C.yellow }));
  labels.push(L('1 m uniform wire (manganin/constantan)', 'Stretched on a metre scale; resistance ∝ length', [-1.5, -0.45, 0.3]));
  labels.push(L('Known resistance R (resistance box)', 'In the left gap', [-1.9, 0.2, -0.3]));
  labels.push(L('Unknown resistance S', 'In the right gap', [1.9, 0.2, -0.3]));
  labels.push(L('Jockey', 'Slid along wire until galvanometer shows null', [0.5, -0.1, 0.3]));
  labels.push(L('Galvanometer', 'Zero deflection at balance point', [0, 1.4, -0.3]));
  labels.push(L('Balance length l', 'R/S = l/(100 − l) — Wheatstone principle', [-1.2, -0.9, 0.5]));
  labels.push(L('Battery & key', 'Across the ends of the wire', [0, -1.6, 0]));
  labels.push(L('Thick copper strips', 'Negligible resistance connecting gaps', [0, -0.4, -0.3]));
  return { g, labels, note: 'Metre bridge: practical Wheatstone bridge; R/S = l/(100 − l); most accurate when balance point is near the middle (50 cm).' };
}
function potentiometer() {
  const g = H.grp(), labels = [];
  g.add(H.box(6.4, 0.2, 1.4, C.brown, [0, -0.6, 0], null, { op: 0.8 }));
  g.add(H.rod([-3, -0.45, 0.3], [3, -0.45, 0.3], 0.02, C.amber, { e: 0.6 }));
  g.add(H.text('A', { size: 0.2, pos: [-3.2, -0.2, 0.3], color: C.yellow })); g.add(H.text('B', { size: 0.2, pos: [3.2, -0.2, 0.3], color: C.yellow }));
  g.add(H.tube([[-3, -0.45, 0.3], [-3, -1.6, 0.3], [-0.5, -1.6, 0.3]], 0.02, C.white)); g.add(H.tube([[0.5, -1.6, 0.3], [1.5, -1.6, 0.3]], 0.02, C.white)); g.add(resistor([1.5, -1.6, 0.3], [2.5, -1.6, 0.3], C.orange, 'Rh')); g.add(H.tube([[2.5, -1.6, 0.3], [3, -1.6, 0.3], [3, -0.45, 0.3]], 0.02, C.white)); g.add(battery([0, -1.6, 0.3])); g.add(H.text('driver cell ε (primary)', { size: 0.13, pos: [0, -2.0, 0.3], color: C.grey }));
  g.add(H.tube([[-3, -0.45, 0.3], [-3, 1.0, 0.3], [-0.6, 1.0, 0.3]], 0.02, C.white)); g.add(battery([-0.3, 1.0, 0.3])); g.add(H.text('ε₁ (test cell)', { size: 0.13, pos: [-0.3, 1.35, 0.3], color: C.grey }));
  g.add(H.tube([[0, 1.0, 0.3], [0.6, 1.0, 0.3]], 0.02, C.white)); g.add(galv([1.0, 1.0, 0.3])); g.add(H.tube([[1.3, 1.0, 0.3], [1.8, 1.0, 0.3], [1.8, 0.3, 0.3], [0.9, -0.15, 0.3]], 0.02, C.white)); g.add(H.cone(0.06, 0.45, C.white, [0.9, -0.22, 0.3], [PI, 0, 0], { seg: 8 }));
  g.add(H.text('l', { size: 0.2, pos: [-1.0, -0.9, 0.6], color: C.yellow })); g.add(H.line([[-3, -0.8, 0.6], [0.9, -0.8, 0.6]], C.yellow));
  g.add(H.text('ε₁ = φ l  (φ = potential gradient)', { size: 0.18, bold: true, pos: [0, 2.0, 0.3], color: C.yellow }));
  labels.push(L('Potentiometer wire AB (long, uniform)', 'Potential drops uniformly along it: φ = V_AB / L', [0, -0.45, 0.3]));
  labels.push(L('Driver (primary) circuit', 'Battery + rheostat + key maintain steady current in AB', [0, -1.6, 0.3]));
  labels.push(L('Rheostat', 'Adjusts potential gradient', [2.0, -1.6, 0.3]));
  labels.push(L('Cell under test ε₁', 'Positive terminal to A (same as driver)', [-0.3, 1.0, 0.3]));
  labels.push(L('Galvanometer', 'Null deflection when φ l = ε₁ — no current drawn from the cell', [1.0, 1.0, 0.3]));
  labels.push(L('Jockey at balance length l', 'ε₁/ε₂ = l₁/l₂ for comparing emfs', [0.9, -0.2, 0.3]));
  labels.push(L('Measures emf, not terminal voltage', 'Ideal voltmeter (infinite resistance); internal resistance r = R(l₁ − l₂)/l₂', [0, 2.0, 0.3]));
  return { g, labels, note: 'Potentiometer: null method — compares emfs (ε₁/ε₂ = l₁/l₂) and finds internal resistance without drawing current at balance.' };
}
reg(Object.assign({}, PH, {
  id: 'p12-3-1', cls: 12, unit: UE, ch: 'Ch 3 — Current Electricity', fig: 'Circuit setups', title: 'Wheatstone bridge, metre bridge & potentiometer',
  desc: 'Null-deflection circuits: the Wheatstone bridge balances four resistances (P/Q = R/S); the metre bridge is its practical form using a 1 m wire (R/S = l/(100 − l)); the potentiometer compares emfs without drawing current (ε₁/ε₂ = l₁/l₂).',
  points: ['Wheatstone balance derived from Kirchhoff\'s loop rule with I_g = 0.', 'Metre bridge error minimised when balance point is near 50 cm; end corrections.', 'Potentiometer sensitivity increases with longer wire / smaller potential gradient.', 'Internal resistance: r = R (l₁ − l₂)/l₂.'],
  variants: [{ name: 'Wheatstone bridge', build: wheatstone }, { name: 'Metre bridge', build: meterBridge }, { name: 'Potentiometer', build: potentiometer }]
}));


/* ================================================================
   7. APP — scene · projector · orbit · labels · UI
   ================================================================ */
(function App() {
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050a14, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050a14, 12, 26);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  let cam = camera;

  /* lights */
  scene.add(new THREE.HemisphereLight(0x9ecbff, 0x0b1220, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(3, 5, 4); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0x88aaff, 0.25); dir2.position.set(-4, -2, -3); scene.add(dir2);
  const beamLight = new THREE.PointLight(0x22d3ee, 0.55, 9, 2); beamLight.position.set(0, -2.3, 0); scene.add(beamLight);

  /* ---- projector volume ---- */
  const projector = new THREE.Group(); scene.add(projector);
  (function buildProjector() {
    const baseY = -2.9;
    projector.add(H.cyl(2.35, 2.55, 0.18, '#0b1a2b', [0, baseY - 0.1, 0], null, { seg: 64, e: 0.2 }));
    projector.add(H.ring(1.95, 2.25, '#0e2a44', [0, baseY, 0], [-PI / 2, 0, 0], { e: 0.5, op: 0.9 }));
    [0.9, 1.45, 1.9].forEach((r, i) => projector.add(H.torus(r, 0.02, '#22d3ee', [0, baseY + 0.01, 0], [PI / 2, 0, 0], { tseg: 96, e: 1.0, op: 0.55 - i * 0.12 })));
    projector.add(H.disc(0.9, '#22d3ee', [0, baseY + 0.005, 0], [-PI / 2, 0, 0], { e: 1.2, op: 0.18, dw: false }));
    const rot = H.grp(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; rot.add(H.box(0.28, 0.012, 0.04, '#38bdf8', [2.1 * Math.cos(a), baseY + 0.02, 2.1 * Math.sin(a)], [0, -a, 0], { e: 1.2, op: 0.8 })); } projector.add(rot); projector.userData.rot = rot;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.0, 6.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = baseY + 3.1; projector.add(beam);
    const grid = new THREE.GridHelper(14, 28, 0x13324d, 0x0d2238); grid.position.y = baseY - 0.2; grid.material.transparent = true; grid.material.opacity = 0.35; projector.add(grid);
    if (!REDUCED) {
      const N = 140, pos = new Float32Array(N * 3); const rng = H.rng(99);
      for (let i = 0; i < N; i++) { const r = rng() * 2.4, a = rng() * TAU; pos[i * 3] = r * Math.cos(a); pos[i * 3 + 1] = baseY + rng() * 5.6; pos[i * 3 + 2] = r * Math.sin(a); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: 0x67e8f9, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(pg, pm); projector.add(pts); projector.userData.pts = pts;
    }
  })();

  /* ---- state ---- */
  const S = {
    idx: 0, vidx: 0, root: null, g: null, labels: [], res: null, fig: null,
    theta: -0.55, phi: 1.12, radius: 6.6, target: new THREE.Vector3(),
    vtheta: 0, vphi: 0, autoRot: !REDUCED, labelsOn: true, mode2D: false, view: 'solid',
    explodeT: 0, explodeTarget: 0, slideT: 0, slideTarget: 0, dirty: true, quiz: false,
    modelRadius: 1.6, lastInteract: 0, panelOpen: window.innerWidth > 900, lastFrame: performance.now()
  };
  const ACC = { bio: '#4ade80', chem: '#f472b6', phy: '#60a5fa' };

  /* ---- layout helpers ---- */
  const isMobile = () => window.innerWidth < 760;
  const panelW = () => (S.panelOpen && !isMobile()) ? Math.min(380, window.innerWidth * 0.36) : 0;
  const sheetH = () => (S.panelOpen && isMobile()) ? Math.round(window.innerHeight * 0.46) : 0;
  const colWidth = () => { const W = window.innerWidth - panelW(); return W < 760 ? clamp(Math.round(W * 0.26), 92, 130) : W < 1100 ? 180 : 225; };
  const topPad = () => isMobile() ? 122 : 84;
  const RG = 64; // right gutter for the control column
  const bottomPad = () => sheetH() + (isMobile() ? 118 : 96);

  function resize() {
    const W = window.innerWidth, Hh = window.innerHeight;
    renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh; camera.updateProjectionMatrix();
    updateOrtho();
    applyViewOffset();
    $('leaders').setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    $('leaders').setAttribute('width', W); $('leaders').setAttribute('height', Hh);
    document.body.classList.toggle('mobile', isMobile());
    placeColumns(); measureLabels();
    S.dirty = true;
  }
  function applyViewOffset() {
    const W = window.innerWidth, Hh = window.innerHeight;
    const ox = -panelW() / 2, oy = sheetH() / 2;
    camera.setViewOffset(W, Hh, ox, oy, W, Hh); ortho.setViewOffset(W, Hh, ox, oy, W, Hh);
  }
  function updateOrtho() {
    const aspect = window.innerWidth / window.innerHeight;
    const hh = S.radius * Math.tan(deg(camera.fov / 2));
    ortho.left = -hh * aspect; ortho.right = hh * aspect; ortho.top = hh; ortho.bottom = -hh; ortho.updateProjectionMatrix();
  }
  function placeColumns() {
    const W = window.innerWidth, lw = colWidth(), pw = panelW();
    const l = $('lbl-left'), r = $('lbl-right');
    l.style.left = (pw + 12) + 'px'; l.style.width = lw + 'px';
    r.style.left = (W - RG - lw) + 'px'; r.style.width = lw + 'px';
  }

  /* ---- camera ---- */
  function updateCamera() {
    const sp = Math.sin(S.phi), r = S.radius;
    const p = new THREE.Vector3(r * sp * Math.sin(S.theta), r * Math.cos(S.phi), r * sp * Math.cos(S.theta)).add(S.target);
    camera.position.copy(p); camera.lookAt(S.target);
    ortho.position.copy(p); ortho.lookAt(S.target);
    if (S.mode2D) updateOrtho();
  }
  function resetView(anim) {
    const v = (S.fig && S.fig.view) || {};
    S.theta = v.theta ?? -0.55; S.phi = v.phi ?? 1.12; S.radius = (v.zoom ? 6.6 / v.zoom : 6.6);
    // zoom out so the model's projected diameter fits the free region between the label columns
    if (S.labelsOn) { const W = window.innerWidth, Hh = window.innerHeight, lw = colWidth(); const cw = W - panelW() - 2 * lw - 12 - RG + (isMobile() ? lw * 0.9 : 0); const halfH = Math.tan(deg(camera.fov / 2)); const needR = (2 * S.modelRadius / halfH) * (Hh / 2) / Math.max(140, cw - 24); const needV = (2 * S.modelRadius / halfH) * (Hh / 2) / Math.max(200, Hh - topPad() - bottomPad() + 40); S.radius = clamp(Math.max(S.radius, needR, needV), 2.2, 14); }
    if (S.mode2D) { S.theta = 0; S.phi = PI / 2; }
    S.target.set(0, 0, 0); S.vtheta = S.vphi = 0; S.dirty = true;
  }

  /* ---- orbit controls (pointer + touch + wheel) ---- */
  (function orbit() {
    const el = canvas; const ptrs = new Map(); let last = null, pinchD = 0, pinchMid = null, dragging = false;
    const speed = () => 0.0055;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; dragging = true; S.vtheta = S.vphi = 0; S.lastInteract = performance.now(); if (ptrs.size === 2) { const a = [...ptrs.values()]; pinchD = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); pinchMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; } closeSearch(); });
    el.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1 && dragging) { const dx = e.clientX - last.x, dy = e.clientY - last.y; if (S.mode2D) { pan(dx, dy); } else { S.theta -= dx * speed(); S.phi = clamp(S.phi - dy * speed(), 0.08, PI - 0.08); S.vtheta = -dx * speed(); S.vphi = -dy * speed(); } last = { x: e.clientX, y: e.clientY }; S.lastInteract = performance.now(); S.dirty = true; }
      else if (ptrs.size === 2) { const a = [...ptrs.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; if (pinchD > 0) zoomBy(pinchD / d); if (pinchMid) pan(mid.x - pinchMid.x, mid.y - pinchMid.y); pinchD = d; pinchMid = mid; S.lastInteract = performance.now(); S.dirty = true; }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) { pinchD = 0; pinchMid = null; } if (ptrs.size === 0) dragging = false; else { const a = [...ptrs.values()]; last = { x: a[0].x, y: a[0].y }; } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', e => { if (!e.buttons) up(e); });
    el.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp((e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY) * 0.0012); zoomBy(f); S.lastInteract = performance.now(); }, { passive: false });
    el.addEventListener('dblclick', () => resetView());
    el.addEventListener('contextmenu', e => e.preventDefault());
    function pan(dx, dy) { const scale = S.radius * 0.0016; const right = new THREE.Vector3(Math.cos(S.theta), 0, -Math.sin(S.theta)); const upv = new THREE.Vector3(0, 1, 0); S.target.addScaledVector(right, -dx * scale).addScaledVector(upv, dy * scale); S.dirty = true; }
  })();
  function zoomBy(f) { S.radius = clamp(S.radius * f, 2.2, 18); S.dirty = true; if (S.mode2D) updateOrtho(); }

  /* ---- figure loading ---- */
  function disposeCurrent() {
    if (S.root) { scene.remove(S.root); S.root.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); }
    H.disposeTemp(); S.root = S.g = null; S.labels = []; S.res = null;
    $('lbl-left').innerHTML = ''; $('lbl-right').innerHTML = ''; $('leaders').innerHTML = '';
    clearPulse();
  }
  function loadFigure(idx, vidx = 0, opts = {}) {
    idx = ((idx % FIGS.length) + FIGS.length) % FIGS.length;
    disposeCurrent(); H.begin();
    const fig = FIGS[idx], variant = fig.variants[vidx] || fig.variants[0];
    S.idx = idx; S.vidx = vidx; S.fig = fig; S.variant = variant;
    let res; try { res = variant.build(); } catch (err) { console.error('build failed', fig.id, err); res = { g: H.grp([H.text('Build error: ' + err.message, { size: 0.3, color: '#f87171' })]), labels: [] }; }
    S.res = res; S.g = res.g;
    // fit
    const box = new THREE.Box3().setFromObject(res.g); const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.001, Math.max(size.x, size.y, size.z) * 0.5, size.length() * 0.42);
    const s = 1.75 / r; S.modelRadius = r * s;
    const root = new THREE.Group(); root.scale.setScalar(s); root.position.copy(center).multiplyScalar(-s); root.add(res.g); scene.add(root); S.root = root;
    root.updateMatrixWorld(true);
    // explode metadata: attach labels to exploding parts
    const exParts = []; root.traverse(o => { if (o.userData.ex) { o.userData.base = o.userData.base || o.position.clone(); exParts.push(o); } });
    S.exParts = exParts; S.explodeT = S.explodeTarget = 0; S.slideT = S.slideTarget = 0;
    const tmpBox = new THREE.Box3();
    S.labels = (res.labels || []).map((lb, i) => {
      const o = Object.assign({}, lb); o.i = i; o.side = o.side || null; o.y = null; o.revealed = !S.quiz;
      if (Array.isArray(o.a) && exParts.length) { const wp = root.localToWorld(vec(o.a).clone()); for (const p of exParts) { tmpBox.setFromObject(p); tmpBox.expandByScalar(0.02); if (tmpBox.containsPoint(wp)) { o.part = p; o.local = p.worldToLocal(wp.clone()); break; } } }
      return o;
    });
    applyViewMode();
    if (!opts.keepView) resetView();
    buildLabelDom(); renderCard(); renderVariantBar(); updateNav(); updateSliderUI();
    if (!opts.noHash) { try { history.replaceState(null, '', '#' + fig.id + (vidx ? '/' + vidx : '')); } catch (e) { } }
    document.title = fig.title + ' · NEET Holo Diagrams';
    S.dirty = true;
  }

  /* ---- explode / slide ---- */
  function applyExplode(t) { for (const p of S.exParts) p.position.copy(p.userData.base).addScaledVector(p.userData.ex, t); }
  function hasSlider() { return !!(S.fig && (S.fig.explode || S.variant.slide || (S.res && S.res.slide))); }
  function updateSliderUI() {
    const wrap = $('sliderWrap'); if (!hasSlider()) { wrap.hidden = true; return; }
    wrap.hidden = false; $('sliderName').textContent = S.variant.slide || S.fig.slide || S.fig.explode || 'Explode'; $('slider').value = 0;
  }
  $('slider').addEventListener('input', e => { const t = +e.target.value / 100; if (S.exParts.length) S.explodeTarget = t; if (S.res && S.res.slide) S.slideTarget = t; S.dirty = true; });

  /* ---- view modes ---- */
  function applyViewMode() {
    if (!S.root) return;
    S.root.traverse(o => {
      if (!o.isMesh) return;
      if (!o.userData.orig) o.userData.orig = o.material;
      if (S.view === 'solid') o.material = o.userData.orig;
      else if (S.view === 'wire') { if (!o.userData.wireM) o.userData.wireM = new THREE.MeshBasicMaterial({ color: o.userData.orig.color || 0x22d3ee, wireframe: true, transparent: true, opacity: 0.7 }); o.material = o.userData.wireM; }
      else { if (!o.userData.xrayM) o.userData.xrayM = new THREE.MeshPhongMaterial({ color: o.userData.orig.color || 0x22d3ee, emissive: (o.userData.orig.color || new THREE.Color(0x22d3ee)), emissiveIntensity: 0.5, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }); o.material = o.userData.xrayM; }
    });
    $('viewBtn').textContent = S.view === 'solid' ? '◉' : S.view === 'wire' ? '◌' : '◎';
    $('viewBtn').title = 'View: ' + S.view + ' (click to change)';
    S.dirty = true;
  }

  /* ---- labels: DOM + leaders ---- */
  function buildLabelDom() {
    const L_ = $('lbl-left'), R_ = $('lbl-right'), svg = $('leaders');
    const acc = ACC[S.fig.sub];
    S.labels.forEach(lb => {
      const el = document.createElement('div'); el.className = 'lbl' + (S.quiz && !lb.revealed ? ' hidden-q' : ''); el.style.setProperty('--acc', acc);
      el.innerHTML = `<i>${lb.i + 1}</i><b></b><span></span>`; el.querySelector('b').textContent = S.quiz && !lb.revealed ? '?' : lb.t; el.querySelector('span').textContent = S.quiz && !lb.revealed ? 'tap to reveal' : lb.n;
      el.addEventListener('click', () => onLabelClick(lb));
      lb.el = el; L_.appendChild(el);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('stroke', acc); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.2'); svg.appendChild(path); lb.path = path;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '3.2'); dot.setAttribute('fill', acc); dot.setAttribute('stroke', '#050a14'); dot.setAttribute('stroke-width', '1'); svg.appendChild(dot); lb.dot = dot;
    });
    measureLabels();
  }
  function measureLabels() { const lw = colWidth(); S.labels.forEach(lb => { if (!lb.el) return; lb.el.style.width = lw + 'px'; lb.h = lb.el.offsetHeight || 40; }); }
  function anchorWorld(lb, out) {
    if (lb.part) return lb.part.localToWorld(out.copy(lb.local));
    if (lb.a && lb.a.isObject3D) return lb.a.getWorldPosition(out);
    return S.root.localToWorld(out.copy(vec(lb.a)));
  }
  const _v = new THREE.Vector3(), _c = new THREE.Vector3();
  function layoutCol(arr, top, bottom, gap) {
    arr.sort((a, b) => a.ty - b.ty);
    let y = top; for (const it of arr) { it.ly = Math.max(it.ty, y); y = it.ly + it.h + gap; }
    let b = bottom; for (let i = arr.length - 1; i >= 0; i--) { const it = arr[i]; if (it.ly + it.h > b) it.ly = Math.max(top, b - it.h); b = it.ly - gap; }
  }
  function updateLabels() {
    const W = window.innerWidth, Hh = window.innerHeight; let moving = false;
    if (!S.root || !S.labelsOn || !S.labels.length) return false;
    const lw = colWidth(), pw = panelW();
    const leftEdge = pw + 12 + lw, rightEdge = W - RG - lw, mid = (leftEdge + rightEdge) / 2;
    const top = topPad(), bottom = Hh - bottomPad();
    _c.set(0, 0, 0).applyMatrix4(cam.matrixWorldInverse); const cz = _c.z;
    for (const lb of S.labels) {
      anchorWorld(lb, _v); const vz = _v.clone().applyMatrix4(cam.matrixWorldInverse).z;
      lb.dim = vz < cz - 0.4 * S.modelRadius;
      _v.project(cam); lb.sx = (_v.x * 0.5 + 0.5) * W; lb.sy = (-_v.y * 0.5 + 0.5) * Hh; lb.off = _v.z > 1;
      const th = lb.thr ?? W * 0.07;
      if (lb.sideFixed) lb.side = lb.sideFixed; else if (lb.side == null) lb.side = lb.sx < mid ? 'L' : 'R'; else if (lb.side === 'L' && lb.sx > mid + th) { lb.side = 'R'; lb.thr = null; } else if (lb.side === 'R' && lb.sx < mid - th) { lb.side = 'L'; lb.thr = null; }
      if (lb.thr && ((lb.side === 'R' && lb.sx > mid) || (lb.side === 'L' && lb.sx < mid))) lb.thr = null;
      lb.ty = clamp(lb.sy - lb.h / 2, top, Math.max(top, bottom - lb.h));
    }
    // balance: if one column cannot fit its labels, hand the ones nearest the centre to the other column
    const avail = bottom - top, need = s => S.labels.filter(l => l.side === s).reduce((a, l) => a + l.h + 6, 0);
    for (const [from, to] of [['L', 'R'], ['R', 'L']]) { let nf = need(from), nt = need(to); let guard = 0; while (nf > avail && guard++ < 8) { const cand = S.labels.filter(l => l.side === from && !l.sideFixed).sort((x, y) => from === 'L' ? y.sx - x.sx : x.sx - y.sx)[0]; if (!cand || nt + cand.h + 6 > avail) break; cand.side = to; cand.thr = W * 0.6; nf -= cand.h + 6; nt += cand.h + 6; } }
    layoutCol(S.labels.filter(l => l.side === 'L'), top, bottom, 6); layoutCol(S.labels.filter(l => l.side === 'R'), top, bottom, 6);
    for (const lb of S.labels) {
      if (lb.y == null) lb.y = lb.ly; else { const d = lb.ly - lb.y; if (Math.abs(d) > 0.4) { lb.y += d * 0.3; moving = true; } else lb.y = lb.ly; }
      const el = lb.el; const isL = lb.side === 'L';
      if (lb.colSide !== lb.side) { (isL ? $('lbl-left') : $('lbl-right')).appendChild(el); lb.colSide = lb.side; }
      el.style.transform = `translate3d(0,${lb.y.toFixed(1)}px,0)`;
      el.classList.toggle('dim', lb.dim); el.classList.toggle('off', lb.off);
      const ly = lb.y + lb.h / 2; const ex = isL ? leftEdge : rightEdge; const kx = isL ? ex + 14 : ex - 14;
      lb.path.setAttribute('d', `M${ex.toFixed(1)} ${ly.toFixed(1)} L${kx.toFixed(1)} ${ly.toFixed(1)} L${lb.sx.toFixed(1)} ${lb.sy.toFixed(1)}`);
      lb.path.setAttribute('opacity', lb.off ? 0 : lb.dim ? 0.28 : 0.75); lb.path.setAttribute('stroke-dasharray', lb.dim ? '3 3' : '');
      lb.dot.setAttribute('cx', lb.sx.toFixed(1)); lb.dot.setAttribute('cy', lb.sy.toFixed(1)); lb.dot.setAttribute('opacity', lb.off ? 0 : lb.dim ? 0.35 : 1);
    }
    return moving;
  }
  function setLabelsVisible(on) { S.labelsOn = on; document.body.classList.toggle('nolabels', !on); $('lblBtn').classList.toggle('on', on); S.dirty = true; }

  /* ---- highlight pulse ---- */
  let pulse = null;
  function clearPulse() { if (pulse) { scene.remove(pulse.m); pulse.m.geometry.dispose(); pulse.m.material.dispose(); pulse = null; } }
  function pulseAt(lb) {
    clearPulse(); const p = anchorWorld(lb, new THREE.Vector3());
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: ACC[S.fig.sub], transparent: true, opacity: 0.9, depthTest: false }));
    m.position.copy(p); m.renderOrder = 999; scene.add(m); pulse = { m, t0: performance.now(), lb }; S.dirty = true;
  }
  function onLabelClick(lb) {
    if (S.quiz && !lb.revealed) { revealLabel(lb); }
    pulseAt(lb);
    const li = document.querySelector(`#labelList li[data-i="${lb.i}"]`); if (li) { document.querySelectorAll('#labelList li').forEach(x => x.classList.remove('active')); li.classList.add('active'); li.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }); }
  }
  function revealLabel(lb) { lb.revealed = true; if (lb.el) { lb.el.classList.remove('hidden-q'); lb.el.querySelector('b').textContent = lb.t; lb.el.querySelector('span').textContent = lb.n; measureLabels(); } const li = document.querySelector(`#labelList li[data-i="${lb.i}"]`); if (li) { li.classList.remove('hidden-q'); li.querySelector('b').textContent = lb.t; li.querySelector('span').textContent = lb.n; } updateQuizScore(); S.dirty = true; }
  function updateQuizScore() { const el = $('quizScore'); if (!S.quiz) { el.textContent = ''; return; } const n = S.labels.filter(l => l.revealed).length; el.textContent = `${n} / ${S.labels.length} revealed`; }

  /* ---- render loop ---- */
  let raf = null;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - S.lastFrame) / 1000); S.lastFrame = now;
    let render = S.dirty;
    // damping
    if (!S.mode2D && (Math.abs(S.vtheta) > 1e-4 || Math.abs(S.vphi) > 1e-4) && now - S.lastInteract > 30) { S.theta += S.vtheta; S.phi = clamp(S.phi + S.vphi, 0.08, PI - 0.08); S.vtheta *= 0.9; S.vphi *= 0.9; render = true; }
    if (S.autoRot && !S.mode2D && now - S.lastInteract > 1500) { S.theta += 0.0035 * (dt * 60); render = true; }
    if (Math.abs(S.explodeT - S.explodeTarget) > 0.002) { S.explodeT += (S.explodeTarget - S.explodeT) * (REDUCED ? 1 : 0.18); applyExplode(S.explodeT); render = true; } else if (S.explodeT !== S.explodeTarget) { S.explodeT = S.explodeTarget; applyExplode(S.explodeT); render = true; }
    if (S.res && S.res.slide) { if (Math.abs(S.slideT - S.slideTarget) > 0.002) { S.slideT += (S.slideTarget - S.slideT) * (REDUCED ? 1 : 0.18); S.res.slide(S.slideT); render = true; } else if (S.slideT !== S.slideTarget) { S.slideT = S.slideTarget; S.res.slide(S.slideT); render = true; } }
    if (S.res && S.res.tick && !REDUCED) { S.res.tick(dt, now / 1000); render = true; }
    if (!REDUCED) { projector.userData.rot.rotation.y += 0.0025 * (dt * 60); const pts = projector.userData.pts; if (pts) { const a = pts.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + 0.004 * (dt * 60); if (y > 2.9) y = -2.7; a.setY(i, y); } a.needsUpdate = true; } render = true; }
    if (pulse) { const t = (now - pulse.t0) / 1100; if (t > 1) clearPulse(); else { const s = 1 + Math.sin(t * PI * 3) * 0.6 + t * 1.5; pulse.m.scale.setScalar(s); pulse.m.material.opacity = 0.9 * (1 - t); } render = true; }
    if (render) {
      updateCamera(); S.root && S.root.updateMatrixWorld(true);
      renderer.render(scene, cam);
      const moving = updateLabels();
      S.dirty = moving;
    }
  }
  function start() { if (raf == null) { S.lastFrame = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else { S.dirty = true; start(); } });

  /* ================= UI ================= */
  /* --- list / tree --- */
  const groups = {}; FIGS.forEach((f, i) => { const k = f.sub + '|' + f.cls + '|' + f.unit + '|' + f.ch; (groups[k] = groups[k] || { sub: f.sub, cls: f.cls, unit: f.unit, ch: f.ch, items: [] }).items.push(i); });
  let listSub = 'bio';
  function renderList(filter) {
    const host = $('listView'); host.innerHTML = '';
    const tabs = document.createElement('div'); tabs.className = 'subtabs';
    for (const k of Object.keys(SUBJECTS)) { const b = document.createElement('button'); b.className = 'subtab' + (k === listSub ? ' on' : ''); b.style.setProperty('--acc', SUBJECTS[k].color); b.innerHTML = `${SUBJECTS[k].icon} ${SUBJECTS[k].name} <em>${FIGS.filter(f => f.sub === k).length}</em>`; b.onclick = () => { listSub = k; renderList(); }; tabs.appendChild(b); }
    host.appendChild(tabs);
    let lastUnit = null;
    for (const k in groups) {
      const gr = groups[k]; if (gr.sub !== listSub) continue;
      if (gr.unit !== lastUnit) { const u = document.createElement('div'); u.className = 'unit'; u.textContent = (gr.cls ? 'Class ' + gr.cls + ' · ' : '') + gr.unit; host.appendChild(u); lastUnit = gr.unit; }
      const det = document.createElement('details'); det.open = gr.items.includes(S.idx) || !!filter; const sum = document.createElement('summary'); sum.textContent = gr.ch; det.appendChild(sum);
      gr.items.forEach(i => { const f = FIGS[i]; const row = document.createElement('button'); row.className = 'row' + (i === S.idx ? ' on' : ''); row.innerHTML = `<small>${f.fig}</small><span>${f.title}</span>${f.variants.length > 1 ? `<em>${f.variants.length}</em>` : ''}`; row.onclick = () => { loadFigure(i, 0); showCard(); }; det.appendChild(row); });
      host.appendChild(det);
    }
  }
  /* --- card (2-D study panel) --- */
  function renderCard() {
    const f = S.fig, v = S.variant, host = $('cardView'); const acc = ACC[f.sub];
    const chips = `<span class="chip" style="--acc:${acc}">${SUBJECTS[f.sub].icon} ${SUBJECTS[f.sub].name}</span>${f.cls ? `<span class="chip">Class ${f.cls}</span>` : ''}<span class="chip">${f.fig}</span>`;
    const variants = f.variants.length > 1 ? `<div class="vchips">${f.variants.map((vv, i) => `<button class="vchip${i === S.vidx ? ' on' : ''}" data-v="${i}">${vv.name}</button>`).join('')}</div>` : '';
    const note = (S.res && S.res.note) ? `<p class="note">${S.res.note}</p>` : '';
    const points = (f.points || []).map(p => `<li>${p}</li>`).join('');
    const labels = S.labels.map(l => `<li data-i="${l.i}" class="${S.quiz && !l.revealed ? 'hidden-q' : ''}"><i>${l.i + 1}</i><div><b>${S.quiz && !l.revealed ? '?' : l.t}</b><span>${S.quiz && !l.revealed ? 'tap to reveal' : l.n}</span></div></li>`).join('');
    host.innerHTML = `
      <div class="cardhead">
        <div class="crumbs">${f.unit} › ${f.ch}</div>
        <h2>${f.title}</h2>
        <div class="chips">${chips}</div>
        ${variants}
      </div>
      <p class="desc">${f.desc}</p>${note}
      <section><h3>Key points for NEET</h3><ul class="points">${points}</ul></section>
      <section><div class="secrow"><h3>Labels (${S.labels.length})</h3><button id="quizBtn" class="mini${S.quiz ? ' on' : ''}">${S.quiz ? 'Show all' : 'Test me'}</button><span id="quizScore"></span></div>
        <ol id="labelList" class="labels">${labels}</ol></section>
      <div class="cardnav"><button id="cPrev">‹ Previous</button><span>${S.idx + 1} / ${FIGS.length}</span><button id="cNext">Next ›</button></div>`;
    host.querySelectorAll('.vchip').forEach(b => b.onclick = () => loadFigure(S.idx, +b.dataset.v, { keepView: true }));
    host.querySelectorAll('#labelList li').forEach(li => li.onclick = () => { const lb = S.labels[+li.dataset.i]; onLabelClick(lb); });
    $('quizBtn').onclick = toggleQuiz; $('cPrev').onclick = () => loadFigure(S.idx - 1); $('cNext').onclick = () => loadFigure(S.idx + 1);
    updateQuizScore();
    document.querySelectorAll('#listView .row').forEach(r => r.classList.remove('on'));
    host.scrollTop = 0;
  }
  function toggleQuiz() { S.quiz = !S.quiz; S.labels.forEach(l => l.revealed = !S.quiz); $('lbl-left').innerHTML = ''; $('lbl-right').innerHTML = ''; $('leaders').innerHTML = ''; S.labels.forEach(l => { l.el = null; l.colSide = null; }); buildLabelDom(); renderCard(); S.dirty = true; toast(S.quiz ? 'Quiz mode: tap a numbered marker to reveal it' : 'All labels shown'); }
  function renderVariantBar() {
    const bar = $('variantBar'); const f = S.fig; bar.innerHTML = '';
    if (f.variants.length < 2) { bar.hidden = true; return; }
    bar.hidden = false; f.variants.forEach((vv, i) => { const b = document.createElement('button'); b.className = 'vchip' + (i === S.vidx ? ' on' : ''); b.textContent = vv.name; b.onclick = () => loadFigure(S.idx, i, { keepView: true }); bar.appendChild(b); });
    const on = bar.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function updateNav() { $('figCounter').textContent = `${S.idx + 1} / ${FIGS.length}`; $('figTitleMini').textContent = S.fig.title; document.querySelectorAll('#listView .row').forEach(r => r.classList.remove('on')); }
  function showCard() { setPanel(true); $('panel').classList.remove('list'); $('listBtn').classList.remove('on'); }
  function showList() { setPanel(true); $('panel').classList.add('list'); $('listBtn').classList.add('on'); renderList(); const on = document.querySelector('#listView .row.on'); if (on) on.scrollIntoView({ block: 'center' }); }
  function setPanel(open) { S.panelOpen = open; $('panel').classList.toggle('open', open); document.body.classList.toggle('panel-open', open); resize(); }

  /* --- search --- */
  const searchEl = $('search'), results = $('results');
  function closeSearch() { results.hidden = true; }
  function doSearch(q) {
    q = q.trim().toLowerCase(); if (!q) { closeSearch(); return; }
    const terms = q.split(/\s+/);
    const scored = FIGS.map((f, i) => { const hay = [f.title, f.fig, f.ch, f.unit, f.desc, ...(f.variants.map(v => v.name))].join(' ').toLowerCase(); let sc = 0; for (const t of terms) { if (f.title.toLowerCase().includes(t)) sc += 5; if (f.fig.toLowerCase().includes(t)) sc += 4; if (hay.includes(t)) sc += 1; } return { i, sc }; }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 10);
    results.innerHTML = scored.length ? scored.map(({ i }) => { const f = FIGS[i]; return `<button data-i="${i}"><b style="--acc:${ACC[f.sub]}">${SUBJECTS[f.sub].icon}</b><div><span>${f.title}</span><small>${f.fig} · ${f.ch}</small></div></button>`; }).join('') : '<div class="none">No figures match</div>';
    results.hidden = false; results.querySelectorAll('button').forEach(b => b.onclick = () => { loadFigure(+b.dataset.i); closeSearch(); searchEl.value = ''; $('clearSearch').hidden = true; searchEl.blur(); showCard(); });
  }
  searchEl.addEventListener('input', () => { $('clearSearch').hidden = !searchEl.value; doSearch(searchEl.value); });
  searchEl.addEventListener('focus', () => { if (searchEl.value) doSearch(searchEl.value); });
  searchEl.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = results.querySelector('button'); if (b) b.click(); } if (e.key === 'Escape') { closeSearch(); searchEl.blur(); } });
  $('clearSearch').onclick = () => { searchEl.value = ''; $('clearSearch').hidden = true; closeSearch(); searchEl.focus(); };
  document.addEventListener('click', e => { if (!e.target.closest('#topbar')) closeSearch(); });

  /* --- buttons --- */
  $('menuBtn').onclick = () => { if (S.panelOpen && $('panel').classList.contains('list')) setPanel(false); else showList(); };
  $('listBtn').onclick = () => { if ($('panel').classList.contains('list')) showCard(); else showList(); };
  $('closePanel').onclick = () => setPanel(false);
  $('prevBtn').onclick = () => loadFigure(S.idx - 1); $('nextBtn').onclick = () => loadFigure(S.idx + 1);
  $('zoomIn').onclick = () => zoomBy(0.8); $('zoomOut').onclick = () => zoomBy(1.25);
  $('resetBtn').onclick = () => { resetView(); $('slider').value = 0; S.explodeTarget = 0; S.slideTarget = 0; };
  $('rotBtn').onclick = () => { S.autoRot = !S.autoRot; $('rotBtn').classList.toggle('on', S.autoRot); $('rotBtn').textContent = S.autoRot ? '⏸' : '▶'; $('rotBtn').title = S.autoRot ? 'Pause auto-rotate' : 'Resume auto-rotate'; S.dirty = true; };
  if (REDUCED) { $('rotBtn').disabled = true; $('rotBtn').textContent = '▶'; $('rotBtn').title = 'Auto-rotate off (reduced motion)'; } else { $('rotBtn').classList.add('on'); }
  $('lblBtn').onclick = () => setLabelsVisible(!S.labelsOn);
  $('viewBtn').onclick = () => { S.view = S.view === 'solid' ? 'wire' : S.view === 'wire' ? 'xray' : 'solid'; applyViewMode(); toast('View: ' + S.view); };
  $('modeBtn').onclick = () => { S.mode2D = !S.mode2D; cam = S.mode2D ? ortho : camera; $('modeBtn').textContent = S.mode2D ? '3D' : '2D'; $('modeBtn').classList.toggle('on', S.mode2D); $('modeBtn').title = S.mode2D ? 'Switch to 3D perspective' : 'Switch to flat 2D (textbook) view'; resetView(); updateOrtho(); toast(S.mode2D ? '2D textbook view — drag to pan' : '3D hologram view'); };
  $('fsBtn').onclick = () => { const d = document.documentElement; if (!document.fullscreenElement) (d.requestFullscreen && d.requestFullscreen()); else document.exitFullscreen(); };
  $('helpBtn').onclick = () => $('help').hidden = !$('help').hidden; $('helpClose').onclick = () => $('help').hidden = true;
  $('lblBtn').classList.add('on');

  /* --- keyboard --- */
  window.addEventListener('keydown', e => {
    if (e.target === searchEl) return; const k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'n') loadFigure(S.idx + 1); else if (k === 'arrowleft' || k === 'p') loadFigure(S.idx - 1);
    else if (k === 'arrowup') { if (S.fig.variants.length > 1) loadFigure(S.idx, (S.vidx - 1 + S.fig.variants.length) % S.fig.variants.length, { keepView: true }); }
    else if (k === 'arrowdown') { if (S.fig.variants.length > 1) loadFigure(S.idx, (S.vidx + 1) % S.fig.variants.length, { keepView: true }); }
    else if (k === 'l') setLabelsVisible(!S.labelsOn); else if (k === 'r') $('resetBtn').click(); else if (k === ' ') { e.preventDefault(); if (!REDUCED) $('rotBtn').click(); }
    else if (k === '/') { e.preventDefault(); searchEl.focus(); } else if (k === 'escape') { setPanel(false); $('help').hidden = true; } else if (k === '+' || k === '=') zoomBy(0.8); else if (k === '-') zoomBy(1.25);
    else if (k === 'v') $('viewBtn').click(); else if (k === 'q') toggleQuiz(); else if (k === 'm') showList(); else if (k === '?') $('helpBtn').click();
  });

  /* --- toast --- */
  let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 300); }, 1800); }

  /* --- init --- */
  window.addEventListener('resize', resize);
  const hash = location.hash.slice(1); let startIdx = 0, startV = 0;
  if (hash) { const [id, v] = hash.split('/'); const i = FIGS.findIndex(f => f.id === id); if (i >= 0) { startIdx = i; startV = +v || 0; } }
  $('total').textContent = FIGS.length;
  renderList();
  resize();
  loadFigure(startIdx, startV);
  if (S.panelOpen) { setPanel(true); $('panel').classList.remove('list'); }
  start();
  if (!hash) setTimeout(() => toast(isMobile() ? 'Drag to orbit · pinch to zoom · tap ☰ for figures' : 'Drag to orbit · scroll to zoom · / to search'), 600);
  window.HOLO = { S, loadFigure, FIGS, H, C, SUBJECTS, ACC, renderOnce() { updateCamera(); S.root && S.root.updateMatrixWorld(true); renderer.render(scene, cam); return updateLabels(); }, setExplode(t) { S.explodeT = S.explodeTarget = t; applyExplode(t); if (S.res && S.res.slide) { S.slideT = S.slideTarget = t; S.res.slide(t); } }, setPanel, toggleQuiz, setLabelsVisible };
})();

