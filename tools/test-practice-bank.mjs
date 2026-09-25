#!/usr/bin/env node
// Verifies every practice question generator (engines/practice/bank.js).
// Each question is re-solved INDEPENDENTLY from its text alone (parsing the polynomial, the system, the
// numbers…), then the options are checked: exactly one option equals that solution (by value, so 2/4
// counts as 1/2), no duplicates, nothing like NaN/undefined, and for quadratics no other root among the
// wrong answers. Any question template the solver does not recognise counts as a failure, so new
// generators cannot slip through unchecked.
//   node tools/test-practice-bank.mjs [runsPerGenerator=600]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../engines/practice/bank.js');
const RUNS = +(process.argv[2] || 600);

const N = (s) => parseFloat(String(s).replace('−', '-'));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const fr = (p, q) => { const g = gcd(p, q); return `${p / g}/${q / g}`; };
const fmt = (v) => { const r = Math.round(v * 100) / 100; return String(r).replace(/^-/, '−'); };
// "−3x² + 5x − 7", "2x + 8", "3x − 2y" → { x2, x, y, c }
function parsePoly(s) {
  const out = { x2: 0, x: 0, y: 0, c: 0 };
  const t = s.replace(/\s+/g, '').replace(/−/g, '-');
  for (const m of t.matchAll(/([+-]?)(\d*(?:\.\d+)?)(x²|x|y)?/g)) {
    if (!m[0]) continue;
    const sign = m[1] === '-' ? -1 : 1, coef = m[2] === '' ? (m[3] ? 1 : null) : parseFloat(m[2]);
    if (coef == null) continue;
    out[{ 'x²': 'x2', x: 'x', y: 'y' }[m[3]] || 'c'] += sign * coef;
  }
  return out;
}
// value of "10√3", "10/√3", "√3", "√7/4", "7/25", "12"
function surdVal(s) {
  s = String(s).replace(/\s*(m|cm|cm²|cm³|°)$/, '').replace('−', '-');
  let m;
  if ((m = /^(\d*)√(\d+)\/(\d+)$/.exec(s))) return (m[1] ? +m[1] : 1) * Math.sqrt(+m[2]) / +m[3];
  if ((m = /^(\d+)\/√(\d+)$/.exec(s))) return +m[1] / Math.sqrt(+m[2]);
  if ((m = /^(\d*)√(\d+)$/.exec(s))) return (m[1] ? +m[1] : 1) * Math.sqrt(+m[2]);
  if ((m = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s))) return +m[1] / +m[2];
  if ((m = /^(-?\d+(?:\.\d+)?)√(\d+)$/.exec(s))) return +m[1] * Math.sqrt(+m[2]);
  return /^-?\d+(\.\d+)?$/.test(s) ? +s : NaN;
}
const TRIG = { 'sin 0': '0', 'sin 30': '1/2', 'sin 45': '1/√2', 'sin 60': '√3/2', 'sin 90': '1', 'cos 0': '1', 'cos 30': '√3/2', 'cos 45': '1/√2', 'cos 60': '1/2', 'cos 90': '0', 'tan 30': '1/√3', 'tan 45': '1', 'tan 60': '√3' };
const tan = { 30: 1 / Math.sqrt(3), 45: 1, 60: Math.sqrt(3) };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// each solver: [regex, (match, q) => expected answer string, optional 'numeric' compare]
const S = [
  [/^The decimal expansion of (\d+)\/(\d+) is$/, (m) => { let q = +m[2]; while (q % 2 === 0) q /= 2; while (q % 5 === 0) q /= 5; return q === 1 ? 'Terminating' : 'Non-terminating repeating'; }],
  [/^HCF\((\d+), (\d+)\) =$/, (m) => String(gcd(+m[1], +m[2]))],
  [/^LCM\((\d+), (\d+)\) =$/, (m) => String(+m[1] * +m[2] / gcd(+m[1], +m[2]))],
  [/^For (\d+) and (\d+), HCF =$/, (m) => String(gcd(+m[1], +m[2]))],
  [/^HCF\((\d+), (\d+)\) = (\d+)\. Their LCM is$/, (m) => { if (gcd(+m[1], +m[2]) !== +m[3]) throw new Error('stated HCF wrong'); return String(+m[1] * +m[2] / +m[3]); }],
  [/^The zero of p\(x\) = (.+) is$/, (m) => { const p = parsePoly(m[1]); return fmt(-p.c / p.x); }],
  [/^The sum of the zeros of (.+) is$/, (m) => { const p = parsePoly(m[1]); return fmt(-p.x / p.x2); }],
  [/^The product of the zeros of (.+) is$/, (m) => { const p = parsePoly(m[1]); return fmt(p.c / p.x2); }],
  [/^For (.+), the product of the zeros is$/, (m) => { const p = parsePoly(m[1]); return fmt(p.c / p.x2); }],
  [/^When p\(x\) = (.+) is divided by \(x ([−+]) (\d+)\), the remainder is$/, (m) => { const p = parsePoly(m[1]), c = (m[2] === '−' ? 1 : -1) * +m[3]; return fmt(p.x2 * c * c + p.x * c + p.c); }],
  [/^\(x \+ (\d+)\)\(x − (\d+)\) = x² − \?$/, (m) => String(+m[1] * +m[2])],
  [/^\(x \+ (\d+)\)² = x² \+ \?x \+ (\d+)$/, (m) => { if ((+m[1]) ** 2 !== +m[2]) throw new Error('constant wrong'); return String(2 * +m[1]); }],
  [/^Solve (.+) = (\S+) and (.+) = (\S+)\. ([xy]) =$/, (m) => { const a = parsePoly(m[1]), b = parsePoly(m[3]), c1 = N(m[2]), c2 = N(m[4]), det = a.x * b.y - b.x * a.y; const x = (c1 * b.y - c2 * a.y) / det, y = (a.x * c2 - b.x * c1) / det; return fmt(m[5] === 'x' ? x : y); }],
  [/^Solve (.+) = (\S+)\. x =$/, (m) => { const p = parsePoly(m[1]); return fmt((N(m[2]) - p.c) / p.x); }],
  [/^If x \+ y = (\S+) and x − y = (\S+), then ([xy]) =$/, (m) => fmt(m[3] === 'x' ? (N(m[1]) + N(m[2])) / 2 : (N(m[1]) - N(m[2])) / 2)],
  [/^(\d+) students took part in a quiz\. There were (\d+) more girls than boys\. How many boys\?$/, (m) => String((+m[1] - +m[2]) / 2)],
  [/^(\d+) pencils and (\d+) pens cost ₹(\d+); (\d+) pencils and (\d+) pens cost ₹(\d+)\. One pencil costs$/, (m) => { const [a1, b1, c1, a2, b2, c2] = m.slice(1).map(Number), det = a1 * b2 - a2 * b1; return '₹' + fmt((c1 * b2 - c2 * b1) / det); }],
  [/^(\d+) times a number, minus (\d+), is (\d+)\. The number is$/, (m) => fmt((+m[3] + +m[2]) / +m[1])],
  [/^One root of (.+) = 0 is$/, null, 'root'],
  [/^The discriminant of (.+) = 0 is$/, (m) => { const p = parsePoly(m[1]); return fmt(p.x * p.x - 4 * p.x2 * p.c); }],
  [/^The roots of (.+) = 0 are$/, (m) => { const p = parsePoly(m[1]), D = p.x * p.x - 4 * p.x2 * p.c; return D > 0 ? 'Two distinct real roots' : D === 0 ? 'Two equal real roots' : 'No real roots'; }],
  [/^In the AP (\S+), (\S+), (\S+), …, the (\d+)th term is$/, (m) => { const a = N(m[1]), d = N(m[2]) - a; if (N(m[3]) - N(m[2]) !== d) throw new Error('not an AP'); return fmt(a + (+m[4] - 1) * d); }],
  [/^The sum of the first (\d+) terms of the AP (\S+), (\S+), (\S+), … is$/, (m) => { const n = +m[1], a = N(m[2]), d = N(m[3]) - a; return fmt(n / 2 * (2 * a + (n - 1) * d)); }],
  [/^The common difference of the AP (\S+), (\S+), (\S+), (\S+), … is$/, (m) => fmt(N(m[2]) - N(m[1]))],
  [/^A right triangle has legs (\d+) cm and (\d+) cm\. Its hypotenuse is$/, (m) => fmt(Math.hypot(+m[1], +m[2])) + ' cm'],
  [/^ΔABC ~ ΔPQR and AB : PQ = (\d+) : 1\. The ratio of their areas is$/, (m) => `${(+m[1]) ** 2} : 1`],
  [/^A ladder (\d+) m long reaches a window (\d+) m high\. How far is its foot from the wall\?$/, (m) => fmt(Math.sqrt(m[1] ** 2 - m[2] ** 2)) + ' m'],
  [/^The distance between \((\S+), (\S+)\) and \((\S+), (\S+)\) is$/, (m) => fmt(Math.hypot(N(m[3]) - N(m[1]), N(m[4]) - N(m[2])))],
  [/^The midpoint of \((\S+), (\S+)\) and \((\S+), (\S+)\) is$/, (m) => `(${fmt((N(m[1]) + N(m[3])) / 2)}, ${fmt((N(m[2]) + N(m[4])) / 2)})`],
  [/^Are \((\S+), (\S+)\), \((\S+), (\S+)\) and \((\S+), (\S+)\) collinear\?$/, (m) => { const [x1, y1, x2, y2, x3, y3] = m.slice(1).map(N); return x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2) === 0 ? 'Yes' : 'No'; }],
  [/^(sin|cos|tan) (\d+)° =$/, (m) => TRIG[`${m[1]} ${m[2]}`]],
  [/^In a right triangle, the side opposite θ is (\d+), the adjacent side is (\d+) and the hypotenuse is (\d+)\. (sin|cos|tan) θ =$/, (m) => { const [o, a, h] = [+m[1], +m[2], +m[3]]; if (o * o + a * a !== h * h) throw new Error('not a right triangle'); return { sin: fr(o, h), cos: fr(a, h), tan: fr(o, a) }[m[4]]; }],
  [/^(sin²θ \+ cos²θ|sec²θ − tan²θ|cosec²θ − cot²θ) =$/, () => '1'],
  [/^sin θ \/ cos θ =$/, () => 'tan θ'], [/^1 \/ cos θ =$/, () => 'sec θ'],
  [/^ΔABC is right-angled at B, AB = (\d+) cm and BC = (\d+) cm\. sin A =$/, (m) => fr(+m[2], Math.hypot(+m[1], +m[2]))],
  [/^If sin A = 3\/4, then cos A =$/, () => '√7/4'],
  [/^From a point (\S+) m from the foot of a tower, the angle of elevation of its top is (\d+)°\. The height of the tower is$/, (m) => surdVal(m[1]) * tan[m[2]], 'num'],
  [/^A tower is (\d+) m high\. The angle of elevation of its top from a point on the ground is (\d+)°\. How far is the point from the tower\?$/, (m) => +m[1] / tan[m[2]], 'num'],
  [/^A point is (\d+) cm from the centre of a circle of radius (\d+) cm\. The length of the tangent from it is$/, (m) => fmt(Math.sqrt(m[1] ** 2 - m[2] ** 2)) + ' cm'],
  [/^The angle between a tangent and the radius at the point of contact is$/, () => '90°'],
  [/^From a point outside a circle, the tangents PA and PB are drawn\. If PA = (\d+) cm, then PB =$/, (m) => `${m[1]} cm`],
  [/^Tangents PA and PB from P touch a circle with centre O\. If ∠APB = (\d+)°, then ∠AOB =$/, (m) => `${180 - +m[1]}°`],
  [/^The area of a sector of angle (\d+)° in a circle of radius (\d+) cm is \(π = 22\/7\)$/, (m) => fmt(22 / 7 * m[2] ** 2 * m[1] / 360) + ' cm²'],
  [/^The area of a circle of radius (\S+) cm is \(π = 22\/7\)$/, (m) => fmt(22 / 7 * N(m[1]) ** 2) + ' cm²'],
  [/^The circumference of a circle of radius (\S+) cm is \(π = 22\/7\)$/, (m) => fmt(2 * 22 / 7 * N(m[1])) + ' cm'],
  [/^The curved surface area of a cylinder with r = (\d+) cm and h = (\d+) cm is \(π = 22\/7\)$/, (m) => fmt(2 * 22 / 7 * m[1] * m[2]) + ' cm²'],
  [/^The surface area of a sphere of radius (\S+) cm is \(π = 22\/7\)$/, (m) => fmt(4 * 22 / 7 * N(m[1]) ** 2) + ' cm²'],
  [/^The volume of a cube of edge (\d+) cm is$/, (m) => `${m[1] ** 3} cm³`],
  [/^The volume of a cylinder with r = (\d+) cm and h = (\d+) cm is \(π = 22\/7\)$/, (m) => fmt(22 / 7 * m[1] ** 2 * m[2]) + ' cm³'],
  [/^The volume of a cone with r = (\d+) cm and h = (\d+) cm is \(π = 22\/7\)$/, (m) => fmt(22 / 7 * m[1] ** 2 * m[2] / 3) + ' cm³'],
  [/^The mean of ([\d, ]+) is$/, (m) => fmt(mean(m[1].split(', ').map(Number)))],
  [/^The median of ([\d, ]+) is$/, (m) => { const a = m[1].split(', ').map(Number).sort((x, y) => x - y), n = a.length; return fmt(n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2); }],
  [/^The mode of ([\d, ]+) is$/, (m) => { const c = new Map(); for (const v of m[1].split(', ').map(Number)) c.set(v, (c.get(v) || 0) + 1); const top = Math.max(...c.values()), modes = [...c].filter(([, k]) => k === top); if (modes.length !== 1) throw new Error('no unique mode'); return String(modes[0][0]); }],
  [/^A bag has (\d+) red and (\d+) blue balls\. One ball is drawn at random\. P\(red\) =$/, (m) => fr(+m[1], +m[1] + +m[2])],
  [/^A fair die is thrown once\. P\((.+)\) =$/, (m) => { const f = { 'an even number': (k) => k % 2 === 0, 'a prime number': (k) => [2, 3, 5].includes(k), 'a number greater than 4': (k) => k > 4, 'a multiple of 3': (k) => k % 3 === 0, 'a number less than 7': (k) => k < 7, 'the number 5': (k) => k === 5 }[m[1]]; const c = [1, 2, 3, 4, 5, 6].filter(f).length; return c === 6 ? '1' : fr(c, 6); }],
  [/^One card is drawn from a well-shuffled deck of 52 cards\. P\((.+)\) =$/, (m) => fr({ 'a king': 4, 'a red card': 26, 'a face card': 12, 'a spade': 13, 'the ace of hearts': 1, 'a black king': 2 }[m[1]], 52)],
  [/^A box has (\d+) pens, of which (\d+) are defective\. One is drawn at random\. P\(it is good\) =$/, (m) => fr(+m[1] - +m[2], +m[1])],
];

let total = 0, fails = 0; const unrec = new Map(), perGen = [];
const failEx = [];
for (const ch of B.CHAPTERS) {
  ch.gens.forEach((gen, gi) => {
    let ok = 0;
    for (let r = 0; r < RUNS; r++) {
      const count = 2 + (r % 4); // 2…5 options, like the shooter's levels and the 4-option quiz
      let m; try { m = B.build(gen(), count, {}); } catch (e) { fails++; failEx.push(`${ch.id}#${gi} threw ${e.message}`); continue; }
      total++;
      const err = (why) => { fails++; if (failEx.length < 25) failEx.push(`${ch.id}#${gi}: ${why}\n    Q: ${m.q}\n    options: ${m.options.join(' | ')} (marked ${m.options[m.answer]})`); };
      if (m.options.some((o) => o == null || /NaN|undefined|Infinity|null/.test(String(o)))) { err('bad option text'); continue; }
      if (new Set(m.options).size !== m.options.length) { err('duplicate options'); continue; }
      if (m.options.length < Math.min(count, 2)) { err('too few options'); continue; }
      if (!(m.answer >= 0)) { err('answer missing'); continue; }
      const hit = S.find(([re]) => re.test(m.q));
      if (!hit) { unrec.set(`${ch.id}#${gi}`, m.q); continue; }
      const [re, solve, mode] = hit, mm = m.q.match(re);
      try {
        if (mode === 'root') {
          const p = parsePoly(mm[1]), isRoot = (s) => { const v = N(s); return Math.abs(p.x2 * v * v + p.x * v + p.c) < 1e-9; };
          if (!isRoot(m.options[m.answer])) { err('marked option is not a root'); continue; }
          if (m.options.filter(isRoot).length !== 1) { err('another root among the wrong options'); continue; }
        } else if (mode === 'num') {
          const want = solve(mm, m.q), vals = m.options.map(surdVal);
          if (Math.abs(vals[m.answer] - want) > 1e-6) { err(`expected ≈ ${want}`); continue; }
          if (vals.filter((v) => Math.abs(v - want) < 1e-6).length !== 1) { err('two options have the right value'); continue; }
        } else {
          const want = solve(mm, m.q);
          if (!B.same(m.options[m.answer], want)) { err(`expected ${want}`); continue; }
          if (m.options.filter((o) => B.same(o, want)).length !== 1) { err('two options equal the answer'); continue; }
        }
        ok++;
      } catch (e) { err('solver: ' + e.message); }
    }
    perGen.push(`${(ch.id + '#' + gi).padEnd(13)} ${ok}/${RUNS}`);
  });
}
for (const [g, q] of unrec) { fails++; failEx.push(`${g}: no independent solver for "${q}"`); }
console.log(perGen.join('\n'));
console.log(`\n${B.CHAPTERS.reduce((a, c) => a + c.gens.length, 0)} generators · ${total} questions checked · ${fails} failure${fails === 1 ? '' : 's'}`);
if (failEx.length) console.log('\n' + failEx.join('\n'));
process.exit(fails ? 1 : 0);
