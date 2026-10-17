"""Fonts for the Godot edition: Inter (interface), Literata (reading), JetBrains Mono, plus small Noto fallbacks, cut down to the
characters in godot/content (Greek, sub/superscripts, math) plus the Latin, Greek and symbol ranges a student's own PDF may use,
so the web download stays small. Also writes godot/assets/fonts/coverage.txt: every character the interface fonts can draw —
the PDF converter (tools/godot-import.mjs) turns anything else into its plain form (é → e) instead of an empty box.
Run after tools/godot-content.mjs whenever the content changes:   python tools/godot-fonts.py
Needs fontTools (pip install fonttools). Source fonts are downloaded once into tools/fonts-src/ (SIL OFL)."""
import glob
import json
import os
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'fonts-src')
OUT = os.path.join(ROOT, 'godot', 'assets', 'fonts')
FONTS = {
    'Inter[opsz,wght].ttf': 'ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    'JetBrainsMono[wght].ttf': 'ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
    'Literata[opsz,wght].ttf': 'ofl/literata/Literata%5Bopsz,wght%5D.ttf',
    'NotoSans[wdth,wght].ttf': 'ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf',
    'NotoSansMath-Regular.ttf': 'ofl/notosansmath/NotoSansMath-Regular.ttf',
    'NotoSansSymbols2-Regular.ttf': 'ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf',
}
os.makedirs(SRC, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
for name, url in FONTS.items():
    if not os.path.exists(os.path.join(SRC, name)):
        print('downloading', name)
        urllib.request.urlretrieve('https://github.com/google/fonts/raw/main/' + url, os.path.join(SRC, name))

chars = set()
def walk(x):
    if isinstance(x, str):
        chars.update(x)
    elif isinstance(x, dict):
        for v in x.values():
            walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)
for f in glob.glob(os.path.join(ROOT, 'godot', 'content', '**', '*.json'), recursive=True):
    walk(json.load(open(f, encoding='utf-8')))
# + everything the interface itself writes
chars |= {chr(c) for c in range(32, 127)} | set('·•–—‘’“”…×÷±√≤≥≠≈°→←↑↓↔αβγδεθλμπρσφωΔΩΣ₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₊₋½¼¾€₹✓✗◈★§')
# + what a student's own PDF may hold: accented Latin, Greek, punctuation, super/subscripts, currency, letterlike
# symbols, fractions, arrows, maths, technical brackets, shapes
for lo, hi in [(0xA0, 0x17F), (0x370, 0x3FF), (0x2010, 0x205E), (0x2070, 0x209C), (0x20A0, 0x20C0), (0x2100, 0x218B),
               (0x2190, 0x21FF), (0x2200, 0x22FF), (0x2300, 0x23FF), (0x25A0, 0x25FF), (0x2600, 0x266F), (0x2700, 0x27BF), (0x27C0, 0x27EF)]:
    chars |= {chr(c) for c in range(lo, hi + 1)}
chars = {c for c in chars if 32 <= ord(c) < 0x1F000}


def cut(src, dst, want):
    f = TTFont(os.path.join(SRC, src))
    cmap = f.getBestCmap()
    keep = sorted(ord(c) for c in want if ord(c) in cmap)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=keep)
    s.subset(f)
    # the app only varies the weight: pin every other axis (optical size, width) at its default — the same
    # look as before, without the variation data
    if 'fvar' in f:
        pin = {a.axisTag: a.defaultValue for a in f['fvar'].axes if a.axisTag != 'wght'}
        if pin:
            instancer.instantiateVariableFont(f, pin, inplace=True)
    f.save(os.path.join(OUT, dst))
    print(f'{dst}: {len(keep)} characters, {os.path.getsize(os.path.join(OUT, dst)) // 1024} KB')
    return {chr(u) for u in keep}


inter = cut('Inter[opsz,wght].ttf', 'Inter.ttf', chars)
rest = chars - inter
# reading face (notes, pages, questions): whatever Literata lacks falls back to Inter, then Noto
cut('Literata[opsz,wght].ttf', 'Literata.ttf', chars)
cut('JetBrainsMono[wght].ttf', 'JetBrainsMono.ttf', {chr(c) for c in range(32, 127)} | set('·•–—…×÷±→←✓✗°₂'))
drawn = set(inter)
for src, dst in [('NotoSans[wdth,wght].ttf', 'NotoSans-fallback.ttf'), ('NotoSansMath-Regular.ttf', 'NotoSansMath-fallback.ttf'), ('NotoSansSymbols2-Regular.ttf', 'NotoSymbols2-fallback.ttf')]:
    got = cut(src, dst, rest)
    rest -= got
    drawn |= got
need = {c for c in chars if ord(c) < 0x2010 or c in set('·•–—‘’“”…×÷±√≤≥≠≈°→←↑↓↔₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₊₋½¼¾€₹✓✗◈★§')}
print('characters no font has:', len(rest), '(of the content and the basic ranges: ' + (' '.join(f'U+{ord(c):04X}' for c in sorted(rest & need)) or 'none') + ')')
with open(os.path.join(OUT, 'coverage.txt'), 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(c for c in drawn if ord(c) >= 0x80)))
print(f'coverage.txt: {sum(1 for c in drawn if ord(c) >= 0x80)} characters beyond ASCII')
