/* HoloStudy practice question bank: NCERT Class 10 Maths (14 chapters) + an algebra drill (Classes 8–10).
   Built from the "Equation Evaders / CBSE Math Quest" generators (chapters.js, bookdrill.js, the algebra
   shooter), rewritten so that every question is safe to grade:
     · the correct answer is COMPUTED, never typed;
     · wrong answers can never equal the right one (checked by value, so 2/4 never sits beside 1/2),
       and never include a second correct answer (the other root of a quadratic, for example);
     · numbers are shown cleanly (−3, 2.5, 10√3), negatives and decimals get believable distractors.
   Questions tagged `book` use the numbers printed in the NCERT exercises.
   Each generator returns { q, a, w: [wrong…], hint, topic, book? }; PracticeBank.make() turns it into an
   MCQ with the requested number of options. tools/test-practice-bank.mjs re-solves every question
   independently and checks the options. Works in the browser (window.PracticeBank) and in Node. */
(function (root) {
  'use strict';
  // ───────── helpers ─────────
  const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);
  const nz = (a, b) => { let v; do v = R(a, b); while (v === 0); return v; };
  // 12 → "12", -3 → "−3", 2.5 → "2.5", 19.25 → "19.25"
  const num = (v) => { if (!Number.isFinite(v)) throw new Error('bad number ' + v); const r = Math.round(v * 100) / 100; return (Number.isInteger(r) ? String(r) : String(r)).replace(/^-/, '−'); };
  // polynomial terms: term(3,'x',true) "3x", term(-1,'x') "− x", term(4,'',false) "+ 4"
  const term = (c, v, first) => {
    if (c === 0) return '';
    const mag = Math.abs(c) === 1 && v ? '' : String(Math.abs(c));
    return first ? `${c < 0 ? '−' : ''}${mag}${v}` : ` ${c < 0 ? '−' : '+'} ${mag}${v}`;
  };
  const poly = (...terms) => { let s = '', first = true; for (const [c, v] of terms) { if (!c) continue; s += term(c, v, first); first = false; } return s || '0'; };
  // numbers around v (never v itself); keeps the same "shape" (integers stay integers, halves stay halves)
  const near = (v, { step = 1, n = 6, positive = false } = {}) => {
    const out = []; let k = 1;
    while (out.length < n && k < 60) {
      for (const c of [v + k * step, v - k * step]) if (c !== v && (!positive || c > 0) && !out.includes(c)) out.push(c);
      k++;
    }
    return out.slice(0, n);
  };
  const frac = (p, q) => { const g = gcd(p, q); return `${p / g}/${q / g}`; };
  const fracVal = (s) => { const m = /^(−?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s); return m ? parseFloat(m[1].replace('−', '-')) / parseFloat(m[2]) : null; };

  // ───────── 1. Real Numbers ─────────
  const ch1 = [
    () => { const two = R(0, 3), five = R(0, 3), extra = pick([1, 1, 3, 7, 11]), q = 2 ** two * 5 ** five * extra, p = R(1, 9);
      if (q === 1 || gcd(p, q) !== 1) return ch1[0]();
      const t = extra === 1;
      return { q: `The decimal expansion of ${p}/${q} is`, a: t ? 'Terminating' : 'Non-terminating repeating', w: [t ? 'Non-terminating repeating' : 'Terminating', 'Non-terminating non-repeating'],
        hint: `${q} = ${[two && `2${two > 1 ? '^' + two : ''}`, five && `5${five > 1 ? '^' + five : ''}`, extra > 1 && extra].filter(Boolean).join(' × ')}. ${t ? 'Only 2s and 5s → terminating.' : `The factor ${extra} → non-terminating repeating (a rational number never gives non-repeating).`}`, topic: 'Decimal expansions' }; },
    () => { const h = R(2, 12), a = h * R(2, 9), b = h * R(2, 9); if (a === b || gcd(a, b) !== h) return ch1[1]();
      return { q: `HCF(${a}, ${b}) =`, a: num(h), w: [num(h * 2), num(lcm(a, b)), ...near(h, { positive: true }).map(num)], hint: `Prime-factorise, or use Euclid: HCF(${a}, ${b}) = ${h}.`, topic: 'HCF' }; },
    () => { const a = R(4, 20), b = R(4, 20); if (a === b) return ch1[2](); const l = lcm(a, b);
      return { q: `LCM(${a}, ${b}) =`, a: num(l), w: [num(a * b === l ? l * 2 : a * b), num(gcd(a, b)), ...near(l, { step: Math.max(1, Math.min(a, b)), positive: true }).map(num)], hint: `LCM = ${a} × ${b} ÷ HCF(${a}, ${b}) = ${a * b} ÷ ${gcd(a, b)} = ${l}.`, topic: 'LCM' }; },
    () => { const [a, b] = pick([[26, 91], [510, 92], [336, 54], [12, 15], [17, 23], [8, 9], [306, 657]]), h = gcd(a, b);
      return { q: `For ${a} and ${b}, HCF =`, a: num(h), w: [num(lcm(a, b)), ...near(h, { positive: true }).map(num)], hint: `HCF(${a}, ${b}) = ${h}; check: HCF × LCM = ${h} × ${lcm(a, b)} = ${a * b} = ${a} × ${b}.`, topic: 'HCF · NCERT numbers', book: true }; },
    () => { const [a, b] = pick([[26, 91], [510, 92], [336, 54], [12, 21], [17, 23], [8, 9]]), l = lcm(a, b), h = gcd(a, b);
      return { q: `HCF(${a}, ${b}) = ${h}. Their LCM is`, a: num(l), w: [num(a * b), num(l * 2), num(l / 2), num(h), num(a + b)], hint: `HCF × LCM = product of the numbers → LCM = ${a} × ${b} ÷ ${h} = ${l}.`, topic: 'HCF × LCM = product', book: true }; },
  ];

  // ───────── 2. Polynomials ─────────
  const ch2 = [
    () => { const z = nz(-6, 6), a = R(2, 9), b = -a * z;
      return { q: `The zero of p(x) = ${poly([a, 'x'], [b, ''])} is`, a: num(z), w: [num(-z), num(b), ...near(z)].map((x) => (typeof x === 'number' ? num(x) : x)), hint: `Solve ${poly([a, 'x'], [b, ''])} = 0 → x = ${num(-b)}/${a} = ${num(z)}.`, topic: 'Zero of a linear polynomial' }; },
    () => { const r1 = nz(-6, 9), r2 = nz(-6, 9), s = r1 + r2, p = r1 * r2;
      return { q: `The sum of the zeros of x²${term(-s, 'x')}${term(p, '')} is`, a: num(s), w: [num(-s), num(p), ...near(s)].map((x) => (typeof x === 'number' ? num(x) : x)), hint: `For x² + bx + c, sum of zeros = −b = ${num(s)} (zeros ${num(r1)} and ${num(r2)}).`, topic: 'Sum of zeros' }; },
    () => { const r1 = nz(-6, 9), r2 = nz(-6, 9), s = r1 + r2, p = r1 * r2;
      return { q: `The product of the zeros of x²${term(-s, 'x')}${term(p, '')} is`, a: num(p), w: [num(-p), num(s), ...near(p)].map((x) => (typeof x === 'number' ? num(x) : x)), hint: `For x² + bx + c, product of zeros = c = ${num(p)}.`, topic: 'Product of zeros' }; },
    () => { const k = nz(-7, 7), m = R(-9, 9), c = nz(-5, 5), r = c * c + k * c + m;
      return { q: `When p(x) = ${poly([1, 'x²'], [k, 'x'], [m, ''])} is divided by (x ${c > 0 ? '−' : '+'} ${Math.abs(c)}), the remainder is`, a: num(r), w: [num((-c) * (-c) + k * -c + m), ...near(r)].map((x) => (typeof x === 'number' ? num(x) : x)), hint: `Remainder theorem: remainder = p(${num(c)}) = ${num(c * c)} ${k * c < 0 ? '−' : '+'} ${Math.abs(k * c)} ${m < 0 ? '−' : '+'} ${Math.abs(m)} = ${num(r)}.`, topic: 'Remainder theorem' }; },
    () => { const a = R(2, 12);
      return { q: `(x + ${a})(x − ${a}) = x² − ?`, a: num(a * a), w: [num(2 * a), num(a), num(a * a + 1), num(a * a - 1), num(2 * a * a)], hint: `(x + a)(x − a) = x² − a², and ${a}² = ${a * a}.`, topic: 'Identities' }; },
    () => { const s = R(2, 12), p = R(1, 20);
      return { q: `For x² − ${s}x + ${p}, the product of the zeros is`, a: num(p), w: [num(s), num(-p), ...near(p, { positive: true })].map((x) => (typeof x === 'number' ? num(x) : x)), hint: `Product of zeros = c/a = ${p}.`, topic: 'Zeros & coefficients · NCERT', book: true }; },
  ];

  // ───────── 3. Pair of Linear Equations ─────────
  const sys = () => { const x = nz(-5, 8), y = nz(-5, 8); let a1, b1, a2, b2; do { a1 = nz(-4, 5); b1 = nz(-4, 5); a2 = nz(-4, 5); b2 = nz(-4, 5); } while (a1 * b2 - a2 * b1 === 0); return { x, y, a1, b1, a2, b2, c1: a1 * x + b1 * y, c2: a2 * x + b2 * y }; };
  const ch3 = [
    () => { const s = sys(); return { q: `Solve ${poly([s.a1, 'x'], [s.b1, 'y'])} = ${num(s.c1)} and ${poly([s.a2, 'x'], [s.b2, 'y'])} = ${num(s.c2)}. x =`, a: num(s.x), w: [num(s.y), num(-s.x), ...near(s.x)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Eliminate y: the solution is x = ${num(s.x)}, y = ${num(s.y)}.`, topic: 'Solving a pair' }; },
    () => { const s = sys(); return { q: `Solve ${poly([s.a1, 'x'], [s.b1, 'y'])} = ${num(s.c1)} and ${poly([s.a2, 'x'], [s.b2, 'y'])} = ${num(s.c2)}. y =`, a: num(s.y), w: [num(s.x), num(-s.y), ...near(s.y)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Eliminate x: the solution is x = ${num(s.x)}, y = ${num(s.y)}.`, topic: 'Solving a pair' }; },
    () => { const x = R(2, 12), y = R(1, 11); if (x === y) return ch3[2]();
      return { q: `If x + y = ${x + y} and x − y = ${num(x - y)}, then y =`, a: num(y), w: [num(x), num(x + y), ...near(y)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Subtract the equations: 2y = ${x + y} − (${num(x - y)}) = ${2 * y}, so y = ${y}.`, topic: 'Elimination' }; },
    () => { const boys = R(3, 9), diff = R(2, 6), total = 2 * boys + diff;
      return { q: `${total} students took part in a quiz. There were ${diff} more girls than boys. How many boys?`, a: num(boys), w: [num(boys + diff), num(total - boys + 1), ...near(boys, { positive: true })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `b + g = ${total}, g = b + ${diff} → 2b + ${diff} = ${total} → b = ${boys}.`, topic: 'Word problem · NCERT', book: true }; },
    () => { const pencil = R(2, 5), pen = pencil + R(1, 5), a = R(3, 6), b = a + 2, c1 = a * pencil + b * pen, c2 = (a + 2) * pencil + (b - 2) * pen;
      return { q: `${a} pencils and ${b} pens cost ₹${c1}; ${a + 2} pencils and ${b - 2} pens cost ₹${c2}. One pencil costs`, a: `₹${pencil}`, w: [`₹${pen}`, ...near(pencil, { positive: true }).map((v) => `₹${v}`)], hint: `Subtract: 2 pencils − 2 pens = ₹${c2 - c1} → pen = pencil + ${pen - pencil}. Substituting gives pencil = ₹${pencil}, pen = ₹${pen}.`, topic: 'Word problem · NCERT', book: true }; },
  ];

  // ───────── 4. Quadratic Equations ─────────
  const ch4 = [
    () => { let r1 = nz(-7, 9), r2 = nz(-7, 9); if (r1 === r2) return ch4[0](); const b = -(r1 + r2), c = r1 * r2;
      return { q: `One root of x²${term(b, 'x')}${term(c, '')} = 0 is`, a: num(r1), w: [num(-r1), num(-r2), ...near(r1)].filter((v) => v !== r2 && v !== num(r2)).map((v) => (typeof v === 'number' ? num(v) : v)), roots: [num(r1), num(r2)], hint: `Factorise: (x ${r1 > 0 ? '−' : '+'} ${Math.abs(r1)})(x ${r2 > 0 ? '−' : '+'} ${Math.abs(r2)}) = 0 → roots ${num(r1)} and ${num(r2)}.`, topic: 'Roots by factorisation' }; },
    () => { const a = R(1, 4), b = nz(-12, 12), c = nz(-12, 12), D = b * b - 4 * a * c;
      return { q: `The discriminant of ${poly([a, 'x²'], [b, 'x'], [c, ''])} = 0 is`, a: num(D), w: [num(b * b + 4 * a * c), num(b * b - 2 * a * c), num(-D), ...near(D, { step: 2 })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `D = b² − 4ac = ${b * b} − 4·${a}·${num(c)} = ${num(D)}.`, topic: 'Discriminant' }; },
    () => { const kind = pick(['distinct', 'equal', 'none']); let a, b, c;
      if (kind === 'equal') { const k = nz(-6, 6); a = 1; b = 2 * k; c = k * k; }
      else { do { a = R(1, 4); b = nz(-10, 10); c = nz(-12, 12); } while (Math.sign(b * b - 4 * a * c) !== (kind === 'distinct' ? 1 : -1)); }
      const D = b * b - 4 * a * c, nat = D > 0 ? 'Two distinct real roots' : D === 0 ? 'Two equal real roots' : 'No real roots';
      return { q: `The roots of ${poly([a, 'x²'], [b, 'x'], [c, ''])} = 0 are`, a: nat, w: ['Two distinct real roots', 'Two equal real roots', 'No real roots'].filter((x) => x !== nat), hint: `D = b² − 4ac = ${num(D)} ${D > 0 ? '> 0' : D === 0 ? '= 0' : '< 0'} → ${nat.toLowerCase()}.`, topic: 'Nature of roots' }; },
  ];

  // ───────── 5. Arithmetic Progressions ─────────
  const ch5 = [
    () => { const a = R(-5, 12), d = nz(-6, 9), n = R(8, 25), an = a + (n - 1) * d;
      return { q: `In the AP ${num(a)}, ${num(a + d)}, ${num(a + 2 * d)}, …, the ${n}th term is`, a: num(an), w: [num(a + n * d), num(a + (n - 2) * d), num(n * d), ...near(an, { step: Math.abs(d) })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `aₙ = a + (n − 1)d = ${num(a)} + ${n - 1} × ${num(d)} = ${num(an)}.`, topic: 'nth term' }; },
    () => { const a = R(1, 10), d = R(2, 9), n = R(8, 20), S = (n * (2 * a + (n - 1) * d)) / 2;
      return { q: `The sum of the first ${n} terms of the AP ${a}, ${a + d}, ${a + 2 * d}, … is`, a: num(S), w: [num(n * (a + (n - 1) * d)), num(((n - 1) * (2 * a + (n - 2) * d)) / 2), num(a + (n - 1) * d), ...near(S, { step: d, positive: true })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Sₙ = n/2 [2a + (n − 1)d] = ${n}/2 × [${2 * a} + ${(n - 1) * d}] = ${num(S)}.`, topic: 'Sum of n terms' }; },
    () => { const a = R(-9, 15), d = nz(-8, 8);
      return { q: `The common difference of the AP ${num(a)}, ${num(a + d)}, ${num(a + 2 * d)}, ${num(a + 3 * d)}, … is`, a: num(d), w: [num(-d), num(a), num(a + d), ...near(d)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `d = a₂ − a₁ = ${num(a + d)} − (${num(a)}) = ${num(d)}.`, topic: 'Common difference' }; },
  ];

  // ───────── 6. Triangles ─────────
  const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [7, 24, 25], [12, 16, 20], [20, 21, 29]];
  const ch6 = [
    () => { const [a, b, c] = pick(TRIPLES);
      return { q: `A right triangle has legs ${a} cm and ${b} cm. Its hypotenuse is`, a: `${c} cm`, w: [`${a + b} cm`, `${c + 1} cm`, `${c - 1} cm`, `${c + 2} cm`, `${Math.abs(b - a) + c} cm`], hint: `Pythagoras: √(${a}² + ${b}²) = √${a * a + b * b} = ${c} cm.`, topic: 'Pythagoras theorem', book: true }; },
    () => { const k = R(2, 6);
      return { q: `ΔABC ~ ΔPQR and AB : PQ = ${k} : 1. The ratio of their areas is`, a: `${k * k} : 1`, w: [`${k} : 1`, `${2 * k} : 1`, `${k * k * k} : 1`, `${k * k + 1} : 1`, `1 : ${k * k}`], hint: `Areas of similar triangles are in the ratio of the squares of sides: ${k}² : 1 = ${k * k} : 1.`, topic: 'Areas of similar triangles' }; },
    () => { const [a, b, c] = pick(TRIPLES);
      return { q: `A ladder ${c} m long reaches a window ${b} m high. How far is its foot from the wall?`, a: `${a} m`, w: [`${c - b} m`, `${a + 1} m`, `${a - 1} m`, `${c + b} m`, `${a + 2} m`].filter((x) => x !== `${a} m`), hint: `√(${c}² − ${b}²) = √${c * c - b * b} = ${a} m.`, topic: 'Pythagoras in context' }; },
  ];

  // ───────── 7. Coordinate Geometry ─────────
  const ch7 = [
    () => { const [p, q, d] = pick(TRIPLES), x1 = R(-5, 6), y1 = R(-5, 6), sx = pick([1, -1]), sy = pick([1, -1]), swap = Math.random() < 0.5;
      const x2 = x1 + sx * (swap ? q : p), y2 = y1 + sy * (swap ? p : q);
      return { q: `The distance between (${num(x1)}, ${num(y1)}) and (${num(x2)}, ${num(y2)}) is`, a: num(d), w: [num(p + q), num(d * d), ...near(d, { positive: true })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `√[(${num(x2 - x1)})² + (${num(y2 - y1)})²] = √${d * d} = ${d}.`, topic: 'Distance formula' }; },
    () => { const x1 = R(-6, 8), y1 = R(-6, 8), x2 = R(-6, 8), y2 = R(-6, 8), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const P = (a, b) => `(${num(a)}, ${num(b)})`;
      return { q: `The midpoint of ${P(x1, y1)} and ${P(x2, y2)} is`, a: P(mx, my), w: [P(x1 + x2, y1 + y2), P((x2 - x1) / 2, (y2 - y1) / 2), P(my, mx), P(mx + 1, my), P(mx, my - 1)], hint: `((x₁ + x₂)/2, (y₁ + y₂)/2) = ${P(mx, my)}.`, topic: 'Midpoint' }; },
    () => { const col = Math.random() < 0.5, x1 = R(-4, 4), y1 = R(-4, 4), dx = nz(-3, 3), dy = nz(-3, 3), t = pick([2, 3, -1]);
      const x3 = x1 + t * dx, y3 = y1 + t * dy + (col ? 0 : nz(-2, 2)), x2 = x1 + dx, y2 = y1 + dy, area2 = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
      const isCol = area2 === 0;
      return { q: `Are (${num(x1)}, ${num(y1)}), (${num(x2)}, ${num(y2)}) and (${num(x3)}, ${num(y3)}) collinear?`, a: isCol ? 'Yes' : 'No', w: [isCol ? 'No' : 'Yes'], hint: `Area of the triangle = ½|x₁(y₂ − y₃) + x₂(y₃ − y₁) + x₃(y₁ − y₂)| = ${num(Math.abs(area2) / 2)} → ${isCol ? 'collinear' : 'not collinear'}.`, topic: 'Collinearity' }; },
  ];

  // ───────── 8. Introduction to Trigonometry ─────────
  const TRIG = [['sin 30°', '1/2'], ['cos 60°', '1/2'], ['tan 45°', '1'], ['sin 90°', '1'], ['cos 0°', '1'], ['tan 30°', '1/√3'], ['tan 60°', '√3'], ['sin 60°', '√3/2'], ['cos 30°', '√3/2'], ['sin 45°', '1/√2'], ['cos 45°', '1/√2'], ['sin 0°', '0'], ['cos 90°', '0']];
  const TRIGV = ['0', '1/2', '1/√2', '√3/2', '1', '√3', '1/√3', '2'];
  const ch8 = [
    () => { const [f, v] = pick(TRIG); return { q: `${f} =`, a: v, w: TRIGV.filter((x) => x !== v), hint: `Standard value: ${f} = ${v}.`, topic: 'Standard values' }; },
    () => { const [a, b, c] = pick(TRIPLES), which = pick(['sin', 'cos', 'tan']);
      const ans = { sin: frac(a, c), cos: frac(b, c), tan: frac(a, b) }[which];
      const all = [frac(a, c), frac(b, c), frac(a, b), frac(b, a), frac(c, a), frac(c, b)];
      return { q: `In a right triangle, the side opposite θ is ${a}, the adjacent side is ${b} and the hypotenuse is ${c}. ${which} θ =`, a: ans, w: all.filter((x) => x !== ans), hint: `${which} θ = ${{ sin: 'opposite/hypotenuse', cos: 'adjacent/hypotenuse', tan: 'opposite/adjacent' }[which]} = ${ans}.`, topic: 'Trigonometric ratios' }; },
    () => { const id = pick([['sin²θ + cos²θ', '1'], ['sec²θ − tan²θ', '1'], ['cosec²θ − cot²θ', '1'], ['sin θ / cos θ', 'tan θ'], ['1 / cos θ', 'sec θ']]);
      const pool = id[1] === '1' ? ['0', '2', 'tan θ', '−1', 'sin 2θ'] : ['cot θ', 'cosec θ', 'sin θ', '1', 'cos θ'].filter((x) => x !== id[1]);
      return { q: `${id[0]} =`, a: id[1], w: pool, hint: `Identity: ${id[0]} = ${id[1]}.`, topic: 'Identities' }; },
    () => { return { q: `ΔABC is right-angled at B, AB = 24 cm and BC = 7 cm. sin A =`, a: '7/25', w: ['24/25', '7/24', '25/7', '24/7', '25/24'], hint: 'AC = √(24² + 7²) = 25; sin A = BC/AC = 7/25.', topic: 'Ratios · NCERT', book: true }; },
    () => { return { q: 'If sin A = 3/4, then cos A =', a: '√7/4', w: ['1/4', '3/√7', '4/3', '√7/3', '7/16'], hint: 'cos A = √(1 − sin²A) = √(1 − 9/16) = √7/4.', topic: 'Ratios · NCERT', book: true }; },
  ];

  // ───────── 9. Some Applications of Trigonometry ─────────
  const surd = (k, r3) => (r3 ? (k === 1 ? '√3' : `${k}√3`) : String(k)); // k√3 or k
  const ch9 = [
    () => { const ang = pick([30, 45, 60]), k = R(1, 6) * 5;
      // 45°: h = d · 60°: d = k, h = k√3 · 30°: d = k√3, h = k
      const d = ang === 60 ? surd(k, false) : ang === 45 ? surd(k, false) : surd(k, true);
      const h = ang === 60 ? surd(k, true) : ang === 45 ? surd(k, false) : surd(k, false);
      const w = [surd(k, ang !== 60), `${2 * k}`, `${k}/√3`, surd(2 * k, true), `${k * 2}√2`].filter((x) => x !== h);
      return { q: `From a point ${d} m from the foot of a tower, the angle of elevation of its top is ${ang}°. The height of the tower is`, a: `${h} m`, w: w.map((x) => `${x} m`), hint: `h = distance × tan ${ang}° = ${d} × ${ang === 30 ? '1/√3' : ang === 45 ? '1' : '√3'} = ${h} m.`, topic: 'Heights and distances' }; },
    () => { const ang = pick([30, 45, 60]), h = R(1, 6) * 10;
      const d = ang === 45 ? `${h}` : ang === 30 ? `${h}√3` : `${h}/√3`;
      const w = [`${h}√3`, `${h}`, `${h}/√3`, `${2 * h}`, `${h}√2`].filter((x) => x !== d);
      return { q: `A tower is ${h} m high. The angle of elevation of its top from a point on the ground is ${ang}°. How far is the point from the tower?`, a: `${d} m`, w: w.map((x) => `${x} m`), hint: `distance = h ÷ tan ${ang}° = ${h} ÷ ${ang === 30 ? '(1/√3)' : ang === 45 ? '1' : '√3'} = ${d} m.`, topic: 'Heights and distances', book: true }; },
  ];

  // ───────── 10. Circles ─────────
  const ch10 = [
    () => { const [t, r, d] = pick(TRIPLES);
      return { q: `A point is ${d} cm from the centre of a circle of radius ${r} cm. The length of the tangent from it is`, a: `${t} cm`, w: [`${d - r} cm`, `${d + r} cm`, `${t + 1} cm`, `${t - 1} cm`, `${t + 2} cm`].filter((x) => x !== `${t} cm`), hint: `The radius is perpendicular to the tangent, so tangent = √(${d}² − ${r}²) = √${d * d - r * r} = ${t} cm.`, topic: 'Length of a tangent' }; },
    () => ({ q: 'The angle between a tangent and the radius at the point of contact is', a: '90°', w: ['60°', '45°', '180°', '30°', '0°'], hint: 'A tangent is perpendicular to the radius through the point of contact.', topic: 'Tangent and radius' }),
    () => { const n = R(3, 12); return { q: `From a point outside a circle, the tangents PA and PB are drawn. If PA = ${n} cm, then PB =`, a: `${n} cm`, w: [`${2 * n} cm`, `${n + 1} cm`, `${n - 1} cm`, `${n / 2} cm`, `${n + 2} cm`], hint: 'Tangents drawn from an external point to a circle are equal in length.', topic: 'Tangents from a point' }; },
    () => { const x = R(40, 140); return { q: `Tangents PA and PB from P touch a circle with centre O. If ∠APB = ${x}°, then ∠AOB =`, a: `${180 - x}°`, w: [`${x}°`, `${90 - x / 2}°`, `${2 * x}°`, `${180 - x / 2}°`, `${360 - x}°`].filter((v) => v !== `${180 - x}°` && !/\.\d/.test(v) && !v.startsWith('-')), hint: `In quadrilateral OAPB the angles at A and B are 90°, so ∠AOB = 180° − ${x}° = ${180 - x}°.`, topic: 'Tangents from a point' }; },
  ];

  // ───────── 11. Areas Related to Circles (π = 22/7) ─────────
  const ch11 = [
    () => { const [r, th] = pick([[7, 90], [7, 180], [7, 360], [14, 45], [14, 90], [14, 180], [21, 60], [21, 120], [7, 120], [14, 30], [21, 90]]);
      const v = (22 / 7) * r * r * (th / 360); if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return ch11[0](); // keep exact answers only
      const full = (22 / 7) * r * r;
      return { q: `The area of a sector of angle ${th}° in a circle of radius ${r} cm is (π = 22/7)`, a: `${num(v)} cm²`, w: [num(full), num(v * 2), num(v / 2), num((22 / 7) * 2 * r * (th / 360)), num(v + 11)].filter((x) => x !== num(v)).map((x) => `${x} cm²`), hint: `(θ/360°) × πr² = ${th}/360 × 22/7 × ${r}² = ${num(v)} cm².`, topic: 'Area of a sector' }; },
    () => { const r = pick([7, 14, 21, 3.5, 35]), A = (22 / 7) * r * r;
      return { q: `The area of a circle of radius ${num(r)} cm is (π = 22/7)`, a: `${num(A)} cm²`, w: [num(2 * (22 / 7) * r), num(A * 2), num(A / 2), num((22 / 7) * r), num(A + 22)].filter((x) => x !== num(A)).map((x) => `${x} cm²`), hint: `πr² = 22/7 × ${num(r)}² = ${num(A)} cm².`, topic: 'Area of a circle' }; },
    () => { const r = pick([7, 14, 21, 35, 3.5]), C = 2 * (22 / 7) * r;
      return { q: `The circumference of a circle of radius ${num(r)} cm is (π = 22/7)`, a: `${num(C)} cm`, w: [num((22 / 7) * r * r), num(C / 2), num(C * 2), num(C + 7), num(C - 11)].filter((x) => x !== num(C)).map((x) => `${x} cm`), hint: `2πr = 2 × 22/7 × ${num(r)} = ${num(C)} cm.`, topic: 'Circumference' }; },
  ];

  // ───────── 12. Surface Areas and Volumes (π = 22/7) ─────────
  const ch12 = [
    () => { const h = R(3, 15), v = 44 * h;
      return { q: `The curved surface area of a cylinder with r = 7 cm and h = ${h} cm is (π = 22/7)`, a: `${v} cm²`, w: [`${154 * h}`, `${v + 308}`, `${22 * h}`, `${v + 44}`, `${v - 44}`].filter((x) => x !== String(v)).map((x) => `${x} cm²`), hint: `CSA = 2πrh = 2 × 22/7 × 7 × ${h} = ${v} cm².`, topic: 'Cylinder · surface area' }; },
    () => { const r = pick([7, 14, 3.5]), S = 4 * (22 / 7) * r * r;
      return { q: `The surface area of a sphere of radius ${num(r)} cm is (π = 22/7)`, a: `${num(S)} cm²`, w: [num(S / 2), num(S / 4), num((4 / 3) * (22 / 7) * r ** 3), num(3 * (22 / 7) * r * r), num(S * 2)].filter((x) => x !== num(S)).map((x) => `${x} cm²`), hint: `4πr² = 4 × 22/7 × ${num(r)}² = ${num(S)} cm².`, topic: 'Sphere · surface area' }; },
    () => { const s = R(3, 12); return { q: `The volume of a cube of edge ${s} cm is`, a: `${s ** 3} cm³`, w: [`${6 * s * s}`, `${3 * s}`, `${s * s}`, `${(s + 1) ** 3}`, `${s ** 3 + s}`].filter((x) => x !== String(s ** 3)).map((x) => `${x} cm³`), hint: `V = a³ = ${s}³ = ${s ** 3} cm³.`, topic: 'Cube · volume', book: true }; },
    () => { const h = R(2, 12), v = 154 * h; return { q: `The volume of a cylinder with r = 7 cm and h = ${h} cm is (π = 22/7)`, a: `${v} cm³`, w: [`${44 * h}`, `${Math.round(v / 3)}`, `${v * 2}`, `${v + 154}`, `${v - 154}`].filter((x) => x !== String(v)).map((x) => `${x} cm³`), hint: `V = πr²h = 22/7 × 49 × ${h} = ${v} cm³.`, topic: 'Cylinder · volume' }; },
    () => { const h = 3 * R(1, 6), v = (154 * h) / 3; return { q: `The volume of a cone with r = 7 cm and h = ${h} cm is (π = 22/7)`, a: `${num(v)} cm³`, w: [`${154 * h}`, `${num(v * 2)}`, `${num(v / 2)}`, `${num(v + 154)}`, `${num(44 * h)}`].filter((x) => x !== num(v)).map((x) => `${x} cm³`), hint: `V = ⅓πr²h = ⅓ × 22/7 × 49 × ${h} = ${num(v)} cm³.`, topic: 'Cone · volume' }; },
  ];

  // ───────── 13. Statistics ─────────
  const ch13 = [
    () => { const arr = Array.from({ length: 5 }, () => R(1, 30)), sum = arr.reduce((a, b) => a + b, 0), m = sum / 5;
      return { q: `The mean of ${arr.join(', ')} is`, a: num(m), w: [num(sum), num(sum / 4), ...near(m, { step: 1, positive: true })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Mean = (${arr.join(' + ')}) ÷ 5 = ${sum} ÷ 5 = ${num(m)}.`, topic: 'Mean' }; },
    () => { const n = R(5, 8), arr = Array.from({ length: n }, () => R(1, 40)).sort((a, b) => a - b), med = n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
      const mean = arr.reduce((a, b) => a + b, 0) / n;
      return { q: `The median of ${arr.join(', ')} is`, a: num(med), w: [num(mean), num(arr[Math.floor(n / 2) - 1]), num(arr[Math.floor(n / 2) + 1]), ...near(med, { positive: true })].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `The data is already in order; ${n % 2 ? `the middle (${(n + 1) / 2}th) value is ${num(med)}` : `the mean of the ${n / 2}th and ${n / 2 + 1}th values is ${num(med)}`}.`, topic: 'Median' }; },
    () => { const mode = R(2, 20), others = []; while (others.length < 4) { const v = R(1, 25); if (v !== mode && !others.includes(v)) others.push(v); }
      const arr = shuffle([mode, mode, mode, ...others, others[0]]);
      return { q: `The mode of ${arr.join(', ')} is`, a: num(mode), w: [num(others[0]), num(others[1]), num(others[2]), num(Math.max(...arr)), num(arr.length)], hint: `${mode} occurs 3 times — more often than any other value.`, topic: 'Mode' }; },
  ];

  // ───────── 14. Probability ─────────
  const ch14 = [
    () => { let red = R(2, 9), blue = R(2, 9); if (red === blue) return ch14[0](); const t = red + blue;
      return { q: `A bag has ${red} red and ${blue} blue balls. One ball is drawn at random. P(red) =`, a: frac(red, t), w: [frac(blue, t), `${red}/${blue}`, frac(red + 1, t + 1), `1/${t}`, '1/2'], hint: `P(red) = red ÷ total = ${red}/${t}${frac(red, t) !== `${red}/${t}` ? ` = ${frac(red, t)}` : ''}.`, topic: 'Single event' }; },
    () => { const ev = pick([['an even number', 3], ['a prime number', 3], ['a number greater than 4', 2], ['a multiple of 3', 2], ['a number less than 7', 6], ['the number 5', 1]]);
      return { q: `A fair die is thrown once. P(${ev[0]}) =`, a: ev[1] === 6 ? '1' : frac(ev[1], 6), w: ['1/6', '1/3', '1/2', '2/3', '5/6', '0', '1'].filter((x) => x !== (ev[1] === 6 ? '1' : frac(ev[1], 6))), hint: `${ev[1]} favourable outcome${ev[1] > 1 ? 's' : ''} out of 6 → ${ev[1] === 6 ? '1 (a sure event)' : frac(ev[1], 6)}.`, topic: 'Throwing a die' }; },
    () => { const ev = pick([['a king', 4], ['a red card', 26], ['a face card', 12], ['a spade', 13], ['the ace of hearts', 1], ['a black king', 2]]);
      return { q: `One card is drawn from a well-shuffled deck of 52 cards. P(${ev[0]}) =`, a: frac(ev[1], 52), w: ['1/52', '1/13', '1/4', '1/2', '3/13', '1/26', '4/13'].filter((x) => x !== frac(ev[1], 52)), hint: `${ev[1]} favourable cards out of 52 → ${ev[1]}/52 = ${frac(ev[1], 52)}.`, topic: 'Playing cards' }; },
    () => { const good = R(20, 140), bad = R(2, 20), t = good + bad;
      return { q: `A box has ${t} pens, of which ${bad} are defective. One is drawn at random. P(it is good) =`, a: frac(good, t), w: [frac(bad, t), `${good}/${bad}`, frac(good - 1, t), '1/2', frac(bad, good)], hint: `${good} good pens out of ${t} → ${good}/${t}${frac(good, t) !== `${good}/${t}` ? ` = ${frac(good, t)}` : ''}.`, topic: 'Single event · NCERT', book: true }; },
  ];

  // ───────── algebra drill (Classes 8–10, from the "Equation Evaders" shooter) ─────────
  const alg = {
    lin1: [() => { const x = nz(-9, 12), a = R(2, 9), b = nz(-14, 14), c = a * x + b;
      return { q: `Solve ${poly([a, 'x'], [b, ''])} = ${num(c)}. x =`, a: num(x), w: [num(-x), num((c + b) / a), num(c - b), ...near(x)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `${a}x = ${num(c)} ${b > 0 ? '−' : '+'} ${Math.abs(b)} = ${num(c - b)}, so x = ${num(c - b)} ÷ ${a} = ${num(x)}.`, topic: 'Linear equations in one variable' }; }],
    lin2: [() => { const x = R(2, 12), y = R(1, 11); if (x === y) return alg.lin2[0]();
      return { q: `If x + y = ${x + y} and x − y = ${num(x - y)}, then x =`, a: num(x), w: [num(y), num(x + y), ...near(x)].map((v) => (typeof v === 'number' ? num(v) : v)), hint: `Add the equations: 2x = ${2 * x}, so x = ${x}.`, topic: 'Linear equations in two variables' }; }],
    quad: [() => ch4[0]()],
    ident: [() => ch2[4](), () => { const a = R(2, 9); return { q: `(x + ${a})² = x² + ?x + ${a * a}`, a: num(2 * a), w: [num(a), num(a * a), num(4 * a), num(2 * a + 1), num(a + 2)], hint: `(x + a)² = x² + 2ax + a², so the middle coefficient is 2 × ${a} = ${2 * a}.`, topic: 'Identities' }; }],
    word: [() => { const p = R(2, 6), n = R(2, 15), q = R(1, 15), r = p * n - q; if (r <= 0) return alg.word[0]();
      return { q: `${p} times a number, minus ${q}, is ${r}. The number is`, a: num(n), w: [num((r - q) / p), num(r + q), num(n + 1), num(n - 1), num(r / p)].filter((v) => v !== num(n)), hint: `${p}n − ${q} = ${r} → ${p}n = ${r + q} → n = ${n}.`, topic: 'Word problems' }; }],
  };

  const GROUPS = [
    { id: 'c10', title: 'NCERT Class 10 Maths', chapters: [
      { id: 'c10-1', n: 1, title: 'Real Numbers', color: '#ff6b6b', gens: ch1 },
      { id: 'c10-2', n: 2, title: 'Polynomials', color: '#ffa94d', gens: ch2 },
      { id: 'c10-3', n: 3, title: 'Pair of Linear Equations', color: '#ffd43b', gens: ch3 },
      { id: 'c10-4', n: 4, title: 'Quadratic Equations', color: '#a9e34b', gens: ch4 },
      { id: 'c10-5', n: 5, title: 'Arithmetic Progressions', color: '#69db7c', gens: ch5 },
      { id: 'c10-6', n: 6, title: 'Triangles', color: '#38d9a9', gens: ch6 },
      { id: 'c10-7', n: 7, title: 'Coordinate Geometry', color: '#3bc9db', gens: ch7 },
      { id: 'c10-8', n: 8, title: 'Introduction to Trigonometry', color: '#4dabf7', gens: ch8 },
      { id: 'c10-9', n: 9, title: 'Applications of Trigonometry', color: '#748ffc', gens: ch9 },
      { id: 'c10-10', n: 10, title: 'Circles', color: '#9775fa', gens: ch10 },
      { id: 'c10-11', n: 11, title: 'Areas Related to Circles', color: '#da77f2', gens: ch11 },
      { id: 'c10-12', n: 12, title: 'Surface Areas & Volumes', color: '#f783ac', gens: ch12 },
      { id: 'c10-13', n: 13, title: 'Statistics', color: '#ff8787', gens: ch13 },
      { id: 'c10-14', n: 14, title: 'Probability', color: '#ffc078', gens: ch14 },
    ] },
    { id: 'alg', title: 'Algebra drill · Classes 8–10', chapters: [
      { id: 'alg-lin1', title: 'Linear equations (1 variable)', color: '#4dabf7', gens: alg.lin1 },
      { id: 'alg-lin2', title: 'Linear equations (2 variables)', color: '#38d9a9', gens: alg.lin2 },
      { id: 'alg-quad', title: 'Quadratic equations', color: '#a9e34b', gens: alg.quad },
      { id: 'alg-ident', title: 'Algebraic identities', color: '#ffa94d', gens: alg.ident },
      { id: 'alg-word', title: 'Word problems', color: '#f783ac', gens: alg.word },
    ] },
  ];
  const CHAPTERS = GROUPS.flatMap((g) => g.chapters.map((c) => Object.assign(c, { group: g.id, groupTitle: g.title })));
  const byId = (id) => CHAPTERS.find((c) => c.id === id);

  // value of an option string, for "same value" checks ("2/4" = "1/2", "−3" = "-3", "12 cm" = "12 cm")
  const valueOf = (s) => {
    const t = String(s).replace(/\s*(cm²|cm³|cm|m|°)$/, '').replace(/^₹/, '');
    const f = fracVal(t); if (f != null) return f;
    const n = parseFloat(t.replace('−', '-')); return /^[−-]?\d+(\.\d+)?$/.test(t) ? n : null;
  };
  const same = (a, b) => { if (a === b) return true; const x = valueOf(a), y = valueOf(b); return x != null && y != null && Math.abs(x - y) < 1e-9 && String(a).replace(/[\d./−-]/g, '') === String(b).replace(/[\d./−-]/g, ''); };

  // generator output → MCQ with `count` options (2…5); exactly one option equals the answer
  function build(p, count, meta) {
    const wrong = [];
    const bad = (x) => x == null || x === '' || /NaN|undefined|Infinity/.test(String(x)) || same(x, p.a) || (p.roots || []).some((r) => same(x, r)) || wrong.some((y) => same(x, y));
    for (const x of p.w || []) { const s = typeof x === 'number' ? num(x) : String(x); if (!bad(s)) wrong.push(s); }
    // top up with neighbours of a numeric answer when a generator ran short
    const v = valueOf(p.a);
    if (wrong.length < count - 1 && v != null && !/\//.test(p.a)) {
      const unit = String(p.a).match(/\s*(cm²|cm³|cm|m|°)$/), pre = String(p.a).startsWith('₹') ? '₹' : '';
      for (const c of near(v, { step: Number.isInteger(v) ? 1 : 0.5, n: 10 })) { const s = pre + num(c) + (unit ? unit[0] : ''); if (!bad(s)) wrong.push(s); if (wrong.length >= count - 1) break; }
    }
    const opts = shuffle([p.a, ...shuffle(wrong).slice(0, Math.max(1, count - 1))]);
    return { q: p.q, options: opts, answer: opts.indexOf(p.a), hint: p.hint, topic: p.topic, book: !!p.book, ...meta };
  }

  // one question from the chosen chapters (ids); count = number of options wanted
  function make(ids, count = 4) {
    const pool = (ids && ids.length ? ids.map(byId).filter(Boolean) : CHAPTERS.filter((c) => c.group === 'c10'));
    const ch = pick(pool), gi = R(0, ch.gens.length - 1);
    for (let tries = 0; tries < 8; tries++) {
      try { const p = ch.gens[gi](); const m = build(p, count, { chapter: ch.id, chapterTitle: ch.title, color: ch.color, gen: `${ch.id}#${gi}` }); if (m.options.length >= 2) return m; } catch (e) { /* try again with new numbers */ }
    }
    return build(ch1[1](), count, { chapter: 'c10-1', chapterTitle: 'Real Numbers', color: '#ff6b6b', gen: 'c10-1#1' });
  }

  root.PracticeBank = { GROUPS, CHAPTERS, byId, make, build, same, valueOf, num, _raw: { ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10, ch11, ch12, ch13, ch14, alg } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PracticeBank;
})(typeof window !== 'undefined' ? window : globalThis);
